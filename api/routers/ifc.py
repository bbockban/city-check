"""IFC georeferencing router."""

import asyncio
import json
import os
import re
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas.ifc_parcel_context import IfcParcelContextResponse, ParcelIdResponse
from schemas.zoning_compliance import (
    ParameterComplianceRow,
    ZoningComplianceResponse,
)
from services import wfs_montevideo
from services.ifc_bcf import build_bcf_zip
from services.ifc_georeference import extract_site_coordinates, georeference_ifc
from services.ifc_parcel_resolution import (
    IFC_PARSE_ERROR_PREFIX,
    build_ifc_parcel_context_response,
    resolve_montevideo_parcel_payload,
)
from services.ifc_zoning_compliance import analyze_and_evaluate_zoning_compliance
from services.zoning_queries import (
    fetch_zoning_area_by_municipality_code,
    pick_regulatory_scope_for_general_limits,
)

router = APIRouter(
    prefix="/api/v1/ifc",
    tags=["ifc"],
)


def _force_fail_enabled() -> bool:
    """Allow `force_fail` only when explicitly enabled via env (debug only)."""
    return bool(os.getenv("BCF_FORCE_FAIL_ENABLED", "").strip())


@router.post(
    "/site-coordinates",
    summary="Extraer coordenadas de IfcSite desde un IFC",
    description=(
        "Devuelve RefLatitude/RefLongitude del primer IfcSite, o 404 si no hay."
    ),
)
async def extract_site_coordinates_endpoint(file: UploadFile) -> dict:
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser .ifc",
        )

    ifc_bytes = await file.read()
    try:
        coords = await asyncio.to_thread(extract_site_coordinates, ifc_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{IFC_PARSE_ERROR_PREFIX}: {e}",
        ) from e

    if not coords:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontraron coordenadas de sitio (IfcSite) en el IFC",
        )

    return coords


@router.post(
    "/parcel-id",
    response_model=ParcelIdResponse,
    summary="Resolver padrón catastral desde la georeferenciación del IFC",
    description=(
        "Extrae las coordenadas de `IfcSite` (o `IfcMapConversion`) y resuelve "
        "el padrón catastral Montevideo via WFS. Una sola llamada WFS, sin barrio "
        "ni FOS."
    ),
)
async def resolve_parcel_id_from_ifc(file: UploadFile) -> ParcelIdResponse:
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser .ifc",
        )

    ifc_bytes = await file.read()
    try:
        coords = await asyncio.to_thread(extract_site_coordinates, ifc_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{IFC_PARSE_ERROR_PREFIX}: {e}",
        ) from e

    if not coords:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No se encontraron coordenadas de sitio "
                "(IfcSite/IfcMapConversion) en el IFC"
            ),
        )

    try:
        parcel_id = await wfs_montevideo.get_parcel_id_at_point(
            coords["lon"], coords["lat"]
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error HTTP del WFS: {e.response.status_code}",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo contactar el WFS: {e!s}",
        ) from e

    if not parcel_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No se encontró parcela en las coordenadas del IFC "
                f"({coords['lat']:.6f}, {coords['lon']:.6f})"
            ),
        )

    return ParcelIdResponse(parcel_id=parcel_id)


