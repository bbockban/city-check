"""
WFS queries for Montevideo cadastral parcels and neighborhood (barrio) boundaries.
Aligned with the reference wfs_query_parcelas script.
"""

import os
from typing import Any, cast

import httpx

# Defaults from the reference script
DEFAULT_WFS_PARCELAS_URL = (
    "https://montevideo.gub.uy/app/geoserver/mapstore-tematicas/"
    "ic_v_mdg_parcelas_geom_limite/ows"
)
DEFAULT_WFS_PARCELAS_LAYER = "mapstore-tematicas:ic_v_mdg_parcelas_geom_limite"
DEFAULT_WFS_BARRIOS_URL = (
    "https://montevideo.gub.uy/app/geoserver/mapstore-tematicas/"
    "zon_v_sig_municipios/ows"
)
DEFAULT_WFS_BARRIOS_LAYER = "mapstore-tematicas:zon_v_sig_municipios"
DEFAULT_WFS_MANZANAS_URL = (
    "https://montevideo.gub.uy/app/geoserver/mapstore-base/"
    "cb_v_sig_manzanas_materializadas/ows"
)
DEFAULT_WFS_MANZANAS_LAYER = "mapstore-base:cb_v_sig_manzanas_materializadas"

WFS_HEADERS = {
    "User-Agent": "ProyectoGrado-API/1.0 (httpx)",
    "Accept": "application/json, text/xml, application/xml, */*",
    "Accept-Language": "es-UY,es;q=0.9,en;q=0.8",
    "Referer": "https://montevideo.gub.uy/",
}

# Shared across calls/requests so repeated WFS lookups reuse the same
# keep-alive connection instead of paying a fresh TCP+TLS handshake each
# time (the WFS server is in Uruguay; the API is not).
_shared_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None:
        _shared_client = httpx.AsyncClient(timeout=30.0)
    return _shared_client


async def close_client() -> None:
    """Call on app shutdown to release the shared WFS connection pool."""
    global _shared_client
    if _shared_client is not None:
        await _shared_client.aclose()
        _shared_client = None


def _wfs_config() -> dict[str, str]:
    return {
        "parcelas_url": os.getenv("WFS_PARCELAS_URL", DEFAULT_WFS_PARCELAS_URL),
        "parcelas_layer": os.getenv("WFS_PARCELAS_LAYER", DEFAULT_WFS_PARCELAS_LAYER),
        "barrios_url": os.getenv("WFS_BARRIOS_URL", DEFAULT_WFS_BARRIOS_URL),
        "barrios_layer": os.getenv("WFS_BARRIOS_LAYER", DEFAULT_WFS_BARRIOS_LAYER),
        "manzanas_url": os.getenv("WFS_MANZANAS_URL", DEFAULT_WFS_MANZANAS_URL),
        "manzanas_layer": os.getenv("WFS_MANZANAS_LAYER", DEFAULT_WFS_MANZANAS_LAYER),
    }


def _cql_escape_string(value: str) -> str:
    """Escape single quotes in CQL string literals."""

    return value.replace("'", "''")


def _build_get_feature_params(
    type_names: str,
    cql_filter: str,
    *,
    max_features: int = 10,
) -> dict[str, str]:
    return {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": type_names,
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "CQL_FILTER": cql_filter,
        "count": str(max_features),
    }


async def _wfs_get_json(
    client: httpx.AsyncClient, url: str, params: dict[str, str]
) -> dict[str, Any]:
    response = await client.get(url, params=params, headers=WFS_HEADERS)
    response.raise_for_status()
    ctype = response.headers.get("Content-Type", "")

    if "application/json" in ctype:
        return cast(dict[str, Any], response.json())

    return {"raw_response": response.text}


def geometry_centroid(geometry: dict[str, Any]) -> tuple[float, float] | None:
    """Centroid as mean of outer-ring vertices (same idea as the reference script)."""

    if not geometry or "coordinates" not in geometry:
        return None

    coords = geometry["coordinates"]
    gtype = geometry.get("type")
    all_points: list[list[float]] = []

    if gtype == "Polygon" and coords:
        all_points = [list(p) for p in coords[0] if len(p) >= 2]
    elif gtype == "MultiPolygon" and coords and coords[0] and coords[0][0]:
        all_points = [list(p) for p in coords[0][0] if len(p) >= 2]

    if not all_points:
        return None

    lons = [p[0] for p in all_points]
    lats = [p[1] for p in all_points]

    return sum(lons) / len(lons), sum(lats) / len(lats)


