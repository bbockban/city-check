"""Pydantic models for cadastral parcel + neighborhood (Montevideo WFS)."""

from typing import Any

from pydantic import Field

from schemas.base import CamelModel


class Centroid(CamelModel):
    lon: float
    lat: float


class CadastralParcelFeature(CamelModel):
    """GeoJSON-like parcel payload (properties + geometry)."""

    properties: dict[str, Any] = Field(default_factory=dict)
    geometry: dict[str, Any] = Field(default_factory=dict)


class NeighborhoodInfo(CamelModel):
    """Barrio / municipal zone from WFS (raw attributes may use Spanish keys)."""

    name: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    geometry: dict[str, Any] | None = None


class CadastralParcelWithNeighborhoodResponse(CamelModel):
    """Parcel polygon + attributes and neighborhood (centroid query), WFS Montevideo."""

    parcel_id: str
    found_parcel: bool
    found_neighborhood: bool
    parcel: CadastralParcelFeature | None = None
    # TODO Revisar puede q se use pero es muy pesado
    # neighborhood: NeighborhoodInfo | None = None
    centroid: Centroid | None = None
    error: str | None = None
