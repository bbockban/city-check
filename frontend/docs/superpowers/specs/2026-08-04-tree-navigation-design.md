# Diseño: navegación más intuitiva del árbol espacial IFC

## Contexto

Feedback de testing: "El Árbol espacial colapsable se me hizo difícil encontrar los elementos del modelo... Sería más intuitivo poder seleccionar el elemento en el modelo y que se seleccione en el listado de capas." El usuario del proyecto (Bernardo) además pidió una forma de **buscar** elementos por nombre/tipo, no solo navegar clickeando el modelo.

Alcance acordado: buscador de texto en el árbol + selección bidireccional 3D→árbol (la dirección árbol→3D ya existe). Frontend-only.

## Investigación

- `src/components/ifc/ifc-spatial-structure-panel.tsx`: dueño hoy de `hiddenMap` y `selectedLocalId` (ambos `useState` locales).
- `src/components/ifc/ifc-spatial-tree-node.tsx`: nodo recursivo. Selección árbol→3D ya funciona vía `onRowActivate` → `api.highlightLocalIds`/`resetHighlightLocalIds` (`src/lib/ifc-viewer.ts:85-112`). `open` es `useState(isRoot)` local, sin mecanismo de apertura forzada.
- `src/lib/ifc-spatial-tree-helpers.ts`: `spatialTreeRowLabel(node)` ya combina nombre (si existe) + tipo IFC (`ifcCategoryLabel`) + `#localId` — es el texto exacto que se muestra en cada fila, y el candidato natural para matchear el buscador.
- `SpatialTreeItem` (`@thatopen/fragments`) solo tiene `{ category, localId, children }` — no hay campo "name" garantizado (se usa uno opcional vía cast, `spatialTreeName`). No hace falta ningún fetch nuevo: el buscador matchea contra el texto ya calculado por `spatialTreeRowLabel`.
- `FragmentsManager.raycast({ camera, mouse, dom })` (`@thatopen/fragments`, expuesto también en `@thatopen/components`) devuelve `RaycastResult { localId, ... }` directo — no hace falta raycasting manual con `THREE.Raycaster`.
- `world.renderer.three.domElement` (three.js `WebGLRenderer`, vía `SimpleRenderer`) es el canvas real donde attachear los listeners de puntero.
- `IfcSpatialStructurePanel` se desmonta por completo cuando se cierra `InspectorSidePanel` (retorna `null` si `open=false`) — por eso `selectedLocalId` no puede quedarse ahí si un click en 3D con el panel cerrado tiene que abrirlo y mostrar el resultado.
- La app confirmó (sub-proyecto 1) que click izquierdo = pan (drag) / orbitar es click derecho — la selección 3D debe activarse con click **izquierdo sin arrastre**, para no pisar el pan.

## Diseño

### Estado compartido

`selectedLocalId` sube de `IfcSpatialStructurePanel` a `IFCViewer` (`src/components/validator/viewers/ifc-viewer.tsx`), que ya es dueño de `apiRef` y `structureSheetOpen`. Se pasa hacia abajo como prop controlada a través de `IfcViewerStructurePanelContent` → `IfcSpatialStructurePanel`. `hiddenMap` se queda donde está (no lo necesita nadie más).

### Función utilitaria compartida (`src/lib/ifc-spatial-tree-helpers.ts`)

```ts
export const collectAncestorIdsToReveal = (
  tree: SpatialTreeItem,
  matches: (node: SpatialTreeItem) => boolean,
): Set<number> => { /* recorrido único, devuelve localId de toda rama que contiene un match */ };
```

La usan tanto el buscador (con `matches = (node) => spatialTreeRowLabel(node).toLowerCase().includes(query)`) como la selección 3D (con `matches = (node) => node.localId === pickedId`).

### Buscador de texto

- Input de texto en `IfcSpatialStructurePanel`, estado local `searchQuery`, debounced ~150ms.
- Con query no vacío: podar ramas sin match propio ni descendiente con match (usando `collectAncestorIdsToReveal`); forzar abiertas las ramas devueltas por esa función; resaltar el substring matcheado dentro de `rowLabel` con un `<mark>`.
- Con query vacío: comportamiento actual sin cambios (todo colapsado salvo raíz).
- Sin resultados: mensaje "Sin resultados" en vez de árbol vacío.

### Selección 3D → árbol

- En `setupIFCViewer` (`src/lib/ifc-viewer.ts`): listeners `pointerdown`/`pointerup` en `world.renderer.three.domElement`. En `pointerup`, si el botón fue izquierdo y el desplazamiento del puntero fue menor a 5px respecto al `pointerdown`, se considera "click" (no drag/pan) y se dispara `fragments.raycast({ camera: world.camera.three, mouse: <NDC>, dom: canvas })`.
- Si hay hit: se resalta con `highlightLocalIds` (ya existente) y se invoca un callback nuevo expuesto en `IFCViewerAPI`: `onElementPicked: (cb: (localId: number) => void) => void`.
- Si no hay hit (click al vacío): no-op.
- En `IFCViewer`: al recibir el pick, (1) si el panel no está abierto lo abre reusando la lógica de `openStructureSheet` (incluida carga lazy del árbol si hace falta — con un ref para aplicar la revelación una vez el árbol termine de cargar), (2) actualiza `selectedLocalId`, (3) el árbol calcula y fuerza abiertas las ramas ancestro (misma función utilitaria) y hace `scrollIntoView({ block: 'nearest' })` sobre la fila.
- No se toca el mapa/Mapbox — el pedido es específicamente sobre el visor 3D standalone.

## Fuera de alcance

- Selección múltiple, medición, o cualquier otra interacción 3D nueva.
- Navegación "siguiente/anterior resultado" del buscador — podar + expandir + resaltar ya resuelve el problema reportado.
- Cambios en el mapa/Mapbox.

## Testing

No hay suite de tests (ver CLAUDE.md). Verificación manual (`npm run dev`):
1. Buscar por nombre parcial → podado + expansión + resaltado.
2. Buscar por tipo IFC (ej. "wall") → aparecen todos los muros.
3. Panel cerrado, click izquierdo sin arrastrar sobre un elemento en 3D → panel se abre solo, árbol expandido, scrolleado y resaltado en el nodo correcto.
4. Panel abierto, repetir click en 3D → mismo resultado sin cerrar/reabrir.
5. Click y arrastre (pan) → no dispara selección.
6. Click en el vacío → no pasa nada.
