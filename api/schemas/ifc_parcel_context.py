"""Respuesta unificada: parcela Montevideo, municipio y CRS para FOS en planta."""

from pydantic import Field

from schemas.base import CamelModel, camel_model_config
from schemas.cadastral_parcel import CadastralParcelFeature, NeighborhoodInfo


class LonLat(CamelModel):
    """Punto en WGS84 (lon, lat) como en el WFS y IfcSite."""

    model_config = camel_model_config()

    lon: float
    lat: float


class EastNorthM(CamelModel):
    """Coordenadas planas en metros (UTM zona 21 Sur), mismo marco que el FOS."""

    model_config = camel_model_config()

    easting: float
    northing: float


class ParcelIdResponse(CamelModel):
    model_config = camel_model_config()

    parcel_id: str


class IfcParcelContextResponse(CamelModel):
    """
    Contexto catastral para un IFC: geometría WFS, barrio, municipio IMM y CRS FOS.

    Incluye el mismo bloque ``parcel`` / ``neighborhood`` que el WFS de Montevideo.
    """

    model_config = camel_model_config()

    resolve_mode: str = Field(
        ...,
        description=(
            "'parcel_id' si vino padrón; 'ifc_site_at_point' si se usó IfcSite."
        ),
    )
    parcel_id: str
    found_parcel: bool
    found_neighborhood: bool
    parcel: CadastralParcelFeature | None = Field(
        default=None,
        description=("Feature parcela: properties (padrón, etc.) y geometry GeoJSON."),
    )
    neighborhood: NeighborhoodInfo | None = Field(
        default=None,
        description=(
            "Barrio en el centroide de la parcela: nombre, atributos y geometría."
        ),
    )
    municipality_code: str | None = Field(
        default=None,
        description="Código IMM (`municipio`) desde capa WFS de municipios.",
    )
    parcel_occupied_percent: float | None = Field(
        default=None,
        description=(
            "Porcentaje de ocupación de parcela (proxy FOS) derivado del IFC."
        ),
    )
    target_occupied_percent: float | None = Field(
        default=None,
        description=("Alias de parcel_occupied_percent para consumo de frontend."),
    )
    centroid_wgs84: LonLat | None = None
    centroid_utm_plan_m: EastNorthM | None = Field(
        default=None,
        description=("Centroide de la parcela en EPSG:32721 (m), mismo CRS que FOS."),
    )
    fos_plan_projection_epsg: int = Field(
        default=32721,
        description="EPSG usado para áreas/distancias en planta (Montevideo).",
    )
    fos_plan_projection_authority: str = Field(
        default="EPSG:32721",
        description="Identificador de autoridad del CRS de plano.",
    )
    warnings: list[str] = Field(default_factory=list)
