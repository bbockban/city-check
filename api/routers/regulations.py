"""Read-only API for urban zoning areas and general-regime norm limits."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.zoning import ZoningArea
from schemas.zoning import ZoningAreaRead, ZoningAreaSummaryRead
from services.zoning_queries import (
    fetch_zoning_area_by_municipality_code,
    zoning_area_load_options,
)

router = APIRouter(prefix="/api/v1/regulations", tags=["regulations"])


@router.get("/zoning-areas", response_model=list[ZoningAreaSummaryRead])
async def list_zoning_areas(db: AsyncSession = Depends(get_db)) -> list[ZoningArea]:
    result = await db.execute(
        select(ZoningArea)
        .where(ZoningArea.is_active.is_(True))
        .order_by(ZoningArea.match_priority, ZoningArea.id)
    )

    return list(result.scalars().all())


@router.get(
    "/zoning-areas/by-municipality/{municipality_code}", response_model=ZoningAreaRead
)
async def resolve_zoning_area_by_municipality(
    municipality_code: str, db: AsyncSession = Depends(get_db)
) -> ZoningArea:
    code = municipality_code.strip().upper()
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="municipality_code no puede estar vacío",
        )
    zone = await fetch_zoning_area_by_municipality_code(db, code)

    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Ninguna zona urbanística activa incluye el código de municipio "
                f"'{code}'"
            ),
        )
    return zone


@router.get("/zoning-areas/{zoning_area_id}", response_model=ZoningAreaRead)
async def get_zoning_area(
    zoning_area_id: int, db: AsyncSession = Depends(get_db)
) -> ZoningArea:
    stmt = (
        select(ZoningArea)
        .options(zoning_area_load_options())
        .where(ZoningArea.id == zoning_area_id)
    )
    result = await db.execute(stmt)
    zone = result.scalar_one_or_none()

    if zone is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona urbanística no encontrada",
        )
    return zone
