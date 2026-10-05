"""FOS (%) = área de la huella basal / área de la parcela × 100."""

from __future__ import annotations

from typing import Any

from services import ifc_zoning_compliance as izc
from services.compliance_metrics.context import MeasurementContext


def execute(ctx: MeasurementContext, **_kwargs: Any) -> float | None:
    parcel = ctx.parcel
    if parcel is None:
        ctx.details["fos_note"] = "geometria_de_parcela_invalida_o_ausente"
        return None
    # FOS · Pasos 1-3: malla 3D → corte basal → casco convexo (huella).
    footprint = ctx.basal_footprint_m
    if footprint is None:
        ctx.details["fos_note"] = "geometria_de_malla_insuficiente_para_huella"
        return None
    # FOS · Paso 4: FOS % = área de la huella / área de la parcela × 100.
    fos = izc.fos_percent(footprint, parcel.area_m2)
    if fos is not None:
        ctx.warn(
            "FOS aproximado: se calcula con la envolvente convexa de la "
            "planta baja del edificio; en plantas con entrantes o formas "
            "irregulares puede sobreestimar levemente el área ocupada."
        )
    return fos
