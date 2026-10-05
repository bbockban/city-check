"""Async SQLAlchemy helpers for zoning areas and norm limits."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.zoning import (
    RegulatoryScope,
    RegulatoryScopeType,
    ScopeNormLimit,
    ZoningArea,
)


def zoning_area_load_options():
    """Eager-load scopes, norm limits, and urban parameters."""
    return (
        selectinload(ZoningArea.regulatory_scopes)
        .selectinload(RegulatoryScope.norm_limits)
        .selectinload(ScopeNormLimit.urban_parameter)
    )


async def fetch_zoning_area_by_municipality_code(
    db: AsyncSession, municipality_code: str
) -> ZoningArea | None:
    """Return the winning active zoning area for an IMM municipality code, or None."""
    code = municipality_code.strip().upper()
    if not code:
        return None
    stmt = (
        select(ZoningArea)
        .options(zoning_area_load_options())
        .where(
            ZoningArea.is_active.is_(True),
            ZoningArea.municipality_codes.contains([code]),
        )
        .order_by(ZoningArea.match_priority, ZoningArea.id)
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def pick_regulatory_scope_for_general_limits(
    zone: ZoningArea,
) -> RegulatoryScope | None:
    """Prefer ZONA_GENERAL; otherwise the first scope (seed order)."""
    for rs in zone.regulatory_scopes:
        if rs.scope_type == RegulatoryScopeType.ZONA_GENERAL:
            return rs
    return zone.regulatory_scopes[0] if zone.regulatory_scopes else None
