"""Urban zoning and norm limit models (Digesto / Plan Montevideo–aligned structure)."""

from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class RegulatoryScopeType(str, enum.Enum):
    """Scope granularity; WFS-only workflow uses ZONA_GENERAL."""

    ZONA_GENERAL = "ZONA_GENERAL"
    SUBZONA = "SUBZONA"
    TRAMO_CALLE = "TRAMO_CALLE"
    PADRON_ESPECIFICO = "PADRON_ESPECIFICO"


class ZoningArea(Base):
    """
    Tertiary zoning area (Central, Intermedia, Costera, Periférica, Otras, etc.).
    `municipality_codes`: IMM codes from WFS.
    `match_priority`: tie-break if codes overlap.
    """

    __tablename__ = "zoning_areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    municipality_codes: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)), nullable=False
    )
    match_priority: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100,
        doc="Lower value wins when multiple areas contain the same municipality code.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    regulatory_scopes: Mapped[list[RegulatoryScope]] = relationship(
        back_populates="zoning_area", cascade="all, delete-orphan"
    )


class RegulatoryScope(Base):
    """Normative scope within a zoning area (e.g. general regime vs future subzone)."""

    __tablename__ = "regulatory_scopes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    zoning_area_id: Mapped[int] = mapped_column(
        ForeignKey("zoning_areas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope_type: Mapped[RegulatoryScopeType] = mapped_column(
        Enum(
            RegulatoryScopeType,
            name="regulatory_scope_type",
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    zoning_area: Mapped[ZoningArea] = relationship(back_populates="regulatory_scopes")
    norm_limits: Mapped[list[ScopeNormLimit]] = relationship(
        back_populates="regulatory_scope", cascade="all, delete-orphan"
    )


class UrbanParameter(Base):
    """Reusable definition of an urban parameter (height, FOS, front setback, …)."""

    __tablename__ = "urban_parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit: Mapped[str] = mapped_column(String(64), nullable=False)
    parameter_kind: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    metric_key: Mapped[str] = mapped_column(String(64), nullable=False)
    limit_key: Mapped[str] = mapped_column(String(64), nullable=False)
    rule_expression: Mapped[dict] = mapped_column(JSONB, nullable=False)

    norm_limits: Mapped[list[ScopeNormLimit]] = relationship(
        back_populates="urban_parameter"
    )


class ScopeNormLimit(Base):
    """Limit value for a given parameter within a regulatory scope."""

    __tablename__ = "scope_norm_limits"
    __table_args__ = (
        UniqueConstraint(
            "regulatory_scope_id",
            "urban_parameter_id",
            name="uq_scope_parameter",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    regulatory_scope_id: Mapped[int] = mapped_column(
        ForeignKey("regulatory_scopes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    urban_parameter_id: Mapped[int] = mapped_column(
        ForeignKey("urban_parameters.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    limit_value: Mapped[Decimal] = mapped_column(
        Numeric(10, 3),
        nullable=False,
        doc="Numeric limit in the unit given by UrbanParameter (e.g. metres, percent).",
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    regulatory_scope: Mapped[RegulatoryScope] = relationship(
        back_populates="norm_limits"
    )
    urban_parameter: Mapped[UrbanParameter] = relationship(back_populates="norm_limits")
