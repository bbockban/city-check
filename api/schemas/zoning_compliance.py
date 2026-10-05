"""API models for IFC vs zoning compliance checks."""

from schemas.base import CamelModel, camel_model_config


class ParameterComplianceRow(CamelModel):
    """One urban parameter: limit, measured value, and pass/fail."""

    model_config = camel_model_config()

    parameter_kind: str
    parameter_name: str | None = None
    unit: str
    limit_value: float | None = None
    measured_value: float | None = None
    compliant: bool | None = None
    notes: str | None = None


class ZoningComplianceResponse(CamelModel):
    """IFC model checked against the zoning area for the parcel municipality."""

    model_config = camel_model_config()

    municipality_code: str
    parcel_id: str
    zoning_area_id: int
    zoning_area_name: str
    overall_compliant: bool | None
    parameter_checks: list[ParameterComplianceRow]
    warnings: list[str] = []
