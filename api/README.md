# Proyecto Grado API

API REST con **FastAPI**, **PostgreSQL** (SQLAlchemy async + Alembic), consultas **WFS** a parcelas de Montevideo y un **modelo de zonificación / normas urbanísticas** alineado al Digesto Departamental y al Plan de Ordenamiento Territorial. Incluye validación **IFC ↔ zonificación** (altura, FOS, retiro aproximado en planta).

---

## Cómo levantar el proyecto

Seguí los pasos en orden. **Alembic no crea la base de datos**, solo tablas y tipos; el **seed** carga datos de zonificación de referencia.

### Qué tenés que instalar

| Componente | Para qué |
|------------|----------|
| **Python 3.11–3.14** | Runtime (`pyproject.toml` limita el tope por compatibilidad con wheels de `ifcopenshell`). |
| **[Poetry](https://python-poetry.org/)** | Dependencias y entorno virtual del proyecto. |
| **PostgreSQL** | Persistencia de zonificación (`DATABASE_URL` con driver `asyncpg`). |

### Qué no hace falta (u opcional)

- **Docker / docker-compose**: no es obligatorio; no hay un compose en el repo para DB + API.
- **Instalar Ruff, Black o MyPy globalmente**: se instalan como dependencias de desarrollo con `poetry install`.
- **Lefthook**: opcional; sirve para correr linters en `git commit` / `push` (ver más abajo).
- **Node.js**: solo si instalás Lefthook vía `npm` (alternativa: Homebrew en macOS).

### 1. Dependencias Python

```bash
cd proyecto-grado-api
poetry install
```

Opcional: `poetry shell` para activar el virtualenv en la terminal.

### 2. Crear la base de datos

```bash
createdb proyecto_grado_db
```

(Ajustá el nombre si usás otro; debe coincidir con la URL en `.env`.)

### 3. Variables de entorno

```bash
cp .env.example .env
```

Editá `.env` y poné un **`DATABASE_URL`** válido, por ejemplo:

`postgresql+asyncpg://USUARIO:CONTRASEÑA@localhost:5432/proyecto_grado_db`

### 4. Migraciones (esquema)

```bash
poetry run alembic upgrade head
```

Esto aplica las revisiones en `alembic/versions/` (p. ej. esquema de zonificación y eliminación de tabla legada `regulations` si existía).

### 5. Datos de referencia (seed)

```bash
poetry run python seed.py
```

Carga parámetros urbanísticos y zonas terciarias desde `seeds/urban_zoning.py`. Si ya hay datos, el script pregunta si querés continuar; podés forzar con:

```bash
printf 'y\n' | poetry run python seed.py
```

Para **borrar** zonificación y parámetros sembrados y volver a cargar:

```bash
poetry run python seed.py clear
poetry run python seed.py
```

### 6. Arrancar la API

Recomendado en desarrollo:

```bash
poetry run uvicorn main:app --reload
```

Equivalentes: `python main.py` o `uvicorn main:app --reload` si ya tenés el entorno activado.

### 7. Comprobar que responde

- Raíz: http://localhost:8000  
- Salud: http://localhost:8000/health  

### Nota sobre `create_all` al iniciar

En el `lifespan` de `main.py` se ejecuta `Base.metadata.create_all` para comodidad en local. En **producción** el esquema debería depender de **Alembic** como única fuente de verdad.

---

## Configuración (.env)

| Variable | Rol |
|----------|-----|
| `DATABASE_URL` | Obligatoria. Formato async: `postgresql+asyncpg://...` |
| `DEBUG` | Si es `True`, CORS permisivo hacia orígenes típicos de front en localhost (p. ej. 3000, 5173, 4200). |
| `CORS_ORIGINS` | Lista separada por comas. Si está definida, **solo** esos orígenes (no se mezclan con los defaults de `DEBUG`). |
| `WFS_*` | Opcional; por defecto se usan los GeoServer `mapstore-tematicas` de Montevideo. |
| `BCF_FORCE_FAIL_ENABLED` | Opcional. Si está definido con un valor **no vacío** (p. ej. `1`), el campo de formulario **`force_fail`** en `validate-zoning` y `validate-zoning/bcf` fuerza todos los checks a no cumplir (solo depuración). |
| `SECRET_KEY` | Reservado para futura autenticación; hoy no se usa en rutas. |

---

## Operaciones habituales después del primer arranque

| Objetivo | Comando |
|----------|---------|
| Aplicar migraciones nuevas | `poetry run alembic upgrade head` |
| Deshacer la última migración | `poetry run alembic downgrade -1` |
| Generar migración (tras cambiar modelos) | `poetry run alembic revision --autogenerate -m "descripción"` — **revisá** el archivo generado antes de commitear. |
| Recargar datos de zonificación | `poetry run python seed.py clear` luego `poetry run python seed.py` |

**Migración inicial (`915c9d366e6f`):** elimina la tabla legada `regulations` si existe; crea el esquema de zonificación (`zoning_areas`, `urban_parameters`, `regulatory_scopes`, `scope_norm_limits`) y enums en PostgreSQL. Si las tablas ya existían (p. ej. por `create_all`), el upgrade no las recrea.

---

## Documentación interactiva y contrato JSON

Tras levantar el servidor:

- **Swagger UI:** http://localhost:8000/docs  
- **ReDoc:** http://localhost:8000/redoc  
- **OpenAPI JSON:** http://localhost:8000/openapi.json  

### Formato de respuestas

Las respuestas exitosas usan **camelCase** en JSON (modelos que heredan de `CamelModel` en `schemas/base.py`). Los **requests** aceptan camelCase o snake_case (`populate_by_name=True`).

Los errores de validación automática de FastAPI (**422**, etc.) siguen el esquema por defecto (`detail`, `loc`, `msg`…).

---

## Qué resuelve la API (resumen)

- **Zonificación en PostgreSQL:** áreas terciarias, ámbitos `ZONA_GENERAL` (y extensible a subzona / tramo / padrón), límites numéricos ligados al catálogo `urban_parameters`.
- **Parcelas Montevideo:** polígono y atributos vía WFS; municipio IMM desde la capa de municipios en el centroide.
- **IFC:** lectura con `ifcopenshell`; georreferencia básica en `IfcSite`; **validación** `POST /api/v1/ifc/validate-zoning` compara métricas del modelo con límites del régimen general según código IMM. La parcela puede fijarse con **`parcel_id`** (padrón) o inferirse desde **`IfcSite`**. La lógica en planta se inspira en [GEOBIM_Tool](https://github.com/tudelft3d/GEOBIM_Tool) (corte basal, huella, alineación con parcela vía `IfcMapConversion` o heurística de sitio). **Exportación BCF 2.1:** `POST /api/v1/ifc/validate-zoning/bcf` devuelve un `.bcfzip` con un topic por chequeo no cumplido. Código principal: `services/ifc_zoning_compliance.py`, `services/ifc_bcf.py`, `services/zoning_queries.py`, `schemas/zoning_compliance.py`.

---

## Modelo de datos urbanístico (normas y zonificación)

La API modela la lógica del trabajo: resolver una **zona urbanística** a partir del **código de municipio** (WFS o formulario) y exponer los **valores límite** del **régimen general** (altura, FOS, retiro frontal). El esquema admite ámbitos más finos en el futuro sin cambiar el catálogo central.

### Entidades (concepto → tablas)

| Concepto (tesis / UML) | Tabla | Rol |
|------------------------|--------|-----|
| **Zona** (área de zonificación terciaria) | `zoning_areas` | Agrupa **códigos de municipio** (`municipality_codes`, array PostgreSQL). Incluye `match_priority` para desempates. |
| **Ámbito normativo** | `regulatory_scopes` | `scope_type`: `ZONA_GENERAL`, `SUBZONA`, `TRAMO_CALLE`, `PADRON_ESPECIFICO`. El seed actual usa **`ZONA_GENERAL`**. |
| **Normativa** (catálogo) | `urban_parameters` | Nombre, descripción, unidad, `parameter_kind` (`ALTURA_MAXIMA`, `FOS`, `RETIRO_FRONTAL`). |
| **Aplicación normativa** | `scope_norm_limits` | Ámbito ↔ parámetro con **`limit_value`** y texto de referencia. Única `(regulatory_scope_id, urban_parameter_id)`. |

Código ORM: `models/zoning.py`. Esquemas API: `schemas/zoning.py`.

### Decisiones de diseño (breve)

1. **`municipality_codes` como array** — Varias zonas comparten normas sobre varios municipios; la consulta es *contiene el código IMM*.
2. **`match_priority`** (menor = gana) — Desempate explícito cuando los arrays se solapan (p. ej. **A**/**D** en varias áreas).
3. **`RegulatoryScope`** — Permite añadir subzonas o padrones sin rediseñar límites ni catálogo.
4. **Valores del seed** — Aproximación operativa al régimen general; muchos artículos remiten a **planos** del Plan Montevideo. No sustituyen cartografía ni excepciones.
5. **Tabla legada `regulations`** — La migración inicial la elimina si existe; la API actual no la usa.

### Fuentes normativas del seed

Datos en `seeds/urban_zoning.py`, con enlaces orientativos:

- [Área Central](https://normativa.montevideo.gub.uy/articulos/51267) · [Área Intermedia](https://normativa.montevideo.gub.uy/articulos/51275) · [Área Costera](https://normativa.montevideo.gub.uy/articulos/51284) · [Área Periférica](https://normativa.montevideo.gub.uy/articulos/51288) · [Otras áreas urbanizadas](https://normativa.montevideo.gub.uy/articulos/51291) · [Índice Digesto Vol. IV](https://normativa.montevideo.gub.uy/indice/51202)

---

## Referencia: arquitectura, endpoints y flujos

En el código los paths están en inglés; acá la descripción es en español. Los routers montados desde `main.py` son **`regulations`**, **`parcels`** e **`ifc`** (más `/` y `/health`).

### Diagrama de capas

```mermaid
flowchart TB
  subgraph client [Cliente HTTP]
    B[Browser / app / curl]
  end
  subgraph fastapi [FastAPI]
    M[main.py lifespan + rutas raíz]
    RR[routers/regulations.py]
    RP[routers/parcels.py]
    RI[routers/ifc.py]
  end
  subgraph pg [PostgreSQL]
    T[Tablas de zonificación\nzoning_areas regulatory_scopes\nscope_norm_limits urban_parameters]
  end
  subgraph geo [WFS Intendencia GeoServer]
    WP[Capa parcelas]
    WM[Capa municipios zon_v_sig_municipios]
  end
  subgraph proc [Procesamiento en el servidor]
    IFC[ifcopenshell\nifc_georeference.py]
    CMP[ifc_zoning_compliance.py\npyproj + shapely +\nifcopenshell.util.geolocation]
    BCF[ifc_bcf.py\nBCF 2.1 zip]
  end
  B --> M
  B --> RR
  B --> RP
  B --> RI
  RR -->|AsyncSession get_db| T
  RI -->|validate-zoning| T
  RI -->|httpx| WP
  RI -->|httpx| WM
  RP -->|httpx| WP
  RP -->|httpx| WM
  RI --> IFC
  RI --> CMP
  RI --> BCF
```

### Base de datos vs WFS vs IFC

- **PostgreSQL:** `GET /api/v1/regulations/...` y `POST /api/v1/ifc/validate-zoning` (resolución de zona y límites).
- **Sin DB:** `/`, `/health`, `GET /api/v1/parcels/...`, y la mayoría de rutas IFC salvo `validate-zoning` (que además puede usar solo WFS + archivo).

Implementación WFS: `services/wfs_montevideo.py` (`httpx`, URLs/capas por `.env` o defaults).

### Tabla de rutas (resumen)

| Método | Ruta | PostgreSQL | WFS | IFC |
|--------|------|:----------:|:---:|:---:|
| `GET` | `/` | No | No | No |
| `GET` | `/health` | No | No | No |
| `GET` | `/api/v1/regulations/zoning-areas` | Sí | No | No |
| `GET` | `/api/v1/regulations/zoning-areas/by-municipality/{code}` | Sí | No | No |
| `GET` | `/api/v1/regulations/zoning-areas/{zoning_area_id}` | Sí | No | No |
| `GET` | `/api/v1/parcels/montevideo/{parcel_id}` | No | Sí | No |
| `GET` | `/api/v1/parcels/montevideo/at-point` | No | Sí | No |
| `POST` | `/api/v1/ifc/site-coordinates` | No | No | Sí |
| `POST` | `/api/v1/ifc/parcel-context` | No | Sí | Sí |
| `POST` | `/api/v1/ifc/validate-zoning` | Sí | Opcional | Sí |
| `POST` | `/api/v1/ifc/georeference/{parcel_id}` | No | Sí | Sí |

**Nota de rutas:** en el router, `by-municipality/...` va **antes** que `{zoning_area_id}` para no confundir el segmento con un id numérico.

### Secuencia: `POST /api/v1/ifc/validate-zoning`

```mermaid
sequenceDiagram
  participant C as Cliente
  participant R as routers/ifc.py
  participant IG as services/ifc_georeference.py
  participant W as services/wfs_montevideo.py
  participant DB as PostgreSQL
  participant ZQ as services/zoning_queries.py
  participant CZ as services/ifc_zoning_compliance.py

  C->>R: multipart archivo .ifc parcel_id opcional
  alt parcel_id no vacío
    R->>W: get_cadastral_parcel_with_neighborhood(parcel_id)
  else sin parcel_id
    R->>IG: extract_site_coordinates(bytes)
    IG-->>R: lon lat
    R->>W: get_cadastral_parcel_at_point(lon lat)
  end
  Note over W: WFS GetFeature parcelas luego municipios
  W-->>R: dict foundParcel parcel geometry neighborhood
  R->>R: municipality_code_from_parcel_payload
  R->>DB: fetch_zoning_area_by_municipality_code sesión async
  DB-->>R: ZoningArea con norm_limits
  R->>ZQ: pick_regulatory_scope_for_general_limits y norm_limits_by_parameter_kind
  R->>CZ: analyze_ifc_bytes_for_compliance bytes geometría parcela
  CZ-->>R: altura FOS retiro en plano + warnings
  R->>CZ: evaluate_against_limits
  CZ-->>R: filas por UrbanParameterKind
  R-->>C: JSON ZoningComplianceResponse
```

### Secuencia: parcela por padrón

```mermaid
sequenceDiagram
  participant C as Cliente
  participant R as routers/parcels.py
  participant W as services/wfs_montevideo.py
  C->>R: GET parcel_id
  R->>W: get_cadastral_parcel_with_neighborhood
  W-->>R: dict GeoJSON propiedades
  R-->>C: CadastralParcelWithNeighborhoodResponse
```

### Secuencia: zona por municipio

```mermaid
sequenceDiagram
  participant C as Cliente
  participant R as routers/regulations.py
  participant DB as PostgreSQL
  C->>R: GET municipality_code
  R->>DB: SELECT ZoningArea eager load scopes limits
  DB-->>R: fila o vacío
  R-->>C: ZoningAreaRead o 404
```

### Mapeo archivo → responsabilidad

| Archivo | Rol |
|---------|-----|
| `main.py` | App, CORS, `lifespan`, routers. |
| `database.py` | Motor async, `get_db`, `Base`. |
| `routers/regulations.py` | Lectura de zonificación. |
| `routers/parcels.py` | Proxy WFS parcela / punto. |
| `routers/ifc.py` | Upload IFC, WFS, DB en validate, export BCF, binario en georeference. |
| `services/wfs_montevideo.py` | Cliente WFS y parseo mínimo GeoJSON. |
| `services/zoning_queries.py` | Consultas de `ZoningArea` y límites. |
| `services/ifc_georeference.py` | Leer/escribir `IfcSite`. |
| `services/ifc_zoning_compliance.py` | Métricas BIM vs parcela y comparación a límites. |

### Endpoints detallados

#### Generales

- `GET /` — Información básica de la API.
- `GET /health` — Estado del servicio.

#### Zonificación (`/api/v1/regulations`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/regulations/zoning-areas` | Lista áreas activas (resumen). |
| `GET` | `/api/v1/regulations/zoning-areas/by-municipality/{municipality_code}` | Zona que contiene el código IMM (normalizado a mayúsculas), con scopes y límites. |
| `GET` | `/api/v1/regulations/zoning-areas/{zoning_area_id}` | Detalle por id. |

#### Parcelas Montevideo (WFS)

- **`GET /api/v1/parcels/montevideo/{parcel_id}`** — Polígono y atributos de la parcela; barrio/municipio por centroide. `parcel_id`: **padrón** o **`gid`** numérico si no hay match por padrón.
- **`GET /api/v1/parcels/montevideo/at-point?lon=&lat=`** — Parcela que contiene el punto (EPSG:4326).

Respuesta tipo `CadastralParcelWithNeighborhoodResponse` (camelCase): `parcelId`, `foundParcel`, `foundNeighborhood`, `parcel` (`properties` + `geometry`), `centroid`, etc. Atributos del WFS pueden venir en español dentro de `properties`.

Capas y URLs por defecto configurables con `WFS_*` en `.env`.

#### IFC (`/api/v1/ifc`)

Subida como **`multipart/form-data`** con archivo **`.ifc`** (en Swagger el campo suele llamarse `file`).

- **`POST /api/v1/ifc/site-coordinates`** — `RefLatitude` / `RefLongitude` del primer `IfcSite` en decimal.
- **`POST /api/v1/ifc/parcel-context`** — Con **`parcel_id`** equivale al GET de parcela; sin él, usa `IfcSite` como consulta por punto. Incluye `municipio` IMM, centroides WGS84 y UTM (**EPSG:32721**).
- **`POST /api/v1/ifc/georeference/{parcel_id}`** — Centroide WFS → escribe DMS en `IfcSite`; respuesta **binaria** `.ifc`.
- **`POST /api/v1/ifc/validate-zoning`** — `file` obligatorio. **Modo con código:** `municipality_code` (IMM) y opcionalmente `parcel_geometry_json` (GeoJSON Geometry WGS84) para FOS/retiro sin WFS; si no hay geometría inline pero sí `parcel_id`, el WFS aporta solo el polígono. **Modo WFS completo** (sin `municipality_code`): `parcel_id` o coordenadas de `IfcSite`. Respuesta `ZoningComplianceResponse`: `municipalityCode`, `parcelId`, `zoningAreaId`, `zoningAreaName`, `overallCompliant` (`true` / `false` / `null` si hay checks indeterminados), `parameterChecks[]`, `warnings[]`. Form opcional **`force_fail`**: solo tiene efecto si en `.env` definís `BCF_FORCE_FAIL_ENABLED` con valor no vacío (marca todos los checks como no cumplidos, útil para probar BCF o el front).
- **`POST /api/v1/ifc/validate-zoning/bcf`** — Mismos campos de formulario que `validate-zoning`. Respuesta **binaria** `application/zip`: archivo **BCF 2.1** (`.bcfzip`) con un topic por cada chequeo con `compliant: false`; si todo cumple, el zip incluye `bcf.version` y `project.bcfp` sin topics.

**Métricas (resumen para tesis / demos):**

- **Altura:** propiedades cuantitativas del `IfcBuilding` → si no, diferencia de `IfcBuildingStorey.Elevation` → si no, luz vertical del mallado (`ifcopenshell.geom` + escala de unidades).
- **FOS (%):** proxy = área en planta de muestra **basal** del mallado (lógica tipo [GEOBIM_Tool](https://github.com/tudelft3d/GEOBIM_Tool): corte ~ elevación mínima de plantas + 1 m o `z_min` + 1 m) sobre **área de parcela** en EPSG:32721 (**Shapely** / **pyproj**). Casco cóncavo con fallback convexo; no replica el pipeline OCC+DBSCAN completo del GEOBIM.
- **Retiro (m):** proxy = distancia mínima en planta entre borde de huella basal y borde de parcela, en marco local UTM; requiere **`IfcMapConversion`** o fallback por **`IfcSite`** + colocación coherente. **No** identifica frente normativo por calle.

#### Validación rápida de métricas IFC

Resumen operativo para revisar `altura`, `FOS` y `retiro` sin leer todo el código:

- **Reproducción local vía API:**
  ```bash
  curl -X POST "http://localhost:8000/api/v1/ifc/validate-zoning" \
    -F "file=@/ruta/al/modelo.ifc" \
    -F "parcel_id=OPCIONAL_PADRON"
  ```
  Si preferís evitar WFS para municipio, también podés enviar:
  ```bash
  curl -X POST "http://localhost:8000/api/v1/ifc/validate-zoning" \
    -F "file=@/ruta/al/modelo.ifc" \
    -F "municipality_code=CH"
  ```
  Esto devuelve métricas y cumplimiento por regla.
  Para bajar el BCF con los mismos parámetros (guardá el zip donde quieras):
  ```bash
  curl -sS -X POST "http://localhost:8000/api/v1/ifc/validate-zoning/bcf" \
    -F "file=@/ruta/al/modelo.ifc" \
    -F "municipality_code=CH" \
    -o /ruta/salida/validation.bcfzip
  ```
- **Chequeo manual (QGIS / BIM):**
  - Altura: contrastar con niveles/propiedades del modelo.
  - FOS: contrastar `área_huella / área_parcela * 100` (FOS no usa perímetro).
  - Retiro: medir distancia mínima edificio↔lindero en EPSG:32721.
- **Referencia de implementación:** flujo en `routers/ifc.py` → métricas en `services/ifc_zoning_compliance.py` → BCF en `services/ifc_bcf.py` → límites en `services/zoning_queries.py` → parcela/municipio en `services/wfs_montevideo.py`. Aún no hay tests automatizados para estas métricas; reproducí con Swagger/ReDoc o los `curl` de arriba.

### Integración WFS ↔ zonificación (flujo previsto)

1. Obtener parcela (y atributos) con `GET /api/v1/parcels/montevideo/{parcel_id}`.
2. Leer el **código de municipio** en la capa de municipios del WFS (atributo típico **`municipio`** en `neighborhood.properties` del payload completo). El schema público `CadastralParcelWithNeighborhoodResponse` puede omitir `neighborhood`; la validación IFC usa el dict interno del WFS que sí lo incluye. Normalizá el valor al mismo formato que el seed (letras IMM, p. ej. `CH`, `A`).
3. Resolver normas generales: `GET /api/v1/regulations/zoning-areas/by-municipality/{code}`.

**Atajo:** el paso 2–3 (y la comparación con el IFC) queda automatizado en **`POST /api/v1/ifc/validate-zoning`**. Para llevar incumplimientos a un visor BIM, **`POST /api/v1/ifc/validate-zoning/bcf`** genera el `.bcfzip` con el mismo formulario. Si ya conocés el padrón, podés enviarlo en el formulario como **`parcel_id`** y omitir la dependencia de coordenadas en `IfcSite` solo para esa resolución de parcela.

Si el WFS devolviera otro identificador distinto de `municipio`, haría falta ampliar `municipality_code_from_parcel_payload` o una **tabla de mapeo** explícita (no incluida en el seed por defecto).

---

## Desarrollo y calidad de código

### Recarga al editar

```bash
poetry run uvicorn main:app --reload
```

### Migraciones (revisión `915c9d366e6f`)

- **Revisión:** `915c9d366e6f` — `initial_zoning_schema` (`alembic/versions/915c9d366e6f_initial_zoning_schema.py`).
- **`upgrade`:**
  - `DROP TABLE IF EXISTS regulations CASCADE` (tabla legada).
  - Si **no** están todas las tablas del esquema (`zoning_areas`, `urban_parameters`, `regulatory_scopes`, `scope_norm_limits`), las crea junto con los tipos enum de PostgreSQL vía `Base.metadata.create_all` sobre esas tablas.
  - Si **ya existen** las cuatro tablas del esquema (`zoning_areas`, `urban_parameters`, `regulatory_scopes`, `scope_norm_limits`), **no** recrea nada; solo elimina `regulations` si estaba presente.
- **`downgrade`:** elimina las cuatro tablas nuevas, borra los tipos enum y **recrea** la tabla antigua `regulations` (útil solo en entornos de prueba).

### Crear una nueva migración

```bash
poetry run alembic revision --autogenerate -m "Descripción del cambio"
```

Revisá siempre el script generado antes de commitear.

### Aplicar migraciones

```bash
poetry run alembic upgrade head
```

### Revertir la última migración

```bash
poetry run alembic downgrade -1
```

### Linters, Markdown y herramientas

**Markdown** (`README.md` y otros `*.md`): no se analiza ni formatea como Python. En `pyproject.toml`, Ruff excluye esos paths y Black ignora `README.md`, para que bloques de código shell en la documentación no disparen errores de sintaxis. En **Lefthook** (pre-commit), Ruff y Black solo reciben archivos `*.py`.

Herramientas: [Ruff](https://github.com/astral-sh/ruff), [Black](https://black.readthedocs.io/), [MyPy](https://mypy.readthedocs.io/).

### Comandos manuales (lint y tipos)

```bash
poetry run ruff check .
poetry run ruff format --check .
poetry run black --check .
poetry run mypy .
```

### Formatear

```bash
poetry run ruff format .
poetry run black .
```

### Cursor / VS Code

Instalá la extensión **Ruff** (Astral Software); suele mostrar avisos en el editor y puede arreglar al guardar. El repo puede incluir ajustes en `.vscode/settings.json`.

### Git hooks (Lefthook) — opcional

```bash
brew install lefthook
# o: npm install -g @evilmartians/lefthook

lefthook install
# o: poetry run lefthook install
```

Los hooks suelen limitarse a `*.py`. Para saltear (solo si hace falta): `git commit --no-verify`.
