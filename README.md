# CityCheck

**Validador y georreferenciador de modelos IFC (BIM) contra la normativa urbanística de Montevideo.**

CityCheck permite subir el modelo IFC de un edificio, asociarlo a un padrón catastral y verificar automáticamente si cumple con los parámetros de zonificación del **Digesto Departamental** y del **Plan de Ordenamiento Territorial** de Montevideo. El resultado se visualiza en un visor 3D y sobre un mapa 3D de la ciudad, con el edificio ubicado en su parcela real.

> Proyecto de grado.

---

## ¿Qué hace?

1. **Carga de IFC**: el usuario sube un modelo BIM en formato IFC.
2. **Resolución de la parcela**: a partir del número de padrón, o de las coordenadas guardadas en el `IfcSite`, se consulta el **GeoServer (WFS) de la Intendencia de Montevideo** para obtener la geometría de la parcela, el barrio y el municipio.
3. **Georreferenciación**: se pueden inyectar las coordenadas WGS84 de la parcela en el IFC y descargar el archivo georreferenciado.
4. **Validación de zonificación**: con el código de municipio se buscan las normas aplicables (zona general, subzona, tramo de calle o padrón específico) y se comparan con las métricas medidas en el modelo:
   - **Altura máxima** (a partir de las elevaciones de los niveles o de los property sets)
   - **FOS** (Factor de Ocupación del Suelo): huella del edificio sobre el área de la parcela
   - **Retiro frontal**: distancia mínima del edificio al límite de la parcela
5. **Visualización**:
   - Visor IFC 3D independiente (That Open Components)
   - Mapa 3D de Mapbox con el modelo renderizado en su ubicación real y recortado a la parcela
   - Panel con el resultado de cada chequeo (cumple / no cumple)
6. **Exportación BCF**: los incumplimientos se pueden descargar como un archivo **BCF 2.1 (`.bcfzip`)**, con un *topic* por cada chequeo fallido, para abrirlo en herramientas BIM.

---

## Estructura del repositorio

```
city-check/
├── api/        # Backend: FastAPI + PostgreSQL + ifcopenshell
└── frontend/   # Frontend: React + TypeScript + Vite + Mapbox + Three.js
```

Cada carpeta tiene su propio `README.md` (cómo levantarla) y su `CLAUDE.md` (arquitectura y convenciones).

---

## Stack

| Capa | Tecnologías |
|------|-------------|
| **Backend** | Python 3.11 · FastAPI · SQLAlchemy 2.0 (async) · PostgreSQL (asyncpg) · Alembic · Pydantic v2 · ifcopenshell · Shapely · pyproj · httpx |
| **Frontend** | React · TypeScript · Vite · TanStack Router · TanStack Query · Tailwind · Mapbox GL JS · Three.js · @thatopen/components · web-ifc |
| **Datos externos** | WFS de la Intendencia de Montevideo (parcelas y barrios) |
| **Deploy** | Render (`render.yaml` en cada proyecto) · Dockerfile para la API |

---

## Arquitectura

```
┌─────────────────────────┐        HTTP / JSON         ┌──────────────────────────┐
│        Frontend         │ ─────────────────────────▶ │           API            │
│  React + Vite           │                            │  FastAPI                 │
│  · Visor IFC 3D         │ ◀───────────────────────── │  · Procesamiento IFC     │
│  · Mapa 3D (Mapbox)     │   resultados, IFC, BCF     │  · Validación normativa  │
│  · Panel de validación  │                            │  · Georreferenciación    │
└─────────────────────────┘                            └───────┬──────────┬───────┘
                                                               │          │
                                                     ┌─────────▼──┐  ┌────▼──────────────┐
                                                     │ PostgreSQL │  │ WFS Montevideo    │
                                                     │ zonificación│ │ parcelas / barrios│
                                                     └────────────┘  └───────────────────┘
```

### Modelo de datos de zonificación

```
zoning_areas            (zona, códigos de municipio, prioridad)
  └── regulatory_scopes (ZONA_GENERAL | SUBZONA | TRAMO_CALLE | PADRON_ESPECIFICO)
        └── scope_norm_limits (valor límite → urban_parameters)
urban_parameters        (ALTURA_MAXIMA | FOS | RETIRO_FRONTAL)
```

### Endpoints principales (`/api/v1`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/ifc/site-coordinates` | Extrae lat/lon del `IfcSite` |
| `POST` | `/ifc/parcel-id` | Detecta el padrón a partir del IFC |
| `POST` | `/ifc/parcel-context` | Contexto completo de la parcela (coordenadas, UTM, municipio) |
| `POST` | `/ifc/validate-zoning` | Valida el IFC contra la normativa de la zona |
| `POST` | `/ifc/validate-zoning/bcf` | Igual que la anterior, pero devuelve un `.bcfzip` |
| `POST` | `/ifc/georeference/{parcel_id}` | Devuelve el IFC georreferenciado |
| `GET`  | `/parcels/montevideo/{parcel_id}` | Geometría y centroide de un padrón |
| `GET`  | `/parcels/montevideo/at-point` | Padrón en un punto dado |
| `GET`  | `/regulations/zoning-areas` | Listado de zonas |
| `GET`  | `/regulations/zoning-areas/{id}` | Detalle de una zona con sus normas |
| `GET`  | `/regulations/zoning-areas/by-municipality/{code}` | Normas por código de municipio |

La documentación interactiva (Swagger) queda en `http://localhost:8000/docs` con la API levantada.

---

## Cómo levantarlo en local

### Requisitos

- Python 3.11 y [Poetry](https://python-poetry.org/)
- PostgreSQL
- Node.js (ver `frontend/.nvmrc`) y npm
- Un token de [Mapbox](https://www.mapbox.com/)

### 1. API

```bash
cd api
poetry install
cp .env.example .env              # configurar DATABASE_URL
createdb proyecto_grado_db        # Alembic no crea la base
poetry run alembic upgrade head   # esquema
poetry run python seed.py         # carga la zonificación de referencia
poetry run uvicorn main:app --reload   # http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env              # configurar VITE_MAPBOX_TOKEN
npm run dev                       # http://localhost:5173
```

En desarrollo, Vite hace de proxy de `/api/...` hacia el backend, así que `VITE_API_URL` puede quedar vacío.

---

## Calidad de código

- **API**: Ruff, Black y MyPy, que corren en pre-commit y pre-push con Lefthook. Tests con `pytest`.
- **Frontend**: ESLint (orden de claves, estilo, hooks de React, accesibilidad), que corre en pre-commit con Husky.

> Los hooks de git de cada subproyecto se configuraron cuando eran repos separados. En este monorepo hay que reinstalarlos desde la raíz si se quieren seguir usando.

---

## Documentación adicional

- `api/README.md`: guía detallada del backend, el seed y la normativa
- `api/docs/`: informe y documentación técnica
- `frontend/README.md`: detalles del mapa 3D, la proyección del IFC y el glosario
- `frontend/docs/testing-ifc-zoning-compliance.md`: cómo probar la validación de zonificación
