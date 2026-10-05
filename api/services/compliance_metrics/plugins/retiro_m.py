"""Retiro frontal (m): distancia de la huella a los lados de frente de la parcela.

Si no se puede identificar el frente, cae al retiro mínimo a cualquier lado.
"""

from __future__ import annotations

import math
from typing import Any

import ifcopenshell.util.geolocation as geolocation_util
from pyproj import Transformer
from shapely.geometry import Polygon

from services import ifc_zoning_compliance as izc
from services.compliance_metrics.context import MeasurementContext, ParcelLocal

# Below this fraction of the footprint area lying inside the parcel, the
# retiro is likely an artifact of a mis-registered IfcMapConversion rather
# than a real clearance measurement.
_FOOTPRINT_OUTSIDE_PARCEL_WARN_FRACTION = 0.5


def _footprint_in_parcel_frame(
    ctx: MeasurementContext, parcel: ParcelLocal
) -> tuple[Polygon | None, bool]:
    """
    RETIRO · Paso 1: georreferenciar la huella en el marco de la parcela.

    Usa IfcMapConversion o, si falta, IfcSite; descarta el sitio si queda a
    más de 2 km de la parcela: es un dato claramente erróneo (predio
    equivocado, coordenadas placeholder), no una imprecisión razonable.

    Devuelve ``(huella, has_map_conversion)``.
    """
    model = ctx.model
    site_xy_file = izc._site_object_world_xy_file_units(model)
    site_en: tuple[float, float] | None = None
    use_site_fallback = True
    has_map_conversion = (
        geolocation_util.get_helmert_transformation_parameters(model) is not None
    )
    coords_ll = (
        izc._site_coordinates_from_model(model) if not has_map_conversion else None
    )
    if coords_ll is not None:
        tf = Transformer.from_crs("EPSG:4326", "EPSG:32721", always_xy=True)
        site_en = tf.transform(coords_ll["lon"], coords_ll["lat"])
        dx = float(site_en[0]) - float(parcel.centroid_en[0])
        dy = float(site_en[1]) - float(parcel.centroid_en[1])
        if math.hypot(dx, dy) > 2_000.0:
            use_site_fallback = False
            ctx.warn(
                "La ubicación geográfica del modelo IFC está a más de 2 km del "
                "padrón seleccionado; se omitió el cálculo del retiro para evitar "
                "un resultado sin sentido. Verificá la georreferenciación del "
                "modelo al exportarlo desde tu software BIM."
            )
        if site_xy_file is None and model.by_type("IfcSite"):
            site_xy_file = (0.0, 0.0)
            ctx.warn(
                "El modelo no define una posición utilizable para su punto de "
                "referencia (IfcSite); el retiro se calculó usando el origen del "
                "modelo como ancla, lo que puede introducir un margen de error."
            )
    if not (has_map_conversion or use_site_fallback):
        return None, has_map_conversion
    footprint = izc.footprint_hull_parcel_local_m(
        model,
        ctx.verts,
        parcel.centroid_en,
        site_en=site_en,
        site_xy_file=site_xy_file,
        unit_scale=ctx.unit_scale,
    )
    return footprint, has_map_conversion


def _warn_if_footprint_outside_parcel(
    ctx: MeasurementContext, parcel: ParcelLocal, footprint: Polygon
) -> None:
    if footprint.area <= 0:
        return
    try:
        overlap_area = parcel.polygon.intersection(footprint).area
    except Exception:
        return
    overlap_fraction = overlap_area / footprint.area
    if overlap_fraction < _FOOTPRINT_OUTSIDE_PARCEL_WARN_FRACTION:
        ctx.warn(
            "La huella del edificio cae mayormente fuera del "
            "padrón (solo un "
            f"{overlap_fraction * 100:.0f}% queda dentro); el "
            "retiro puede no ser representativo. Revisá que el "
            "modelo esté correctamente ubicado y orientado "
            "respecto a este padrón."
        )


def _retiro_frontal_m(
    ctx: MeasurementContext, parcel: ParcelLocal, footprint: Polygon
) -> float | None:
    if ctx.manzana_geometry is None:
        return None
    manzana_boundary = izc.manzana_boundary_local_m(
        ctx.manzana_geometry, parcel.centroid_en
    )
    if manzana_boundary is None:
        return None
    # RETIRO · Paso 2: clasificar los lados de la parcela como
    # frente/medianero/fondo contra la franja de 1,5 m.
    front_edges = izc.front_edges_local_m(parcel.polygon, manzana_boundary)
    if front_edges is None:
        ctx.details["setback_frontal_note"] = (
            "retiro_frontal_no_determinado_sin_borde_de_frente_en_manzana"
        )
        ctx.warn(
            "No se pudo identificar cuál lado de la parcela da al "
            "frente (a partir de la manzana), por lo que no se "
            "calculó el retiro frontal."
        )
        return None
    # RETIRO · Paso 3: retiro = distancia mínima borde a borde entre la
    # huella y los lados de frente.
    return float(footprint.boundary.distance(front_edges))


def execute(ctx: MeasurementContext, **_kwargs: Any) -> float | None:
    parcel = ctx.parcel
    if parcel is None:
        return None
    footprint, has_map_conversion = _footprint_in_parcel_frame(ctx, parcel)
    if ctx.basal_footprint_m is None:
        ctx.details["setback_note"] = "geometria_de_malla_insuficiente_para_huella"
        return None
    if footprint is None:
        ctx.details["setback_note"] = (
            "retiro_requiere_ifc_map_conversion_o_coordenadas_ifcsite_con_ubicacion"
        )
        ctx.warn(
            "No se pudo calcular el retiro a los límites de la parcela: el "
            "modelo IFC no incluye información de georreferenciación ni una "
            "ubicación de referencia (IfcSite) cercana y coherente con el "
            "padrón. Agregá esta información al exportar el modelo desde tu "
            "software BIM."
        )
        return None
    _warn_if_footprint_outside_parcel(ctx, parcel, footprint)
    min_setback = izc.min_setback_m(parcel.polygon, footprint)
    ctx.details["min_setback_m"] = min_setback
    retiro_frontal = _retiro_frontal_m(ctx, parcel, footprint)
    ctx.details["retiro_frontal_m"] = retiro_frontal
    if not has_map_conversion:
        ctx.warn(
            "El retiro se calculó usando la ubicación de referencia del "
            "modelo (IfcSite) en lugar de coordenadas de proyecto; un "
            "norte o una rotación mal configurados en el modelo pueden "
            "afectar la precisión del valor."
        )
    ctx.warn(
        "Retiro aproximado: es la distancia mínima entre el contorno de "
        "planta baja del edificio y el límite más cercano de la parcela; "
        "no es necesariamente el retiro frontal exigido por la normativa "
        "(que se calcula aparte cuando es posible)."
    )
    return retiro_frontal if retiro_frontal is not None else min_setback
