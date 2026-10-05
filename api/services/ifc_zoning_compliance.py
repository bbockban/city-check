"""Measure IFC building metrics and compare them to zoning norm limits."""

from __future__ import annotations

import math
import struct
import tempfile
from pathlib import Path
from types import ModuleType
from typing import Any, NamedTuple, cast

import ifcopenshell
import ifcopenshell.util.element as element_util
import ifcopenshell.util.geolocation as geolocation_util
import ifcopenshell.util.placement as placement_util
import ifcopenshell.util.unit as unit_util
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, MultiPoint, Polygon

from models.zoning import RegulatoryScope
from services.compliance_metrics import STANDARD_METRIC_NAMES
from services.compliance_metrics.context import MeasurementContext
from services.rule_expression import evaluate_rule

ifc_geom: ModuleType | None = None
try:
    import ifcopenshell.geom as _ifc_geom
except ImportError:
    pass
else:
    ifc_geom = _ifc_geom

# Cap mesh vertex accumulation to limit RAM on very large IFC geometry streams.
_DEFAULT_MESH_VERTEX_BUDGET = 350_000


class IfcGeometrySample(NamedTuple):
    """Plan (x, y) and Z samples in IFC world coordinates (file length units)."""

    xy_m: list[tuple[float, float]]
    z_min: float | None
    z_max: float | None


def unit_scale_to_metres(
    model: ifcopenshell.file,
    verts: list[tuple[float, float, float]] | None = None,
) -> float:
    """
    Return the file-unit → metre scale factor, with a fallback for files that
    declare millimetres but whose vertex coordinates are clearly in metres.

    Some IFC files declare LENGTHUNIT = MILLIMETRE (scale=0.001) but store
    geometry values already in metres.  When the declared scale would produce a
    building whose maximum axis span is < 1 m we assume the values are in
    metres and return 1.0 instead.
    """
    try:
        scale = float(unit_util.calculate_unit_scale(model))
    except Exception:
        return 1.0
    if verts and scale < 1.0:
        it = iter(verts)
        x0, y0, z0 = next(it)
        min_x = max_x = x0
        min_y = max_y = y0
        min_z = max_z = z0
        for x, y, z in it:
            if x < min_x:
                min_x = x
            elif x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            elif y > max_y:
                max_y = y
            if z < min_z:
                min_z = z
            elif z > max_z:
                max_z = z
        raw_max_span = max(max_x - min_x, max_y - min_y, max_z - min_z)
        if raw_max_span * scale < 1.0 and raw_max_span > 1.0:
            return 1.0
    return scale


def _dms_to_decimal(dms: tuple[int, ...]) -> float:
    """Convert IFC DMS tuple to decimal degrees."""
    if not dms:
        return 0.0
    deg = dms[0]
    minutes = dms[1] if len(dms) > 1 else 0
    seconds = dms[2] if len(dms) > 2 else 0
    millionths = dms[3] if len(dms) > 3 else 0
    sign = -1 if deg < 0 else 1
    dec = abs(deg) + minutes / 60 + seconds / 3600 + millionths / 3_600_000_000
    return sign * dec


def _site_coordinates_from_model(model: ifcopenshell.file) -> dict[str, float] | None:
    """Read lat/lon from first IfcSite in an already-open IFC model."""
    sites = model.by_type("IfcSite")
    if not sites:
        return None
    site = sites[0]
    ref_lat = site.RefLatitude
    ref_lon = site.RefLongitude
    if not ref_lat or not ref_lon:
        return None
    lat = _dms_to_decimal(ref_lat)
    lon = _dms_to_decimal(ref_lon)
    if lat == 0.0 and lon == 0.0:
        return None
    return {"lat": lat, "lon": lon}


def _length_to_meters(model: ifcopenshell.file, value: float) -> float:
    try:
        scale = float(unit_util.calculate_unit_scale(model))
    except Exception:
        scale = 1.0
    return float(value) * scale