@router.post(
    "/parcel-context",
    response_model=IfcParcelContextResponse,
    summary="IFC + WFS: padrón, municipio IMM y CRS de plano para FOS",
    description=(
        "**Multipart:** `file` (`.ifc`) y form opcional **`parcel_id`** (padrón).\n\n"
        "- Con **`parcel_id`**: misma resolución que "
        "`GET /api/v1/parcels/montevideo/{parcel_id}`.\n"
        "- Sin **`parcel_id`**: lee `IfcSite` y resuelve parcela como "
        "`GET /api/v1/parcels/montevideo/at-point`.\n\n"
        "Incluye **`parcel`** (properties + geometry GeoJSON del padrón), "
        "**`neighborhood`** (barrio si hubo hit), código **`municipio`** (IMM), "
        "centroide WGS84 y **EPSG:32721** (misma proyección que el FOS en "
        "`ifc_zoning_compliance`)."
    ),
)
async def resolve_ifc_parcel_context(
    file: UploadFile,
    parcel_id: Annotated[
        str | None,
        Form(
            description=(
                "Padrón catastral Montevideo. Si se omite o va vacío, se usa IfcSite."
            ),
        ),
    ] = None,
) -> IfcParcelContextResponse:
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser .ifc",
        )

    ifc_bytes = await file.read()

    try:
        resolve_mode, raw = await resolve_montevideo_parcel_payload(
            ifc_bytes, parcel_id
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error HTTP del WFS: {e.response.status_code}",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo contactar el WFS: {e!s}",
        ) from e

    if not raw.get("found_parcel"):
        err = str(raw.get("error") or "")
        if err.startswith(IFC_PARSE_ERROR_PREFIX):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=err,
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=err or "Parcela no encontrada",
        )

    return await build_ifc_parcel_context_response(resolve_mode, raw, ifc_bytes)


async def _run_validate_zoning(
    *,
    file: UploadFile,
    parcel_id: str | None,
    municipality_code: str | None,
    parcel_geometry_json: str | None,
    db: AsyncSession,
    force_fail: bool = False,
) -> tuple[bytes, ZoningComplianceResponse, dict[str, Any]]:
    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser .ifc",
        )

    ifc_bytes = await file.read()

    municipality_code_resolved: str
    raw_parcel_id: str
    geometry: dict[str, Any]

    muni_in = (municipality_code or "").strip()
    if muni_in:
        municipality_code_resolved = muni_in.upper()
        raw_parcel_id = (parcel_id or "").strip()
        geometry = {}
        pgj = (parcel_geometry_json or "").strip()
        if pgj:
            try:
                parsed = json.loads(pgj)
            except json.JSONDecodeError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"parcel_geometry_json no es JSON válido: {e}",
                ) from e
            if not isinstance(parsed, dict):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "parcel_geometry_json debe ser un objeto JSON "
                        "(geometría GeoJSON)."
                    ),
                )
            geometry = parsed
        elif raw_parcel_id:
            try:
                raw_by_id = await wfs_montevideo.get_cadastral_parcel_with_neighborhood(
                    raw_parcel_id
                )
            except httpx.HTTPStatusError as e:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Error HTTP del WFS: {e.response.status_code}",
                ) from e
            except httpx.RequestError as e:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"No se pudo contactar el WFS: {e!s}",
                ) from e

            if not raw_by_id.get("found_parcel"):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=raw_by_id.get("error") or "Parcela no encontrada",
                )
            parcel = raw_by_id.get("parcel") or {}
            geometry = parcel.get("geometry") or {}
    else:
        try:
            _resolve_mode, raw = await resolve_montevideo_parcel_payload(
                ifc_bytes, parcel_id
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error HTTP del WFS: {e.response.status_code}",
            ) from e
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"No se pudo contactar el WFS: {e!s}",
            ) from e

        if not raw.get("found_parcel"):
            err = str(raw.get("error") or "")
            if err.startswith(IFC_PARSE_ERROR_PREFIX):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=err,
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=err or "Parcela no encontrada",
            )

        muni_wfs = wfs_montevideo.municipality_code_from_parcel_payload(raw)
        if not muni_wfs:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "No se pudo obtener el código de municipio IMM desde el WFS "
                    "(se esperaba `municipio` en la capa de barrios en el centroide "
                    "de la parcela)."
                ),
            )
        municipality_code_resolved = muni_wfs
        raw_parcel_id = str(raw.get("parcel_id") or "")
        parcel = raw.get("parcel") or {}
        geometry = parcel.get("geometry") or {}
        if not geometry:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La parcela no tiene geometría para comparar la huella.",
            )

    zone = await fetch_zoning_area_by_municipality_code(db, municipality_code_resolved)
    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Ninguna zona urbanística activa incluye el código de municipio "
                f"'{municipality_code_resolved}'"
            ),
        )

    scope = pick_regulatory_scope_for_general_limits(zone)
    if scope is None or not scope.norm_limits:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "La zona urbanística no tiene límites normativos configurados para "
                "las verificaciones de cumplimiento."
            ),
        )

    manzana_geometry: dict[str, Any] | None = None
    _g_centroid = wfs_montevideo.geometry_centroid(geometry)
    if _g_centroid:
        try:
            manzana_geometry = await wfs_montevideo.get_manzana_geometry_at_point(
                _g_centroid[0], _g_centroid[1]
            )
        except (httpx.HTTPStatusError, httpx.RequestError):
            pass

    try:
        analysis, raw_checks = await asyncio.to_thread(
            analyze_and_evaluate_zoning_compliance,
            ifc_bytes,
            geometry,
            scope,
            manzana_geometry=manzana_geometry,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{IFC_PARSE_ERROR_PREFIX}: {e}",
        ) from e

    if not raw_checks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No hay límites normativos aplicables para evaluar.",
        )

    checks = [ParameterComplianceRow.model_validate(row) for row in raw_checks]
    if force_fail:
        checks = [
            c.model_copy(
                update={
                    "compliant": False,
                    "notes": (f"[force_fail] {c.notes}" if c.notes else "[force_fail]"),
                }
            )
            for c in checks
        ]
    compliant_states = [c.compliant for c in checks]
    if any(state is False for state in compliant_states):
        overall = False
    elif all(state is True for state in compliant_states):
        overall = True
    else:
        overall = None
    warnings = list(analysis.get("warnings") or [])

    response = ZoningComplianceResponse(
        municipality_code=municipality_code_resolved,
        parcel_id=raw_parcel_id,
        zoning_area_id=zone.id,
        zoning_area_name=zone.name,
        overall_compliant=overall,
        parameter_checks=checks,
        warnings=warnings,
    )
    return ifc_bytes, response, analysis


