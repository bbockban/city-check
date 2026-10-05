"""Resuelve parcela Montevideo (WFS) a partir de IFC + padrón opcional."""

from __future__ import annotations

import asyncio
from typing import Any

from pyproj import Transformer

from schemas.cadastral_parcel import CadastralParcelFeature, NeighborhoodInfo
from schemas.ifc_parcel_context import (
    EastNorthM,
    IfcParcelContextResponse,
    LonLat,
)
from services import wfs_montevideo
from services.ifc_georeference import extract_site_coordinates
from services.ifc_zoning_compliance import analyze_ifc_bytes_for_compliance

FOS_PLAN_EPSG = 32721
FOS_PLAN_AUTHORITY = "EPSG:32721"

# Prefijo de error al parsear IFC (debe coincidir con la comprobación en
# routers/ifc.py).
IFC_PARSE_ERROR_PREFIX = "No se pudo analizar el archivo IFC"


async def build_ifc_parcel_context_response(
    resolve_mode: str, raw: dict[str, Any], ifc_bytes: bytes
) -> IfcParcelContextResponse:
    """Arma la respuesta pública a partir del dict WFS interno."""
    warnings: list[str] = []
    muni = wfs_montevideo.municipality_code_from_parcel_payload(raw)
    if raw.get("found_parcel") and not raw.get("found_neighborhood"):
        warnings.append(
            "La capa de municipios no devolvió feature en el centroide de la parcela."
        )
    if raw.get("found_parcel") and muni is None:
        warnings.append(
            "No se pudo leer el código IMM (`municipio`) del payload de "
            "barrios/municipios."
        )

    centroid_ll = raw.get("centroid")
    wgs: LonLat | None = None
    utm: EastNorthM | None = None
    if isinstance(centroid_ll, dict):
        try:
            lon = float(centroid_ll["lon"])
            lat = float(centroid_ll["lat"])
        except (KeyError, TypeError, ValueError):
            pass
        else:
            wgs = LonLat(lon=lon, lat=lat)
            tf = Transformer.from_crs("EPSG:4326", FOS_PLAN_AUTHORITY, always_xy=True)
            e, n = tf.transform(lon, lat)
            utm = EastNorthM(easting=float(e), northing=float(n))

    parcel_obj: CadastralParcelFeature | None = None
    p = raw.get("parcel")
    if isinstance(p, dict):
        parcel_obj = CadastralParcelFeature.model_validate(p)

    neighborhood_obj: NeighborhoodInfo | None = None
    nbr = raw.get("neighborhood")
    if isinstance(nbr, dict):
        neighborhood_obj = NeighborhoodInfo.model_validate(nbr)

    parcel_occupied_percent: float | None = None
    if parcel_obj and parcel_obj.geometry:
        analysis = await asyncio.to_thread(
            analyze_ifc_bytes_for_compliance, ifc_bytes, parcel_obj.geometry
        )
        parcel_occupied_percent = analysis.get("fos_percent")
        warnings.extend(list(analysis.get("warnings") or []))

    return IfcParcelContextResponse(
        resolve_mode=resolve_mode,
        parcel_id=str(raw.get("parcel_id") or ""),
        found_parcel=bool(raw.get("found_parcel")),
        found_neighborhood=bool(raw.get("found_neighborhood")),
        parcel=parcel_obj,
        neighborhood=neighborhood_obj,
        municipality_code=muni,
        parcel_occupied_percent=parcel_occupied_percent,
        target_occupied_percent=parcel_occupied_percent,
        centroid_wgs84=wgs,
        centroid_utm_plan_m=utm,
        fos_plan_projection_epsg=FOS_PLAN_EPSG,
        fos_plan_projection_authority=FOS_PLAN_AUTHORITY,
        warnings=warnings,
    )


async def resolve_montevideo_parcel_payload(
    ifc_bytes: bytes,
    parcel_id: str | None,
) -> tuple[str, dict[str, Any]]:
    """
    Devuelve ``(resolve_mode, payload)`` con la misma forma que
    ``get_cadastral_parcel_with_neighborhood`` / ``get_cadastral_parcel_at_point``.

    ``resolve_mode`` es ``"parcel_id"`` o ``"ifc_site_at_point"``.
    """
    stripped = (parcel_id or "").strip()
    if stripped:
        raw = await wfs_montevideo.get_cadastral_parcel_with_neighborhood(stripped)
        return "parcel_id", raw

    try:
        coords = await asyncio.to_thread(extract_site_coordinates, ifc_bytes)
    except Exception as e:
        return "ifc_site_at_point", {
            "parcel_id": "",
            "found_parcel": False,
            "found_neighborhood": False,
            "parcel": None,
            "neighborhood": None,
            "centroid": None,
            "error": f"{IFC_PARSE_ERROR_PREFIX}: {e}",
        }

    if not coords:
        return "ifc_site_at_point", {
            "parcel_id": "",
            "found_parcel": False,
            "found_neighborhood": False,
            "parcel": None,
            "neighborhood": None,
            "centroid": None,
            "error": (
                "No hay coordenadas en IfcSite; enviá parcel_id o georreferenciá el IFC"
            ),
        }

    raw = await wfs_montevideo.get_cadastral_parcel_at_point(
        coords["lon"], coords["lat"]
    )
    return "ifc_site_at_point", raw