# --- ALTURA · Nivel 1: leer la altura directo del Pset del IfcBuilding ---
def _height_from_psets(model: ifcopenshell.file) -> float | None:
    buildings = model.by_type("IfcBuilding")
    if not buildings:
        return None
    bld = buildings[0]
    psets = element_util.get_psets(bld)
    for data in psets.values():
        if not isinstance(data, dict):
            continue
        for key in ("Height", "TotalHeight", "height", "total_height"):
            if key in data and data[key] is not None:
                try:
                    raw = float(data[key])
                except (TypeError, ValueError):
                    continue
                return _length_to_meters(model, raw)
    return None


def _top_storey_qto_height_m(model: ifcopenshell.file, storey: Any) -> float | None:
    """Own height (Qto GrossHeight/Height/NetHeight) of a single storey, in metres."""
    psets = element_util.get_psets(storey, qtos_only=True)
    for data in psets.values():
        if not isinstance(data, dict):
            continue
        for key in ("GrossHeight", "Height", "NetHeight"):
            if key in data and data[key] is not None:
                try:
                    raw = float(data[key])
                except (TypeError, ValueError):
                    continue
                if raw > 0:
                    return _length_to_meters(model, raw)
    return None


# Height fallback estimates from geometry rather than a declared Qto — read a
# smaller vertex sample than the FOS/setback hull needs, since only the Z
# extent matters here.
_TOP_STOREY_MESH_VERTEX_BUDGET = 50_000


def _top_storey_mesh_height_m(
    model: ifcopenshell.file, top_elevation_file_units: float
) -> float | None:
    """
    Own height of the top storey estimated from its mesh Z-extent.

    Excludes ``IfcSite`` so terrain/site representation below grade cannot
    inflate the estimate; only the Z span *above* the top storey's own base
    elevation is attributed to it. Used only when the file has no Qto height
    for that storey.
    """
    verts = mesh_vertices_world_file_units(
        model, max_points=_TOP_STOREY_MESH_VERTEX_BUDGET, exclude=["IfcSite"]
    )
    if not verts:
        return None
    # Convert both ends of the subtraction with the same (possibly
    # heuristic-corrected) scale so a mm-declared-but-metres-stored file
    # can't mix scales and produce a wildly wrong height.
    scale = unit_scale_to_metres(model, verts)
    z_max_m = max(z for _, _, z in verts) * scale
    top_elevation_m = top_elevation_file_units * scale
    height = z_max_m - top_elevation_m
    return height if height > 0 else None


_HEIGHT_NOTE_MESSAGES: dict[str, str] = {
    "altura_ultimo_piso_estimada_por_malla": (
        "La altura del último piso se estimó a partir de la malla 3D (el "
        "modelo no declaraba su altura propia)."
    ),
    "altura_por_pisos_sin_altura_propia_del_ultimo_piso_puede_subestimar": (
        "La altura se calculó por elevación de pisos; el último piso no "
        "declara altura propia, por lo que el resultado podría estar "
        "subestimado."
    ),
    "altura_estimada_por_rango_vertical_de_malla": (
        "La altura se estimó a partir del rango vertical de la malla 3D (el "
        "modelo no declara pisos ni altura)."
    ),
    "no_se_pudo_inferir_altura_del_edificio": (
        "No se pudo determinar la altura del edificio a partir del modelo IFC."
    ),
}