@router.post(
    "/validate-zoning",
    response_model=ZoningComplianceResponse,
    summary="Validar métricas del IFC frente a la zonificación del municipio",
    description=(
        "**Multipart form:** `file` (required `.ifc`).\n\n"
        "Si enviás **`municipality_code`** (código IMM, ej. `CH`, `A`), "
        "la zona se resuelve en PostgreSQL. En este modo, si además viene "
        "**`parcel_geometry_json`**, se usa esa geometría y no se llama al WFS. "
        "Si no hay geometría inline pero viene **`parcel_id`**, se usa WFS solo "
        "para traer geometría de parcela (FOS/retiro); si no viene, se valida "
        "al menos altura.\n\n"
        "**Con WFS** (si **`municipality_code`** va vacío): opcional **`parcel_id`** "
        "(padrón) o coordenadas del **`IfcSite`** para parcela y `municipio` vía WFS."
    ),
)
async def validate_ifc_against_zoning(
    file: UploadFile,
    parcel_id: Annotated[
        str | None,
        Form(
            description=(
                "Padrón Montevideo. Con municipality_code: trae geometría de parcela "
                "para FOS/retiro. Sin municipality_code: resolución WFS completa."
            ),
        ),
    ] = None,
    municipality_code: Annotated[
        str | None,
        Form(
            description=(
                "Código IMM del municipio (ej. CH) para resolver zona en PostgreSQL."
            ),
        ),
    ] = None,
    parcel_geometry_json: Annotated[
        str | None,
        Form(
            description=(
                "GeoJSON Geometry como JSON string (WGS84). Se prioriza en modo "
                "municipality_code para evitar consultas WFS."
            ),
        ),
    ] = None,
    force_fail: Annotated[
        bool,
        Form(
            description=(
                "Debug: marca todos los checks como no cumplidos para probar el flujo."
            ),
        ),
    ] = False,
    db: AsyncSession = Depends(get_db),
) -> ZoningComplianceResponse:
    _, response, _analysis = await _run_validate_zoning(
        file=file,
        parcel_id=parcel_id,
        municipality_code=municipality_code,
        parcel_geometry_json=parcel_geometry_json,
        db=db,
        force_fail=force_fail and _force_fail_enabled(),
    )
    return response


