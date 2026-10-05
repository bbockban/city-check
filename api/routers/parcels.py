"""WFS router: Montevideo cadastral parcels."""

from collections.abc import Coroutine
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from schemas.cadastral_parcel import CadastralParcelWithNeighborhoodResponse
from services import wfs_montevideo

router = APIRouter(
    prefix="/api/v1/parcels",
    tags=["parcels"],
)


async def _resolve_parcel(
    coro: Coroutine[Any, Any, dict[str, Any]],
) -> CadastralParcelWithNeighborhoodResponse:
    """Call a wfs_montevideo coroutine, translate errors to HTTP, and validate."""
    try:
        raw = await coro
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

    return CadastralParcelWithNeighborhoodResponse.model_validate(raw)


@router.get(
    "/montevideo/at-point",
    response_model=CadastralParcelWithNeighborhoodResponse,
    summary="Parcela catastral en un punto geográfico (con barrio)",
    description=(
        "WFS Montevideo: polígono y atributos de la parcela que contiene (lon, lat), "
        "más barrio/municipio."
    ),
)
async def get_montevideo_parcel_at_point(
    lon: float = Query(..., description="Longitud (EPSG:4326)"),
    lat: float = Query(..., description="Latitud (EPSG:4326)"),
) -> CadastralParcelWithNeighborhoodResponse:
    return await _resolve_parcel(wfs_montevideo.get_cadastral_parcel_at_point(lon, lat))


@router.get(
    "/montevideo/{parcel_id}",
    response_model=CadastralParcelWithNeighborhoodResponse,
    summary="Parcela catastral por id (padrón o gid), con barrio",
    description=(
        "WFS Montevideo: polígono y atributos de la parcela, más barrio (capa de "
        "municipios) según el centroide de la parcela."
    ),
)
async def get_montevideo_parcel_with_neighborhood(
    parcel_id: str,
) -> CadastralParcelWithNeighborhoodResponse:
    if not parcel_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="parcel_id no puede estar vacío",
        )

    return await _resolve_parcel(
        wfs_montevideo.get_cadastral_parcel_with_neighborhood(parcel_id.strip())
    )
