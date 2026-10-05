# CityCheck — Validador IFC (Montevideo)

Frontend en **React**, **TypeScript** y **Vite**: carga de IFC, visor 3D (That Open), mapa Mapbox con modelo georreferenciado y panel de validación de zonificación. El detalle de arquitectura, API y convenciones está en [`CLAUDE.md`](./CLAUDE.md).

## Requisitos

- Node.js (versión acorde al equipo; el proyecto usa `npm`).
- Variables de entorno: copiá `.env.example` → `.env` y definí al menos `VITE_MAPBOX_TOKEN`. Ver tabla en `CLAUDE.md`.

## Comandos

```bash
npm install    # dependencias
npm run dev    # http://localhost:5173
npm run build  # tsc + build de producción
npm run lint   # ESLint (también en pre-commit)
npm run preview
```

---

## Mapa 3D (Mapbox + IFC + Three.js)

El mapa combina **Mapbox** (mapa base) y **Three.js** (modelo del edificio) en una **capa personalizada**: ambos dibujan en la misma pantalla y el mismo contexto gráfico (WebGL).

### Glosario (términos que aparecen en el código)

| Término | Qué es, en pocas palabras |
|--------|----------------------------|
| **Huella** | Superficie que el edificio ocupa en el **suelo**, vista desde arriba (en planta), en metros cuadrados si el IFC está en metros. |
| **Caja envolvente** | El “cajón” rectangular 3D más chico, con caras paralelas a los ejes X, Y y Z, que **contiene todo el modelo**. En inglés suele decirse *axis-aligned bounding box* o **AABB**. |
| **Mercator** | Sistema de coordenadas que usa Mapbox para el plano del mapa; sirve para posicionar y escalar el IFC en el lugar correcto. |
| **Malla instanciada (`InstancedMesh`)** | Una sola geometría base repetida muchas veces (ventanas, muros iguales, etc.), cada copia en su posición. ThatOpen lo usa para ser eficiente. |
| **`Box3.setFromObject`** | Función de Three.js que calcula la caja envolvente de un objeto **teniendo en cuenta todas las instancias**, no solo la forma base. |

### Tecnologías

- **Mapbox GL JS**: mapa (calles, terreno). Cada frame entrega una matriz de cámara para alinear el modelo 3D.
- **Three.js**: dibuja el IFC. **`MercatorCoordinate`** (de Mapbox) traduce metros y lat/lng a ese sistema.
- Código principal: `src/components/map-box/map-box.ts` (`MapBox`), `fragments.ts`, usado desde `MapViewer` con `BimModel`.

En cada frame se combina la cámara del mapa con la transformación del edificio: lo movemos al centro elegido, lo escalamos para que un metro del modelo mida un metro en el terreno (en esa latitud), lo rotamos 90° en X para apoyarlo en el mapa, y opcionalmente aplicamos un **multiplicador de escala** extra.

### Escala “real” y multiplicador

1. **Metros en el IFC**: lo habitual es que el modelo venga en **metros**. `MercatorCoordinate.meterInMercatorCoordinateUnits()` dice, en el punto del mapa donde está el centro, **cuántas unidades del mapa equivalen a un metro**; con eso el edificio se dibuja a tamaño real (si el multiplicador extra vale 1).
2. **`modelScaleMultiplier`**: número extra que agranda o achica el modelo de forma uniforme. Por defecto es `1`. El auto-escala lo calcula para acercar la **huella** al porcentaje del padrón que pide el backend.

### Auto-escala y % de cobertura (padrón)

Cuando hay polígono del padrón y el backend envía un objetivo (p. ej. `targetOccupiedPercent`), el visor llama a `autoScaleToTargetCoveragePercent`:

1. Se calcula el **área del padrón** en el sistema del mapa (proyectando el contorno y cerrando el polígono).
2. Esa área se **traduce a metros cuadrados del mismo tipo que usa el IFC**, dividiendo por el cuadrado del factor “metros ↔ mapa” (**s²**), el mismo que usa el modelo al colocarse.
3. La **huella** del edificio es el **ancho en planta × fondo en planta** de la caja envolvente (sin contar la altura como si fuera suelo), multiplicado por el cuadrado del multiplicador de escala.

#### Por qué antes no andaba (resumen paso a paso)