# --- ALTURA · Nivel 2: elevación del último piso menos la del primero,
# + la altura propia de ese último piso (si no, el cálculo queda corto) ---
def _height_from_storeys(model: ifcopenshell.file) -> tuple[float | None, str | None]:
    """
    Elevation span of the storeys, plus the top storey's own height.

    The elevation span alone only reaches the *base* of the top storey, so it
    systematically undercounts buildings whose topmost storey (attic, roof
    level) has any height of its own. Closes that gap with the storey's own
    Qto height when declared, else a mesh-based estimate (excluding
    ``IfcSite``); if neither is available, returns the (undercounting) span
    with a note so callers know the value may be short.
    """
    storeys = model.by_type("IfcBuildingStorey")
    dated: list[tuple[float, Any, float]] = []
    for s in storeys:
        if s.Elevation is None:
            continue
        try:
            raw_elevation = float(s.Elevation)
            dated.append((_length_to_meters(model, raw_elevation), s, raw_elevation))
        except (TypeError, ValueError):
            continue
    if len(dated) < 2:
        return None, None
    dated.sort(key=lambda item: item[0])
    top_elevation_m, top_storey, top_elevation_raw = dated[-1]
    span = top_elevation_m - dated[0][0]

    top_height = _top_storey_qto_height_m(model, top_storey)
    if top_height is not None:
        return span + top_height, None

    mesh_top_height = _top_storey_mesh_height_m(model, top_elevation_raw)
    if mesh_top_height is not None:
        return span + mesh_top_height, "altura_ultimo_piso_estimada_por_malla"

    return (
        span,
        "altura_por_pisos_sin_altura_propia_del_ultimo_piso_puede_subestimar",
    )


def _min_storey_elevation_m(model: ifcopenshell.file) -> float | None:
    """Lowest IfcBuildingStorey.Elevation in metres (GEOBIM-style base reference)."""
    storeys = model.by_type("IfcBuildingStorey")
    elevations: list[float] = []
    for s in storeys:
        if s.Elevation is None:
            continue
        try:
            elevations.append(_length_to_meters(model, float(s.Elevation)))
        except (TypeError, ValueError):
            continue
    if not elevations:
        return None
    return min(elevations)


Vec3 = tuple[float, float, float]


def _ifc_building_global_id(model: ifcopenshell.file) -> str | None:
    try:
        buildings = model.by_type("IfcBuilding")
    except Exception:
        return None
    if not buildings:
        return None
    raw = getattr(buildings[0], "GlobalId", None)
    return str(raw) if raw else None


def _bbox_min_max_m(
    verts: list[tuple[float, float, float]],
    unit_scale: float,
) -> tuple[Vec3, Vec3] | None:
    if not verts:
        return None
    it = iter(verts)
    x0, y0, z0 = next(it)
    min_x = max_x = x0
    min_y = max_y = y0
    min_z = max_z = z0
    for x, y, z in it:
        if x < min_x:
            min_x = x
        elif x > max_x:
            max_x = x
        if y < min_y:
            min_y = y
        elif y > max_y:
            max_y = y
        if z < min_z:
            min_z = z
        elif z > max_z:
            max_z = z
    s = unit_scale
    return (
        (min_x * s, min_y * s, min_z * s),
        (max_x * s, max_y * s, max_z * s),
    )


def _decimate_vertices(
    verts: list[tuple[float, float, float]], max_points: int
) -> list[tuple[float, float, float]]:
    if len(verts) <= max_points:
        return verts
    step = max(1, math.ceil(len(verts) / max_points))
    return verts[::step]


