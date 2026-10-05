"""Service to inject geographic coordinates into an IFC file's IfcSite."""

import tempfile
from pathlib import Path

import ifcopenshell
from pyproj import CRS, Transformer

_DEFAULT_PROJECTED_CRS = "EPSG:32721"  # WGS 84 / UTM zone 21S (Montevideo)


def _decimal_to_dms(decimal_degrees: float) -> tuple[int, int, int, int]:
    """Convert decimal degrees to (degrees, minutes, seconds, millionths)."""
    negative = decimal_degrees < 0
    dd = abs(decimal_degrees)
    degrees = int(dd)
    minutes_float = (dd - degrees) * 60
    minutes = int(minutes_float)
    seconds_float = (minutes_float - minutes) * 60
    seconds = int(seconds_float)
    millionths = int(round((seconds_float - seconds) * 1_000_000))

    if negative:
        degrees = -degrees

    return degrees, minutes, seconds, millionths


def _dms_to_decimal(dms: tuple[int, ...]) -> float:
    """Convert (degrees, minutes, seconds, millionths) to decimal degrees."""
    if not dms:
        return 0.0
    deg = dms[0]
    minutes = dms[1] if len(dms) > 1 else 0
    seconds = dms[2] if len(dms) > 2 else 0
    millionths = dms[3] if len(dms) > 3 else 0
    sign = -1 if deg < 0 else 1
    millionths_scale = 3_600_000_000
    dec = abs(deg) + minutes / 60 + seconds / 3600 + millionths / millionths_scale
    return sign * dec


def _extract_map_conversion_coords(model: ifcopenshell.file) -> dict[str, float] | None:
    """
    IFC4 precise georef: IfcMapConversion → target CRS → WGS84.
    IfcMapConversion supersedes IfcSite.RefLatitude/RefLongitude when present.
    """
    map_conversions = model.by_type("IfcMapConversion")
    if not map_conversions:
        return None

    mc = map_conversions[0]
    eastings = mc.Eastings
    northings = mc.Northings
    if eastings is None or northings is None:
        return None

    target_crs = getattr(mc, "TargetCRS", None)
    if not target_crs:
        return None

    crs_name = getattr(target_crs, "Name", None) or ""
    if not crs_name:
        return None

    try:
        src = CRS.from_user_input(crs_name)
        tf = Transformer.from_crs(src, "EPSG:4326", always_xy=True)
        lon, lat = tf.transform(float(eastings), float(northings))
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            return None
        return {"lat": lat, "lon": lon}
    except Exception:
        return None


def extract_site_coordinates(ifc_bytes: bytes) -> dict[str, float] | None:
    """
    Return {"lat": ..., "lon": ...} extracted from the IFC file.

    Priority:
    1. IfcMapConversion (IFC4 precise georef, respects target CRS)
    2. IfcSite.RefLatitude/RefLongitude (IFC2x3 DMS fallback)
    """
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.ifc"
        input_path.write_bytes(ifc_bytes)
        model = ifcopenshell.open(str(input_path))

        coords = _extract_map_conversion_coords(model)
        if coords:
            return coords

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


def _wgs84_to_projected(lat: float, lon: float, target_crs: str) -> tuple[float, float]:
    tf = Transformer.from_crs("EPSG:4326", target_crs, always_xy=True)
    easting, northing = tf.transform(lon, lat)
    return float(easting), float(northing)


def _update_or_create_map_conversion(
    model: ifcopenshell.file, lat: float, lon: float
) -> None:
    """Write Eastings/Northings into IfcMapConversion, creating it if absent.

    No-op for IFC2x3 files (IfcMapConversion is IFC4+).
    """
    if not model.schema.upper().startswith("IFC4"):
        return

    map_conversions = model.by_type("IfcMapConversion")

    if map_conversions:
        mc = map_conversions[0]
        target_crs = getattr(mc, "TargetCRS", None)
        if not target_crs:
            target_crs = model.create_entity(
                "IfcProjectedCRS",
                Name=_DEFAULT_PROJECTED_CRS,
            )
            mc.TargetCRS = target_crs
        crs_name = getattr(target_crs, "Name", None) or _DEFAULT_PROJECTED_CRS
        try:
            easting, northing = _wgs84_to_projected(lat, lon, crs_name)
        except Exception:
            easting, northing = _wgs84_to_projected(lat, lon, _DEFAULT_PROJECTED_CRS)
        mc.Eastings = easting
        mc.Northings = northing
    else:
        contexts = [
            c
            for c in model.by_type("IfcGeometricRepresentationContext")
            if not c.is_a("IfcGeometricRepresentationSubContext")
            and getattr(c, "ContextType", None) == "Model"
        ]
        source_crs = contexts[0] if contexts else None

        projected_crs = model.create_entity(
            "IfcProjectedCRS",
            Name=_DEFAULT_PROJECTED_CRS,
        )
        easting, northing = _wgs84_to_projected(lat, lon, _DEFAULT_PROJECTED_CRS)
        model.create_entity(
            "IfcMapConversion",
            SourceCRS=source_crs,
            TargetCRS=projected_crs,
            Eastings=easting,
            Northings=northing,
            OrthogonalHeight=0.0,
            XAxisAbscissa=1.0,
            XAxisOrdinate=0.0,
            Scale=1.0,
        )


def georeference_ifc(ifc_bytes: bytes, lat: float, lon: float) -> bytes:
    """
    Read an IFC file, set RefLatitude/RefLongitude on IfcSite and write
    IfcMapConversion (IFC4+), return the modified file as bytes.
    """
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.ifc"
        output_path = Path(tmp) / "output.ifc"

        input_path.write_bytes(ifc_bytes)
        model = ifcopenshell.open(str(input_path))

        sites = model.by_type("IfcSite")
        if not sites:
            raise ValueError("No se encontró IfcSite en el archivo IFC")

        site = sites[0]
        site.RefLatitude = _decimal_to_dms(lat)
        site.RefLongitude = _decimal_to_dms(lon)

        _update_or_create_map_conversion(model, lat, lon)

        model.write(str(output_path))
        return output_path.read_bytes()
