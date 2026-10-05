"""Métricas de cumplimiento: registro + plugins (un ``execute`` por módulo)."""

from __future__ import annotations

from pathlib import Path

from services.function_registry import FunctionRegistry

STANDARD_METRIC_NAMES = ("altura_m", "fos_porc", "retiro_m")

_registry: FunctionRegistry | None = None


def get_metric_registry() -> FunctionRegistry:
    """Descubre ``execute`` en ``plugins/*.py`` con ``load_from_folder``."""
    global _registry
    if _registry is None:
        r = FunctionRegistry()
        here = Path(__file__).resolve().parent
        r.load_from_folder(
            str(here / "plugins"),
            "services.compliance_metrics.plugins",
        )
        _registry = r
    return _registry