def mesh_vertices_world_file_units(
    model: ifcopenshell.file,
    *,
    max_points: int | None = _DEFAULT_MESH_VERTEX_BUDGET,
    exclude: list[str] | None = None,
) -> list[tuple[float, float, float]]:
    """Mesh vertices in IFC world / project file length units.

    ``max_points`` bounds retained vertices: after each geometry chunk, the list
    is decimated so models with very large meshes do not grow without limit before
    downstream sampling (basal slice / hull).

    ``exclude`` skips entire IFC types (e.g. ``["IfcSite"]`` to drop terrain /
    site-representation geometry that would otherwise pollute a Z-extent read).
    """
    out: list[tuple[float, float, float]] = []
    if ifc_geom is None:
        return out
    settings = ifc_geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    try:
        iterator = ifc_geom.iterator(settings, model, 4, exclude=exclude)
    except Exception:
        return out
    if not iterator.initialize():
        return out
    while True:
        chunk = iterator.get()
        if chunk is not None:
            try:
                geom = chunk.geometry
                verts = getattr(geom, "verts", None)
                if verts:
                    n = len(verts)
                    step = 3
                    for i in range(0, n - step + 1, step):
                        out.append(
                            (
                                float(verts[i]),
                                float(verts[i + 1]),
                                float(verts[i + 2]),
                            )
                        )
                else:
                    buf = getattr(geom, "verts_buffer", None)
                    if buf:
                        mv = memoryview(buf)
                        step = 12  # 3 × float32
                        for i in range(0, len(mv) - step + 1, step):
                            x, y, z = struct.unpack_from("fff", mv, i)
                            out.append((float(x), float(y), float(z)))
            except Exception:
                pass
            if max_points is not None and len(out) > max_points:
                out = _decimate_vertices(out, max_points)
        if not iterator.next():
            break
    return out


def _sample_geometry_world_xy_z(model: ifcopenshell.file) -> IfcGeometrySample:
    verts = mesh_vertices_world_file_units(model)
    if not verts:
        return IfcGeometrySample([], None, None)
    xy = [(x, y) for x, y, _ in verts]
    zs = [z for _, _, z in verts]
    return IfcGeometrySample(xy, min(zs), max(zs))


def point_to_line_distance_2d(
    p: tuple[float, float],
    line_a: tuple[float, float],
    line_b: tuple[float, float],
) -> float:
    """
    Perpendicular distance from p to the infinite line through a–b.

    Same construction as ``PT2lineDistance`` in TU Delft GEOBIM_Tool
    (cross-product magnitude over segment length).
    """
    ax, ay = line_a
    bx, by = line_b
    px, py = p
    dx, dy = bx - ax, by - ay
    len_sq = dx * dx + dy * dy
    if len_sq < 1e-18:
        return math.hypot(px - ax, py - ay)
    return abs(dy * px - dx * py + bx * ay - by * ax) / math.sqrt(len_sq)


def _exterior_ring_lon_lat(
    geometry: dict[str, Any],
) -> list[tuple[float, float]] | None:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if not coords:
        return None
    if gtype == "Polygon" and coords and coords[0]:
        ring = coords[0]
    elif gtype == "MultiPolygon" and coords and coords[0] and coords[0][0]:
        ring = coords[0][0]
    else:
        return None
    out: list[tuple[float, float]] = []
    for p in ring:
        if len(p) >= 2:
            out.append((float(p[0]), float(p[1])))
    return out if len(out) >= 4 else None


def parcel_polygon_local_m(
    geometry: dict[str, Any],
) -> tuple[Polygon, float, tuple[float, float]] | None:
    """
    Parcel in a local metric frame (meters), origin at the parcel UTM centroid.

    Returns ``(polygon_local, area_m2, (easting, northing))`` for EPSG:32721.
    """
    ring_ll = _exterior_ring_lon_lat(geometry)
    if not ring_ll:
        return None
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32721", always_xy=True)
    utm_points: list[tuple[float, float]] = []
    for lon, lat in ring_ll:
        utm_points.append(transformer.transform(lon, lat))
    poly_abs = Polygon(utm_points)
    if not poly_abs.is_valid:
        poly_abs = poly_abs.buffer(0)
    if poly_abs.is_empty:
        return None
    c = poly_abs.centroid
    cx, cy = float(c.x), float(c.y)
    local = [(x - cx, y - cy) for x, y in utm_points]
    poly = Polygon(local)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty:
        return None
    return poly, float(poly.area), (cx, cy)


