# Diseño: rediseño visual del árbol espacial IFC

## Contexto

Con el buscador ya implementado (ver `2026-08-04-tree-navigation-design.md`), el usuario preguntó si el árbol también quedó "más lindo e interactuable" — no, solo se agregó el buscador. El árbol sigue viéndose como una terminal: fuente monoespaciada, conectores ASCII dibujados a mano (`├──`, `└──`, `│`), fondo oscuro (`bg-neutral-950/40`) **dentro** de un panel lateral claro (`InspectorSidePanel`, `bg-white text-gray-900`) — un choque de tema real, no solo percibido.

Decidido explícitamente con el usuario (terminal + compañero visual, un screen con 2 mockups):
- Migrar de la metáfora "árbol de terminal" a una **lista moderna con indentación por nivel**, tipografía normal (no monoespaciada), tema claro consistente con el panel.
- **Sin líneas guía de jerarquía** (se mostraron ambas opciones; el usuario eligió solo indentación — "más limpio").
- **Íconos por tipo de elemento IFC**, con un set curado de tipos frecuentes (muro, losa, puerta, ventana, viga, columna, techo, escalera, espacio, sitio, edificio, planta) + **un ícono genérico de respaldo** para cualquier tipo IFC no mapeado (la norma IFC tiene decenas de tipos — no se mapean todos).
- El checkbox siempre visible para ocultar geometría pasa a un **ícono de ojo que aparece solo al hacer hover** sobre la fila (o si el elemento ya está oculto).
- Fila seleccionada: acento de color (borde izquierdo azul + fondo azul claro) en vez del actual `bg-white/10` (que solo funcionaba sobre fondo oscuro).

Fuera de alcance: cualquier cambio de comportamiento/selección (esto es 100% visual/interacción de bajo nivel), la funcionalidad de selección 3D↔árbol (removida a pedido del usuario en este mismo hilo), y el buscador en sí (su lógica de filtrado/expansión ya funciona, solo cambia su estilo visual para matchear el nuevo tema).

## Investigación

- `src/components/ifc/ifc-spatial-tree-node.tsx`: hoy construye la indentación concatenando strings (`prefix`, `connector`, `nextPrefix`) con caracteres ASCII (`├── `, `└── `, `│   `). Esto se reemplaza por un `depth: number` prop (incrementado en cada llamada recursiva) usado para el padding-left de cada fila.
- `src/lib/ifc-spatial-tree-helpers.ts`: `ifcCategoryLabel(category)` ya normaliza el category crudo del IFC a un string tipo `"IfcWall"`, `"IfcSlab"`, etc. — es la clave natural para el mapeo de íconos, evita re-normalizar el string dos veces.
- Verificado contra el paquete `lucide-react` instalado (todos los siguientes archivos de ícono existen en `node_modules/lucide-react/dist/esm/icons/`): `MapPin`, `Building2`, `Layers`, `Square`, `RectangleVertical`, `Layers3`, `DoorOpen`, `PanelTop`, `SeparatorHorizontal`, `Columns3`, `Triangle`, `MoveUpRight`, `Box` (fallback), `Eye`/`EyeOff`, `Search`, `ChevronRight` (ya usado).
- `InspectorSidePanel` (`src/components/validator/inspector-side-panel.tsx`): panel claro, `bg-white text-gray-900` — el árbol debe adoptar esta paleta, no la propia.
- `src/components/ifc/ifc-spatial-structure-panel.tsx`: dueño del input de búsqueda (ya con debounce, `visibleSet`/`forceOpenSet` para podar/expandir por búsqueda) — solo cambia su estilo visual (clases Tailwind), no su lógica.

## Diseño

### Mapeo de íconos por tipo IFC (nuevo, `src/lib/ifc-category-icons.ts`)

```ts
export const ifcCategoryIcon = (categoryLabel: string): LucideIcon => {
  const map: Record<string, LucideIcon> = {
    IfcBeam: SeparatorHorizontal,
    IfcBuilding: Building2,
    IfcBuildingStorey: Layers,
    IfcColumn: Columns3,
    IfcDoor: DoorOpen,
    IfcRoof: Triangle,
    IfcSite: MapPin,
    IfcSlab: Layers3,
    IfcSpace: Square,
    IfcStair: MoveUpRight,
    IfcStairFlight: MoveUpRight,
    IfcWall: RectangleVertical,
    IfcWallStandardCase: RectangleVertical,
    IfcWindow: PanelTop,
  };

  return map[categoryLabel] ?? Box; // fallback genérico para cualquier tipo no mapeado
};
```

Recibe el resultado de `ifcCategoryLabel(node.category)` (ya normalizado a `"IfcWall"` etc.), evitando duplicar la lógica de normalización.

### Indentación (reemplaza el sistema de prefijos ASCII)

`IfcSpatialTreeNode` gana un prop `depth: number` (la raíz llama con `depth={0}`, cada hijo recibe `depth + 1`). El padding-left de la fila se calcula como `depth * 20px` (vía `style`, ya que es un valor dinámico no expresable con clases Tailwind estáticas). Se eliminan `prefix`, `connector`, `nextPrefix`, `isLast` dejan de tener uso ASCII (el conector visual desaparece; `isLast` puede eliminarse si no lo usa nada más — a confirmar en el plan).

### Paleta e interacción

- Contenedor del árbol: fondo transparente/blanco (hereda del panel), texto `text-gray-900`, tipografía por defecto (sacar `font-mono`), tamaño `text-sm`.
- Fila en hover: `hover:bg-gray-50`.
- Fila seleccionada: `bg-blue-50` + `border-l-2 border-blue-500` (acento), reemplaza `bg-white/10`.
- Ícono de ocultar geometría: pasa de `<input type="checkbox">` siempre visible a un botón con `Eye`/`EyeOff` (lucide-react) con `opacity-0 group-hover:opacity-100` (usando `group` de Tailwind en el wrapper de la fila) — **excepción**: si el elemento ya está oculto, el ícono (`EyeOff`) queda siempre visible (no solo en hover), para que el usuario pueda encontrar y volver a mostrar elementos ocultos sin tener que pasar el mouse fila por fila.
- Buscador (`ifc-spatial-structure-panel.tsx`): input restyleado a tema claro + ícono `Search` a la izquierda dentro del input.
- Chevron de expandir/colapsar: se mantiene (`ChevronRight` + rotación), solo cambia color para tema claro (`text-gray-400`, hover `text-gray-600`).

## Fuera de alcance

- Cualquier cambio de lógica/comportamiento de selección, búsqueda o poda — ya implementados y aprobados, solo se re-estiliza.
- Selección 3D↔árbol — removida, no se reintroduce.
- Líneas guía de jerarquía — evaluadas y descartadas explícitamente por el usuario.
- Mapeo exhaustivo de todos los tipos IFC de la norma — solo el set curado + fallback genérico.

## Testing

No hay suite de tests en el proyecto. Verificación: `npm run lint` + `npm run build` (type-check), y verificación manual en `npm run dev` — cargar un IFC con variedad de tipos (muros, puertas, ventanas, losas, y al menos un tipo no mapeado) y confirmar: tema claro consistente con el panel, íconos correctos (y el genérico para el tipo no mapeado), indentación por nivel sin conectores ASCII, hover revela el ojo, fila seleccionada con acento azul, elemento ya oculto muestra el ícono de ojo tachado sin necesidad de hover, buscador con ícono de lupa y estilo claro.
