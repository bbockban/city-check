"""Orígenes CORS: variables de entorno y defaults para desarrollo local."""

import os

from dotenv import load_dotenv

load_dotenv()

# Puertos típicos de Vite (5173) SI NO TE ANDA FIJATE Q LO LEVANTES EN ESTE PLEASE
_DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _truthy_debug() -> bool:
    return os.getenv("DEBUG", "").strip().lower() in ("1", "true", "yes", "on")


def get_cors_allow_origins() -> list[str]:
    """
    Orígenes permitidos para el navegador.

    - Si definís ``CORS_ORIGINS`` (coma-separado), se usa solo eso.
    - Si no, y ``DEBUG`` está activo, se usan URLs locales típicas del front.
    - Si no hay DEBUG ni ``CORS_ORIGINS``, lista vacía (sin CORS permisivo).
    """

    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    if _truthy_debug():
        return list(_DEFAULT_DEV_ORIGINS)
    return []