def manzana_boundary_local_m(
    manzana_geometry: dict[str, Any],
    parcel_centroid_en: tuple[float, float],
) -> LineString | None:
    """
    Manzana exterior ring in the same local UTM frame as the parcel.

    Handles both Polygon and MultiPolygon (uses first polygon's exterior ring).
    Returns None for invalid or empty geometry.
    """
    ring_ll = _exterior_ring_lon_lat(manzana_geometry)
    if not ring_ll:
        return None
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32721", always_xy=True)
    cx, cy = parcel_centroid_en
    local: list[tuple[float, float]] = []
    for lon, lat in ring_ll:
        e, n = transformer.transform(lon, lat)
        local.append((e - cx, n - cy))
    if len(local) < 2:
        return None
    return LineString(local)


# --- RETIRO · Paso: un lado de la parcela es FRENTE cuando al menos el 50%
# de su longitud cae en una franja de 1,5 m del límite de manzana (por
# longitud, no por un punto: un lado medianero puede tocar la esquina y no
# ser frente si el resto de su recorrido se aleja de la manzana) ---
def front_edges_local_m(
    parcel_poly_local: Polygon,
    manzana_boundary_local: LineString,
    tolerance_m: float = 1.5,
    min_overlap_fraction: float = 0.5,
) -> MultiLineString | LineString | None:
    """
    Parcel edges that lie on the manzana boundary (= street-facing edges).

    An edge is classified as frente only when at least ``min_overlap_fraction``
    of its length falls within ``tolerance_m`` of the manzana boundary. This
    rejects medianero edges whose endpoints happen to sit on manzana corners
    (dist=0) but whose body runs through the block interior (overlap~0%).

    Returns MultiLineString for corner lots, LineString for single, None if none.
    """
    front: list[LineString] = []
    coords = list(parcel_poly_local.exterior.coords)
    buffer = manzana_boundary_local.buffer(tolerance_m)
    for i in range(len(coords) - 1):
        edge = LineString([coords[i], coords[i + 1]])
        if edge.length < 1e-6:
            continue
        overlap = edge.intersection(buffer)
        qualifies = not overlap.is_empty and (
            overlap.length >= min_overlap_fraction * edge.length
        )
        if qualifies:
            front.append(edge)
    if not front:
        return None
    if len(front) == 1:
        return front[0]
    return MultiLineString([list(e.coords) for e in front])


def _site_object_world_xy_file_units(
    model: ifcopenshell.file,
) -> tuple[float, float] | None:
    """IfcSite placement origin (x, y) in world file units, if available."""
    sites = model.by_type("IfcSite")
    if not sites:
        return None
    try:
        m = placement_util.get_local_placement(sites[0].ObjectPlacement)
    except Exception:
        return None
    if m is None:
        return None
    try:
        return float(m[0][3]), float(m[1][3])
    except (TypeError, IndexError, ValueError):
        return None


def _vertex_to_map_en(
    model: ifcopenshell.file,
    x: float,
    y: float,
    z: float,
    *,
    site_en: tuple[float, float] | None,
    site_xy_file: tuple[float, float] | None,
    unit_scale: float,
) -> tuple[float, float] | None:
    """
    Map one mesh vertex to approximate map easting/northing (metres).

    Uses IfcMapConversion / Helmert via IfcOpenShell when present; otherwise
    shifts IFC world (x, y) by the IfcSite world placement and adds WGS84→UTM
    for the site (rotation between engineering and map axes assumed zero).

    For the site fallback, ``x - sx`` is in **file length units**; it is
    multiplied by ``unit_scale`` so the offset matches ``site_en`` in metres.
    """
    if geolocation_util.get_helmert_transformation_parameters(model) is not None:
        try:
            e, n, _h = geolocation_util.auto_xyz2enh(model, x, y, z)
            return float(e), float(n)
        except Exception:
            return None
    if site_en is None or site_xy_file is None:
        return None
    sx, sy = site_xy_file
    e0, n0 = site_en
    return e0 + (x - sx) * unit_scale, n0 + (y - sy) * unit_scale