| Paso | Qué pasaba |
|------|------------|
| 1 | ThatOpen arma el modelo con **muchas copias** de la misma pieza 3D (**malla instanciada**). Cada copia tiene su posición en el espacio. |
| 2 | El código **viejo** medía el tamaño leyendo solo los vértices de la **pieza base** (una sola “plantilla”) y una transformación del objeto. **No** aplicaba la posición de cada copia. |
| 3 | Entonces la **caja envolvente** quedaba como si el edificio fuera **una fracción minúscula** del real: la huella en planta salía **casi cero**. |
| 4 | La **auto-escala** hace: “achicá o agrandá el modelo hasta que la huella sea X % del padrón”. Si cree que la huella es ~0, despeja un **multiplicador enorme** (matemáticamente: divide por un número muy chico). |
| 5 | **Efecto visible:** modelo **gigante** en el mapa y/o porcentaje de cobertura **incoherente**. No era un fallo del mapa: era una **medición incorrecta del tamaño** antes de escalar. |
| **Ahora** | Se usa **`Box3.setFromObject`**: Three.js incluye **todas las instancias** al armar la caja. La huella es creíble → el multiplicador sale normal. |

**Regla mental:** si medís mal el “ancho × fondo” del edificio, cualquier fórmula que escale para cumplir un % del padrón va a devolver un número malo; el bug estaba en el **paso de medición**, no en la fórmula en sí.

**Ejes:** en el modelo **antes** de acostarlo en el mapa, **Y es la vertical** (altura). La planta es el plano **X–Z**: huella ≈ **(máximo X − mínimo X) × (máximo Z − mínimo Z)**. Usar X×Y mezclaría altura con planta.

**Fórmula del multiplicador** (un solo cálculo): si `baseFootprint` es la huella con multiplicador `m = 1` y `A` es el área del padrón en las mismas unidades cuadradas que la huella, para que la huella sea el `targetPercent` % del padrón:

\[
m = \sqrt{\frac{A \times \mathrm{targetPercent}}{100 \times \mathrm{baseFootprint}}}
\]

Implementación: `MapBox.autoScaleToTargetCoveragePercent` en `map-box.ts` (comentarios al inicio del archivo y junto al cálculo).

---

## Visor IFC (standalone)

Muestra el modelo en una escena 3D independiente (`src/lib/ifc-viewer.ts`, That Open + **web-ifc** en `/web-ifc/`). En la ruta `/validator`, pestaña «Visor 3D», el layout React (`src/components/validator/viewers/ifc-viewer.tsx`) monta el canvas y dos inspectores laterales (`inspector-side-panel.tsx`).

- **@thatopen/components** y **@thatopen/fragments** (worker): mismos fragmentos que en el mapa para consistencia visual.
- API del visor: `setupIFCViewer` → `loadIfcFromFile`, `clearScene`, `cleanup`, más resaltado y visibilidad por `localId` para el árbol espacial.

### Inspector lateral

Botones flotantes (abajo a la izquierda) abren paneles deslizantes:

| Panel | Contenido (componente) | Rol |
|--------|-------------------------|-----|
| **Estructura IFC** | `ifc-viewer-structure-panel-content.tsx` | Árbol desde `getSpatialStructure()`, filtro, ramas colapsables, resaltar y ocultar geometría por `localId`. |
| **Validación de zonificación** | `ifc-viewer-zoning-panel-content.tsx` | Resultados (`zoning-result-panel.tsx`), descarga **BCF** (`.bcfzip`) contra el mismo backend que la validación, y mensajes de carga/error. |

Flujo de datos:

- **`ZoningValidationProvider`** (`zoning-validation-context.tsx`): arma los parámetros del multipart (archivo, padrón, `municipality_code` y `parcel_geometry_json` cuando el contexto de parcela los tiene), ejecuta `POST /api/v1/ifc/validate-zoning`, y la descarga BCF vía `POST /api/v1/ifc/validate-zoning/bcf`. El botón **Validar zonificación** del encabezado llama a `runZoningValidation`; el panel muestra estado y BCF.

La validación en el encabezado y el panel comparten el mismo contexto; no se usa ya un panel Lit embebido en el canvas.

---

## Documentación para agentes / mantenimiento

Ver **[CLAUDE.md](./CLAUDE.md)** (rutas, API, variables, *gotchas* de Vite/WebGL y la sección *IFC projection on the map, coverage, and bounding box*).
