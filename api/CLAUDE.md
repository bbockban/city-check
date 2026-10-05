# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FastAPI REST API for urban zoning compliance validation of IFC (BIM) building models against Montevideo's Departmental Digest and Territorial Planning regulations. Core flow: upload an IFC file → resolve parcel via WFS → look up zoning rules by municipality code → compare building metrics (height, FOS, setback) against regulatory limits.

**Stack**: Python 3.11.8 · FastAPI · PostgreSQL (asyncpg) · SQLAlchemy 2.0 async · Alembic · Pydantic v2 · ifcopenshell · Shapely · pyproj · httpx

## Development Commands

```bash
# Install dependencies
poetry install

# Run dev server (localhost:8000, auto-reload)
poetry run uvicorn main:app --reload

# Linting and formatting (mirrors pre-commit hooks)
poetry run ruff check .
poetry run ruff format .
poetry run black .
poetry run mypy .

# Migrations
poetry run alembic upgrade head          # Apply all pending
poetry run alembic downgrade -1          # Rollback one step
poetry run alembic revision --autogenerate -m "description"  # New migration

# Database setup (first time only — Alembic does NOT create the DB)
createdb proyecto_grado_db
poetry run alembic upgrade head

# Seed reference data (Plan Montevideo urban zoning)
poetry run python seed.py               # Load all zones
poetry run python seed.py clear         # Drop seed data

# Verify DB connection
poetry run python scripts/test_connection.py

# Tests (infrastructure ready, no tests yet)
poetry run pytest
```

Git hooks run automatically via **lefthook**: pre-commit runs `ruff`, `ruff format --check`, `black --check`, and `mypy` in parallel on staged files. Pre-push runs full-codebase lint + type check.

## Architecture

### Request Flow

```
HTTP Request
  → routers/         (validates input, calls Depends(get_db))
  → services/        (business logic, queries, external calls)
  → models/          (SQLAlchemy ORM — DB representation)
  → schemas/         (Pydantic — JSON serialization, camelCase out)
```

All schemas inherit from `CamelModel` (defined in `schemas/base.py`), which applies `alias_generator=to_camel` — every snake_case field is automatically serialized as camelCase in JSON responses. Models use `from_attributes=True` to allow direct ORM → Pydantic conversion.

### Key Services

| Service | Responsibility |
|---|---|
| `services/zoning_queries.py` | SQLAlchemy queries with eager-loading for zoning areas by municipality code |
| `services/wfs_montevideo.py` | httpx client to Montevideo GeoServer WFS (parcelas + barrios layers) |
| `services/ifc_georeference.py` | Extract/inject WGS84 coords from IfcSite (DMS ↔ decimal conversion) |
| `services/ifc_parcel_resolution.py` | Combines WFS + IFC to return parcel context (coords, UTM, municipality) |
| `services/ifc_zoning_compliance.py` | Measures height/FOS/setback from IFC geometry; compares to zoning limits |

### Database Schema

Four related tables form the zoning model:

```
zoning_areas           (zone name, municipality_codes ARRAY, match_priority)
  └── regulatory_scopes  (scope_type: ZONA_GENERAL | SUBZONA | TRAMO_CALLE | PADRON_ESPECIFICO)
        └── scope_norm_limits  (limit_value, FK → urban_parameters)
urban_parameters       (name, unit, parameter_kind enum: ALTURA_MAXIMA | FOS | RETIRO_FRONTAL)
```

Always load relationships with `zoning_area_load_options()` from `services/zoning_queries.py` — it uses three levels of `selectinload` to avoid N+1 queries.

### IFC Processing

**ifcopenshell is synchronous** — there is no async API. All IFC operations write to `tempfile.TemporaryDirectory()` because ifcopenshell requires a file path, not bytes. Compliance analysis measures:
- **Height**: First tries storey elevations, falls back to property set keys (`Height`, `TotalHeight`, etc.)
- **FOS** (floor-to-site ratio): IFC building footprint (2D Shapely polygon) divided by parcel area
- **Setback**: Minimum distance from building boundary to parcel boundary

### WFS Integration

WFS endpoints default to Montevideo's GeoServer but can be overridden via env vars. Key gotchas:
- Single quotes in CQL filters must be escaped (doubled): handled by `_cql_escape_string()`
- Municipality code is extracted from WFS feature properties trying multiple keys: `municipio`, `MUNICIPIO`, `municipio_id`
- Parcel lookup tries `padron` field first, then numeric `gid`
- Geometry can be Polygon or MultiPolygon — centroid calc handles both nesting levels

## Environment Variables

Copy `.env.example` to `.env`:

```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/proyecto_grado_db
DEBUG=True                        # Enables permissive CORS for localhost:5173
SECRET_KEY=...                    # Reserved for future auth (unused)
CORS_ORIGINS=http://...           # Explicit origins for production
WFS_PARCELAS_URL=...              # Defaults to Montevideo GeoServer if unset
WFS_PARCELAS_LAYER=...
WFS_BARRIOS_URL=...
WFS_BARRIOS_LAYER=...
```

## Code Patterns

### Adding a New Router

```python
# routers/example.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas.example import ExampleRead

router = APIRouter(prefix="/example", tags=["example"])

@router.get("/{id}", response_model=ExampleRead)
async def get_example(id: int, db: AsyncSession = Depends(get_db)) -> ...:
    ...
```

Register in `main.py`:
```python
app.include_router(example_router, prefix="/api/v1")
```

### Adding a New Schema

All schemas must inherit `CamelModel` and use `camel_model_config`:

```python
from schemas.base import CamelModel, camel_model_config

class MySchema(CamelModel):
    model_config = camel_model_config(from_attributes=True)

    some_field: int           # serialized as "someField" in JSON
    other_field: str | None = None
```

### Adding a Migration

After changing `models/`, always run autogenerate and review the output before applying:

```bash
poetry run alembic revision --autogenerate -m "add column X to table Y"
# Review alembic/versions/<hash>_*.py before applying
poetry run alembic upgrade head
```

Ensure `models/__init__.py` exports the model so `alembic/env.py` picks it up via `Base.metadata`.

## Linting Configuration

**Ruff** (primary linter + formatter, line length 88, Python 3.11 target):
- Rule sets: `E, W, F, I, B, C4, UP` (errors, warnings, flake8, isort, bugbear, comprehensions, pyupgrade)
- `__init__.py`: F401 ignored (re-exports)
- `routers/*.py`: B008 ignored (FastAPI `Depends()` in function defaults is intentional)

**Black** runs alongside ruff format for compatibility. **MyPy** is configured with `check_untyped_defs=true` but `disallow_untyped_defs=false` — type hints are expected but not enforced on every function.

## Common Gotchas

- **Alembic won't create the DB** — run `createdb proyecto_grado_db` first, then `alembic upgrade head`
- **Async SQLAlchemy sessions** — never use `Session` (sync); always `AsyncSession` from `database.get_db()`
- **Pydantic camelCase** — JSON responses are camelCase; internal Python and DB remain snake_case
- **PostgreSQL ARRAY** — `municipality_codes` uses `ARRAY(String(32))`; query with `.contains([code])`, not `==`
- **Enum registration** — SQLAlchemy enums are registered as named PostgreSQL types; renaming requires a new migration that drops and recreates the type
- **IFC temp files** — ifcopenshell cannot open from bytes; always write to `tempfile.TemporaryDirectory()` and open by path
- **WFS timeout** — httpx client uses 30s timeout; WFS calls can be slow on large layers
- **No auth** — all endpoints are currently public; `SECRET_KEY` is reserved but not wired up