# --- FOS · Paso 2: ubicar el plano de corte (elevación mínima de piso + 1 m,
# o z_min de la malla + 1 m sin pisos declarados) y retener los vértices cerca ---
def _basal_slice_vertices_file_units(
    model: ifcopenshell.file,
    verts: list[tuple[float, float, float]],
    scale: float | None = None,
) -> list[tuple[float, float, float]]:
    """
    Vertices near the GEOBIM-style cutting plane: min storey elevation + 1 m,
    else mesh z minimum + 1 m (see GEOBIM_Tool ``cutting_height = z_min + 1.0``).
    """
    if len(verts) < 3:
        return verts
    if scale is None:
        scale = unit_scale_to_metres(model, verts)
    zs_m = [z * scale for _, _, z in verts]
    z_min_m = min(zs_m)
    z_max_m = max(zs_m)
    span_m = z_max_m - z_min_m
    if span_m <= 1e-6:
        return verts
    storey_min_m = _min_storey_elevation_m(model)
    offset_m = 1.0
    if storey_min_m is not None:
        z_cut_m = storey_min_m + offset_m
    else:
        z_cut_m = z_min_m + offset_m
    z_cut_m = max(z_cut_m, z_min_m + 0.05 * span_m)
    z_cut_m = min(z_cut_m, z_max_m - 0.05 * span_m)
    half_bands_m = (0.25, 0.5, 1.0, 1.5, 2.5)
    chosen: list[tuple[float, float, float]] = []
    for hb in half_bands_m:
        chosen = [
            v for v, zm in zip(verts, zs_m, strict=True) if abs(zm - z_cut_m) <= hb
        ]
        if len(chosen) >= 12:
            break
    if len(chosen) < 12:
        z_lo_m = z_min_m + 0.08 * span_m
        chosen = [v for v, zm in zip(verts, zs_m, strict=True) if zm <= z_lo_m]
    if len(chosen) < 3:
        chosen = verts
    return chosen


def _convex_hull_polygon_xy(xy: list[tuple[float, float]]) -> Polygon | None:
    if len(xy) < 3:
        return None
    hull = MultiPoint(xy).convex_hull
    if hull.is_empty or hull.geom_type != "Polygon":
        return None
    return cast(Polygon, hull)


def _concave_hull_polygon_xy(
    xy: list[tuple[float, float]], ratio: float = 0.2
) -> Polygon | None:
    """
    Concave hull from planar points (Shapely GEOS concave_hull).

    Falls back to ``None`` if geometry is empty/degenerate; caller can then use
    convex hull fallback.
    """
    if len(xy) < 4:
        return None
    cloud = MultiPoint(xy)
    try:
        hull = shapely.concave_hull(cloud, ratio=ratio)
    except Exception:
        return None
    if hull.is_empty or hull.geom_type != "Polygon":
        return None
    poly = cast(Polygon, hull)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty or poly.geom_type != "Polygon":
        return None
    return cast(Polygon, poly)


def _plan_hull_polygon_xy(
    xy: list[tuple[float, float]], *, prefer_concave: bool
) -> Polygon | None:
    """
    Plan hull helper: prefer concave hull when requested, else convex hull.

    Concave hull reduces the overestimation bias of convex hull on irregular
    footprints (setback/FOS proxies), but can fail on sparse/noisy samples.
    """
    if prefer_concave:
        poly = _concave_hull_polygon_xy(xy, ratio=0.2)
        if poly is not None:
            return poly
    return _convex_hull_polygon_xy(xy)


