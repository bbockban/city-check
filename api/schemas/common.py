"""Small response models for app-level routes."""

from schemas.base import CamelModel


class RootResponse(CamelModel):
    message: str
    docs: str
    redoc: str
    openapi: str


class HealthResponse(CamelModel):
    status: str