def municipality_code_from_parcel_payload(payload: dict[str, Any]) -> str | None:
    """
    IMM municipality letter(s) from WFS `zon_v_sig_municipios` feature (e.g. CH, A).
    Expects the dict shape returned by `get_cadastral_parcel_with_neighborhood`.
    """
    neighborhood = payload.get("neighborhood")
    if not neighborhood or not isinstance(neighborhood, dict):
        return None
    props = neighborhood.get("properties") or {}
    if not isinstance(props, dict):
        return None
    raw = props.get("municipio") or props.get("MUNICIPIO") or props.get("municipio_id")
    if raw is None:
        return None
    code = str(raw).strip().upper()
    return code or None


def _neighborhood_name_from_props(props: dict[str, Any]) -> str | None:
    for key in (
        "nombre",
        "name",
        "barrio",
        "BARRIO",
        "NOMBRE",
        "descripcion",
        "DESCRIPCION",
    ):
        val = props.get(key)

        if val:
            return str(val)

    return None


async def fetch_parcel_feature(
    client: httpx.AsyncClient,
    parcel_id: str,
    *,
    parcelas_url: str | None = None,
    parcelas_layer: str | None = None,
) -> dict[str, Any] | None:
    """
    GeoJSON Feature: by padron (string), or numeric gid if no padron match.
    """

    cfg = _wfs_config()
    url = parcelas_url or cfg["parcelas_url"]
    layer = parcelas_layer or cfg["parcelas_layer"]

    safe = _cql_escape_string(parcel_id.strip())
    params = _build_get_feature_params(layer, f"padron='{safe}'", max_features=1)
    data = await _wfs_get_json(client, url, params)
    features = data.get("features") or []

    if not features and parcel_id.strip().isdigit():
        params = _build_get_feature_params(
            layer, f"gid={int(parcel_id)}", max_features=1
        )
        data = await _wfs_get_json(client, url, params)
        features = data.get("features") or []

    if not features:
        return None

    return cast(dict[str, Any], features[0])


async def _fetch_feature_at_point(
    client: httpx.AsyncClient,
    lon: float,
    lat: float,
    url: str,
    layer: str,
) -> dict[str, Any] | None:
    cql = f"INTERSECTS(the_geom, SRID=4326;POINT({lon} {lat}))"
    params = _build_get_feature_params(layer, cql, max_features=1)
    data = await _wfs_get_json(client, url, params)
    features = data.get("features") or []

    return features[0] if features else None


async def fetch_barrio_at_point(
    client: httpx.AsyncClient,
    lon: float,
    lat: float,
    *,
    barrios_url: str | None = None,
    barrios_layer: str | None = None,
) -> dict[str, Any] | None:
    cfg = _wfs_config()

    return await _fetch_feature_at_point(
        client,
        lon,
        lat,
        url=barrios_url or cfg["barrios_url"],
        layer=barrios_layer or cfg["barrios_layer"],
    )


async def fetch_parcel_at_point(
    client: httpx.AsyncClient,
    lon: float,
    lat: float,
    *,
    parcelas_url: str | None = None,
    parcelas_layer: str | None = None,
) -> dict[str, Any] | None:
    """GeoJSON Feature for the parcel that contains (lon, lat), or None."""
    cfg = _wfs_config()

    return await _fetch_feature_at_point(
        client,
        lon,
        lat,
        url=parcelas_url or cfg["parcelas_url"],
        layer=parcelas_layer or cfg["parcelas_layer"],
    )