# --- FOS · Paso 3: envolver esos vértices con un casco CONVEXO (nunca
# cóncavo, que deforma huellas con mallas de densidad de vértices dispareja) ---
def footprint_hull_for_fos_m(
    model: ifcopenshell.file,
    verts: list[tuple[float, float, float]],
) -> Polygon | None:
    """
    Basal-slice plan hull in metres (IFC horizontal scale).

    Uses convex hull: IFC wall meshes have non-uniform vertex density (clusters
    around openings and corners) which causes concave hull algorithms to produce
    severely underestimated footprints. Convex hull is stable and consistent
    with the GEOBIM basal-slice approach.
    """
    if not verts:
        return None
    scale = unit_scale_to_metres(model, verts)
    slice_v = _basal_slice_vertices_file_units(model, verts, scale)
    slice_v = _decimate_vertices(slice_v, 12_000)
    xy_m = [(x * scale, y * scale) for x, y, _ in slice_v]
    return _plan_hull_polygon_xy(xy_m, prefer_concave=False)


def footprint_hull_parcel_local_m(
    model: ifcopenshell.file,
    verts: list[tuple[float, float, float]],
    parcel_centroid_en: tuple[float, float],
    *,
    site_en: tuple[float, float] | None,
    site_xy_file: tuple[float, float] | None,
    unit_scale: float,
) -> Polygon | None:
    """
    Basal-slice footprint in the same local UTM frame as the parcel
    (origin at parcel centroid), when map coordinates can be resolved.

    Uses convex hull for the same reason as ``footprint_hull_for_fos_m``: IFC
    wall meshes have non-uniform vertex density, which causes concave hull
    algorithms to severely underestimate the footprint.
    """
    if not verts:
        return None
    cx_p, cy_p = parcel_centroid_en
    slice_v = _basal_slice_vertices_file_units(model, verts, unit_scale)
    slice_v = _decimate_vertices(slice_v, 12_000)
    local_xy: list[tuple[float, float]] = []
    for x, y, z in slice_v:
        en = _vertex_to_map_en(
            model,
            x,
            y,
            z,
            site_en=site_en,
            site_xy_file=site_xy_file,
            unit_scale=unit_scale,
        )
        if en is None:
            return None
        local_xy.append((en[0] - cx_p, en[1] - cy_p))
    hull = _plan_hull_polygon_xy(local_xy, prefer_concave=False)
    if hull is None:
        return None
    if not hull.is_valid:
        hull = hull.buffer(0)
    if hull.is_empty or hull.geom_type != "Polygon":
        return None
    return cast(Polygon, hull)


def min_setback_m(parcel_local: Polygon, footprint_local: Polygon) -> float:
    """
    Minimum clearance (m) between lot line and building outline in plan.

    Uses **boundary–boundary** distance. ``Polygon.distance`` would be 0 when
    one polygon lies inside the other without touching the exterior ring.
    """
    return float(footprint_local.boundary.distance(parcel_local.boundary))


# --- FOS · Paso 4: FOS % = área huella (casco convexo) / área parcela × 100 ---
def fos_percent(footprint_local: Polygon, parcel_area_m2: float) -> float | None:
    if parcel_area_m2 <= 0:
        return None
    return float(footprint_local.area / parcel_area_m2 * 100.0)


def evaluate_against_limits(
    *,
    ctx: MeasurementContext,
    scope: RegulatoryScope,
) -> list[dict[str, Any]]:
    """Generic loop: for each norm limit in the scope, ask the metric plugin for
    the measured value, inject the limit value, and evaluate the stored rule
    expression."""
    rows: list[dict[str, Any]] = []
    for norm_limit in scope.norm_limits:
        param = norm_limit.urban_parameter
        measured = ctx.measure(param.metric_key)
        rule_ctx: dict[str, Any] = {
            param.metric_key: measured,
            param.limit_key: float(norm_limit.limit_value),
        }
        compliant: bool | None = (
            evaluate_rule(param.rule_expression, rule_ctx)
            if measured is not None
            else None
        )
        rows.append(
            {
                "parameter_kind": param.parameter_kind,
                "parameter_name": param.name,
                "unit": param.unit,
                "limit_value": norm_limit.limit_value,
                "measured_value": round(measured, 3) if measured is not None else None,
                "compliant": compliant,
                "notes": norm_limit.description,
            }
        )
    return rows


