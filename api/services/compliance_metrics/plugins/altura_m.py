"""Altura del edificio (m) medida desde el modelo IFC."""

from __future__ import annotations

from typing import Any

import ifcopenshell
import ifcopenshell.util.unit as unit_util

from services import ifc_zoning_compliance as izc
from services.compliance_metrics.context import MeasurementContext


def _altura_m(model: ifcopenshell.file) -> tuple[float | None, str | None]:
    # Nivel 1: Pset.Height / TotalHeight, si existe.
    h = izc._height_from_psets(model)
    if h is not None and h > 0:
        return h, None
    # Nivel 2: elevación de pisos + altura propia del último piso.
    h2, h2_note = izc._height_from_storeys(model)
    if h2 is not None and h2 > 0:
        return h2, h2_note
    # Nivel 3: rango vertical (z_max - z_min) de toda la malla 3D.
    sample = izc._sample_geometry_world_xy_z(model)
    if sample.z_min is not None and sample.z_max is not None:
        span = sample.z_max - sample.z_min
        if span > 0:
            try:
                scale = float(unit_util.calculate_unit_scale(model))
            except Exception:
                scale = 1.0
            return span * scale, "altura_estimada_por_rango_vertical_de_malla"
    return None, "no_se_pudo_inferir_altura_del_edificio"


def execute(ctx: MeasurementContext, **_kwargs: Any) -> float | None:
    altura, nota = _altura_m(ctx.model)
    ctx.details["height_note"] = nota
    if nota:
        ctx.warn(izc._HEIGHT_NOTE_MESSAGES.get(nota, nota))
    return altura