@router.post(
    "/validate-zoning/bcf",
    summary="Descargar BCF (.bcfzip) con los hallazgos de la validación",
    description=(
        "Mismo contrato que `/validate-zoning`. Corre la misma validación y "
        "devuelve un BCF 2.1 `.bcfzip` con un topic por chequeo no cumplido. "
        "Las validaciones cumplidas devuelven un BCF con metadatos del proyecto "
        "y cero topics."
    ),
    response_class=Response,
    responses={
        200: {"content": {"application/zip": {}}},
    },
)
async def download_validate_zoning_bcf(
    file: UploadFile,
    parcel_id: Annotated[str | None, Form()] = None,
    municipality_code: Annotated[str | None, Form()] = None,
    parcel_geometry_json: Annotated[str | None, Form()] = None,
    force_fail: Annotated[
        bool,
        Form(
            description=(
                "Debug: marca todos los checks como no cumplidos para probar el flujo."
            ),
        ),
    ] = False,
    db: AsyncSession = Depends(get_db),
) -> Response:
    _, response, analysis = await _run_validate_zoning(
        file=file,
        parcel_id=parcel_id,
        municipality_code=municipality_code,
        parcel_geometry_json=parcel_geometry_json,
        db=db,
        force_fail=force_fail and _force_fail_enabled(),
    )
    bcf_bytes = build_bcf_zip(
        response=response,
        ifc_filename=file.filename or "model.ifc",
        ifc_building_guid=analysis.get("ifc_building_guid"),
        bbox_min_max_m=analysis.get("bbox_min_max_m"),
    )
    safe_parcel = (
        re.sub(r"[^A-Za-z0-9_-]+", "", response.parcel_id or "") or "validation"
    )
    filename = f"validation_{safe_parcel}.bcfzip"
    return Response(
        content=bcf_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/georeference/{parcel_id}",
    summary="Georreferenciar un IFC usando una parcela de Montevideo",
    description=(
        "Recibe un IFC y un id de parcela (padrón). Obtiene el centroide vía WFS "
        "Montevideo y escribe RefLatitude/RefLongitude en IfcSite. Devuelve el IFC "
        "modificado."
    ),
    response_class=Response,
    responses={
        200: {"content": {"application/octet-stream": {}}},
    },
)
async def georeference_ifc_endpoint(
    parcel_id: str,
    file: UploadFile,
) -> Response:
    if not parcel_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parcel_id no puede estar vacío",
        )

    if not file.filename or not file.filename.lower().endswith(".ifc"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo debe ser .ifc",
        )

    # Fetch parcel centroid from WFS
    try:
        raw = await wfs_montevideo.get_cadastral_parcel_with_neighborhood(
            parcel_id.strip()
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error HTTP del WFS: {e.response.status_code}",
        ) from e
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo contactar el WFS: {e!s}",
        ) from e

    if not raw.get("found_parcel"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=raw.get("error") or "Parcela no encontrada",
        )

    centroid = raw.get("centroid")
    if not centroid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudo calcular el centroide de la parcela",
        )

    # Read uploaded IFC and inject coordinates
    ifc_bytes = await file.read()
    try:
        modified = await asyncio.to_thread(
            georeference_ifc, ifc_bytes, lat=centroid["lat"], lon=centroid["lon"]
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    output_name = file.filename.replace(".ifc", "_georef.ifc")

    return Response(
        content=modified,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{output_name}"'},
    )
