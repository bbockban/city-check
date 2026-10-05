"""Contexto de medición que reciben los plugins de cumplimiento."""

from __future__ import annotations

from functools import cached_property
from typing import Any, NamedTuple

import ifcopenshell
from shapely.geometry import Polygon


class ParcelLocal(NamedTuple):
    """Parcela en un marco métrico local con origen en su centroide UTM."""

    polygon: Polygon
    area_m2: float
    centroid_en: tuple[float, float]


class MeasurementContext:
    """
    Entrada común a todos los plugins: modelo IFC abierto, parcela y manzana.

    Los insumos costosos que comparten varios plugins (malla 3D, parcela en
    UTM local, huella basal) se calculan una sola vez y a pedido. Cada plugin
    agrega sus avisos con ``warn`` y sus datos auxiliares en ``details``.
    """

    def __init__(
        self,
        model: ifcopenshell.file,
        parcel_geometry: dict[str, Any],
        manzana_geometry: dict[str, Any] | None = None,
    ) -> None:
        self.model = model
        self.parcel_geometry = parcel_geometry
        self.manzana_geometry = manzana_geometry
        self.warnings: list[str] = []
        self.details: dict[str, Any] = {}
        self._measurements: dict[str, float | None] = {}

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def measure(self, metric_key: str) -> float | None:
        """Ejecuta el plugin ``metric_key`` una sola vez y memoiza el resultado."""
        if metric_key not in self._measurements:
            from services.compliance_metrics import get_metric_registry

            registry = get_metric_registry()
            self._measurements[metric_key] = (
                registry.execute(metric_key, self) if registry.has(metric_key) else None
            )
        return self._measurements[metric_key]

    @cached_property
    def verts(self) -> list[tuple[float, float, float]]:
        """Vértices de la malla 3D del edificio (unidades del archivo)."""
        from services import ifc_zoning_compliance as izc

        return izc.mesh_vertices_world_file_units(self.model)

    @cached_property
    def unit_scale(self) -> float:
        from services import ifc_zoning_compliance as izc

        return izc.unit_scale_to_metres(self.model, self.verts)

    @cached_property
    def parcel(self) -> ParcelLocal | None:
        from services import ifc_zoning_compliance as izc

        info = izc.parcel_polygon_local_m(self.parcel_geometry)
        if info is None:
            self.warn(
                "No se pudo leer la geometría de la parcela; se omitieron el FOS y "
                "el retiro."
            )
            return None
        return ParcelLocal(*info)

    @cached_property
    def basal_footprint_m(self) -> Polygon | None:
        """Huella basal: corte a 1 m sobre el piso más bajo + casco convexo."""
        from services import ifc_zoning_compliance as izc

        footprint = izc.footprint_hull_for_fos_m(self.model, self.verts)
        if footprint is None:
            self.warn(
                "No se pudo calcular el FOS ni el retiro: el servidor no pudo "
                "generar la malla 3D del modelo."
            )
        return footprint