async def get_cadastral_parcel_at_point(lon: float, lat: float) -> dict[str, Any]:
    """
    Full parcel + neighborhood lookup starting from a geographic point.
    Resolves the padron at (lon, lat) then delegates to
    get_cadastral_parcel_with_neighborhood.
    """
    client = _get_client()
    feature = await fetch_parcel_at_point(client, lon, lat)

    if not feature:
        return {
            "parcel_id": "",
            "found_parcel": False,
            "found_neighborhood": False,
            "parcel": None,
            "neighborhood": None,
            "centroid": None,
            "error": f"No se encontró parcela en ({lat}, {lon})",
        }

    props = feature.get("properties") or {}
    padron = props.get("padron")

    if not padron:
        return {
            "parcel_id": "",
            "found_parcel": False,
            "found_neighborhood": False,
            "parcel": None,
            "neighborhood": None,
            "centroid": None,
            "error": "Se halló parcela en el punto pero sin identificador de padrón",
        }

    return await get_cadastral_parcel_with_neighborhood(str(padron))


async def get_cadastral_parcel_with_neighborhood(parcel_id: str) -> dict[str, Any]:
    """
    Parcel polygon + attributes and neighborhood (WFS query at parcel centroid).
    """
    cfg = _wfs_config()
    client = _get_client()

    feature = await fetch_parcel_feature(
        client,
        parcel_id,
        parcelas_url=cfg["parcelas_url"],
        parcelas_layer=cfg["parcelas_layer"],
    )

    if not feature:
        return {
            "parcel_id": parcel_id,
            "found_parcel": False,
            "found_neighborhood": False,
            "parcel": None,
            "neighborhood": None,
            "centroid": None,
            "error": f"No se encontró parcela para el id: {parcel_id}",
        }

    geometry = feature.get("geometry") or {}
    props = feature.get("properties") or {}
    resolved_id = props.get("padron") or props.get("gid") or parcel_id

    centroid = geometry_centroid(geometry)
    neighborhood_block: dict[str, Any] | None = None
    found_neighborhood = False

    if centroid:
        lon, lat = centroid
        barrio_feature = await fetch_barrio_at_point(
            client,
            lon,
            lat,
            barrios_url=cfg["barrios_url"],
            barrios_layer=cfg["barrios_layer"],
        )

        if barrio_feature:
            bprops = barrio_feature.get("properties") or {}
            neighborhood_block = {
                "name": _neighborhood_name_from_props(bprops),
                "properties": bprops,
                "geometry": barrio_feature.get("geometry"),
            }
            found_neighborhood = True

    return {
        "parcel_id": str(resolved_id),
        "found_parcel": True,
        "found_neighborhood": found_neighborhood,
        "parcel": {
            "properties": props,
            "geometry": geometry,
        },
        "neighborhood": neighborhood_block,
        "centroid": ({"lon": centroid[0], "lat": centroid[1]} if centroid else None),
        "error": None,
    }


async def fetch_manzana_at_point(
    client: httpx.AsyncClient,
    lon: float,
    lat: float,
    *,
    manzanas_url: str | None = None,
    manzanas_layer: str | None = None,
) -> dict[str, Any] | None:
    """GeoJSON Feature for the manzana (city block) containing (lon, lat), or None."""
    cfg = _wfs_config()
    url = manzanas_url or cfg["manzanas_url"]
    layer = manzanas_layer or cfg["manzanas_layer"]
    return await _fetch_feature_at_point(client, lon, lat, url, layer)


async def get_manzana_geometry_at_point(
    lon: float, lat: float
) -> dict[str, Any] | None:
    """WGS84 GeoJSON geometry dict for the manzana at (lon, lat), or None."""
    cfg = _wfs_config()
    client = _get_client()
    feature = await fetch_manzana_at_point(
        client,
        lon,
        lat,
        manzanas_url=cfg["manzanas_url"],
        manzanas_layer=cfg["manzanas_layer"],
    )
    if not feature:
        return None
    return feature.get("geometry") or None


async def get_parcel_id_at_point(lon: float, lat: float) -> str | None:
    """Return the padron (parcel ID string) for the parcel at (lon, lat), or None."""
    client = _get_client()
    feature = await fetch_parcel_at_point(client, lon, lat)
    if not feature:
        return None
    props = feature.get("properties") or {}
    padron = props.get("padron")
    if padron is None:
        return None
    padron_s = str(padron).strip()
    return padron_s or None