def _analysis_from_context(ctx: MeasurementContext) -> dict[str, Any]:
    """Run the standard plugins and flatten their results into the analysis dict."""
    measured = {name: ctx.measure(name) for name in STANDARD_METRIC_NAMES}
    parcel = ctx.parcel
    footprint = ctx.basal_footprint_m if parcel is not None else None
    details = ctx.details
    return {
        "height_m": measured["altura_m"],
        "height_note": details.get("height_note"),
        "fos_percent": measured["fos_porc"],
        "fos_note": details.get("fos_note"),
        "fos_formula": "fos_porcentaje = area_huella_m2 / area_parcela_m2 * 100",
        "footprint_area_m2": float(footprint.area) if footprint else None,
        "footprint_perimeter_m": float(footprint.length) if footprint else None,
        "min_setback_m": details.get("min_setback_m"),
        "setback_note": details.get("setback_note"),
        "retiro_frontal_m": details.get("retiro_frontal_m"),
        "setback_frontal_note": details.get("setback_frontal_note"),
        "parcel_area_m2": parcel.area_m2 if parcel else None,
        "parcel_perimeter_m": (
            float(parcel.polygon.length) if parcel and footprint else None
        ),
        "warnings": list(ctx.warnings),
        "ifc_building_guid": _ifc_building_global_id(ctx.model),
        "bbox_min_max_m": _bbox_min_max_m(ctx.verts, ctx.unit_scale),
    }


def analyze_ifc_model_for_compliance(
    model: ifcopenshell.file,
    parcel_geometry: dict[str, Any],
    manzana_geometry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Métricas de cumplimiento desde un IFC ya abierto.

    Cada parámetro lo mide su plugin en ``services/compliance_metrics/plugins``
    a partir de un ``MeasurementContext`` compartido.
    """
    ctx = MeasurementContext(model, parcel_geometry, manzana_geometry)
    return _analysis_from_context(ctx)


def analyze_ifc_bytes_for_compliance(
    ifc_bytes: bytes, parcel_geometry: dict[str, Any]
) -> dict[str, Any]:
    """
    Open IFC from bytes, derive metrics vs parcel polygon, return raw numbers + notes.

    If ``parcel_geometry`` is missing or invalid, still returns **height** from the
    IFC; FOS and setback stay null with explanatory notes.

    Footprint area (FOS proxy) follows GEOBIM_Tool-style basal slicing
    (``IfcBuildingStorey`` minimum elevation + 1 m, else mesh ``z_min + 1 m``),
    then a planar convex hull — closer to a ground-floor cut than a full-envelope hull.

    Setback uses the same slice projected into EPSG:32721 with the parcel centroid
    as origin when ``IfcMapConversion`` (or legacy map PSet) is present, or when
    ``IfcSite`` ``RefLatitude``/``RefLongitude`` plus site placement allow a
    metre shift (engineering axes assumed aligned with UTM).

    NOTE: this returns a minimum lot-line clearance proxy in plan, not a
    strict normative "retiro frontal" tied to a specific frontage edge.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.ifc"
        path.write_bytes(ifc_bytes)
        model = ifcopenshell.open(str(path))
        return analyze_ifc_model_for_compliance(model, parcel_geometry)


def analyze_and_evaluate_zoning_compliance(
    ifc_bytes: bytes,
    parcel_geometry: dict[str, Any],
    scope: RegulatoryScope,
    manzana_geometry: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Single IFC open: full analysis + compliance rows from scope limits."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "model.ifc"
        path.write_bytes(ifc_bytes)
        model = ifcopenshell.open(str(path))
        ctx = MeasurementContext(model, parcel_geometry, manzana_geometry)
        analysis = _analysis_from_context(ctx)
        rows = evaluate_against_limits(ctx=ctx, scope=scope)
        # Plugins beyond the standard ones may add warnings while evaluating.
        analysis["warnings"] = list(ctx.warnings)
    return analysis, rows
