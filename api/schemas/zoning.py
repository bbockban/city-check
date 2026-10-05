"""Pydantic models for zoning areas, scopes, and norm limits."""

from datetime import datetime

from pydantic import Field

from models.zoning import RegulatoryScopeType
from schemas.base import CamelModel, camel_model_config


class UrbanParameterRead(CamelModel):
    model_config = camel_model_config(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    unit: str
    parameter_kind: str


class ScopeNormLimitRead(CamelModel):
    model_config = camel_model_config(from_attributes=True)

    id: int
    urban_parameter_id: int
    limit_value: int
    description: str | None = None
    urban_parameter: UrbanParameterRead


class RegulatoryScopeRead(CamelModel):
    model_config = camel_model_config(from_attributes=True)

    id: int
    zoning_area_id: int
    scope_type: RegulatoryScopeType
    description: str | None = None
    norm_limits: list[ScopeNormLimitRead] = Field(default_factory=list)


class ZoningAreaRead(CamelModel):
    model_config = camel_model_config(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    is_active: bool
    municipality_codes: list[str]
    match_priority: int
    created_at: datetime
    updated_at: datetime | None = None
    regulatory_scopes: list[RegulatoryScopeRead] = Field(default_factory=list)


class ZoningAreaSummaryRead(CamelModel):
    """Zoning area without nested scopes (list views)."""

    model_config = camel_model_config(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    is_active: bool
    municipality_codes: list[str]
    match_priority: int
