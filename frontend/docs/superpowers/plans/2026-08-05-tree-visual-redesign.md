# Tree Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the IFC spatial tree panel from a terminal/ASCII-art look (monospace font, hand-drawn `├──`/`└──` connectors, dark background inside a light panel) into a modern, light-themed, icon-driven indented list — matching the mockup direction the user approved via the visual companion (indentation only, no guide lines).

**Architecture:** Three independent, sequential changes: (1) a new pure lookup module mapping normalized IFC category strings to `lucide-react` icon components with a generic fallback; (2) a rewrite of `IfcSpatialTreeNode`'s row rendering — depth-based indentation replacing string-built ASCII connectors, a category icon per row, a hover-revealed eye/eye-off toggle replacing the always-visible checkbox, and light-theme colors including a left-accent-border selected state; (3) a light-theme restyle of the container and search input in `IfcSpatialStructurePanel`, whose only structural change is updating its one call site to the new `depth`-based prop shape. No search/filter/selection logic changes anywhere — this is styling and one interaction-pattern swap (checkbox → hover-toggle), not behavior.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, `lucide-react` (icon set already a project dependency).

## Global Constraints

- No test framework exists in this repo — verification is `npm run lint` + `npm run build` (type-check) plus manual `npm run dev` checks. Do not add a test runner.
- ESLint enforces: single quotes, 2-space indent, alphabetically sorted object keys/props (`sort-keys`), trailing commas in multiline expressions, space before function parens.
- Icon mapping is limited to exactly the 13 curated `Ifc*` category labels below, plus one generic fallback (`Box`) — do not attempt to cover every IFC entity type.
- No hierarchy guide lines (vertical connector lines between parent/child rows) — the user explicitly chose indentation-only after seeing both options in a mockup.
- Do not change any search/filter/selection/highlight *behavior* — `searchInput`, `activeQuery`, `searchReveal`, `visibleSet`, `forceOpenSet`, the 150ms debounce, `onRowActivate`'s highlight logic, and `onSelectChange` all keep their current logic untouched. Only their visual presentation (and, for the hide toggle, its interaction pattern) changes.
- Do not touch `src/components/map-box/` or anything Mapbox-related.
- All `lucide-react` icon names referenced below were verified to exist in the installed package version (`node_modules/lucide-react/dist/esm/icons/`): `box`, `building-2`, `columns-3`, `door-open`, `layers`, `layers-3`, `map-pin`, `move-up-right`, `panel-top`, `rectangle-vertical`, `separator-horizontal`, `square`, `triangle`, `eye`, `eye-off`, `search`, `chevron-right`.

---

### Task 1: IFC category → icon lookup

**Files:**
- Create: `src/lib/ifc-category-icons.ts`

**Interfaces:**
- Consumes: nothing project-specific — only `lucide-react`'s `LucideIcon` type and named icon exports.
- Produces: `ifcCategoryIcon(categoryLabel: string): LucideIcon`, exported from `src/lib/ifc-category-icons.ts`. Task 2 imports this and calls it as `ifcCategoryIcon(ifcCategoryLabel(node.category))` (`ifcCategoryLabel` already exists in `src/lib/ifc-spatial-tree-helpers.ts` and normalizes a raw IFC category string to `"IfcWall"`-style labels — this task does not touch that function, only consumes its output shape).

- [ ] **Step 1: Create the icon lookup module**

Create `src/lib/ifc-category-icons.ts`:

```ts
import type { LucideIcon } from 'lucide-react';
import {
  Box,
  Building2,
  Columns3,
  DoorOpen,
  Layers,
  Layers3,
  MapPin,
  MoveUpRight,
  PanelTop,
  RectangleVertical,
  SeparatorHorizontal,
  Square,
  Triangle,
} from 'lucide-react';

const ifcCategoryIconMap: Record<string, LucideIcon> = {
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

/** Generic fallback (`Box`) for any IFC category outside the curated map above. */
export const ifcCategoryIcon = (categoryLabel: string): LucideIcon =>
  ifcCategoryIconMap[categoryLabel] ?? Box;
```

- [ ] **Step 2: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ifc-category-icons.ts
git commit -m "$(cat <<'EOF'
Add IFC category to icon lookup

Maps the most common IFC element types (from Revit/SketchUp exports)
to a lucide-react icon, with a generic fallback for anything outside
the curated set — the norm has far more entity types than are worth
hand-mapping.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rewrite `IfcSpatialTreeNode` — indentation, icons, hover-reveal hide toggle, light theme

**Files:**
- Modify: `src/components/ifc/ifc-spatial-tree-node.tsx` (full-file rewrite — nearly every render path changes; the props/behavior changes below are large enough that reasoning from a diff would be harder than reasoning from the target file)

**Interfaces:**
- Consumes: `ifcCategoryIcon` (Task 1, `@/lib/ifc-category-icons`), `ifcCategoryLabel` (already exported from `@/lib/ifc-spatial-tree-helpers`, alongside the already-imported `spatialTreeRowLabel`).
- Produces: `IfcSpatialTreeNodeProps` changes shape — **`prefix: string` and `isLast: boolean` are removed, `depth: number` is added.** `isRoot: boolean`, `forceOpenSet`, `visibleSet`, `searchQuery`, `selectedLocalId`, `onSelectChange`, `onToggleHidden`, `getViewerApi`, `hiddenMap`, `node` all keep their exact current names/types. Task 3's one call site (the root `<IfcSpatialTreeNode>` in `IfcSpatialStructurePanel`) must be updated to pass `depth={0}` and drop `prefix`/`isLast` — this is Task 3's job, not this task's, but note the shape change here since Task 3 depends on it.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `src/components/ifc/ifc-spatial-tree-node.tsx` with:

```tsx
import type { SpatialTreeItem } from '@thatopen/fragments';
import * as FRAGS from '@thatopen/fragments';
import {
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  type MouseEventHandler,
  useState,
} from 'react';
import { Color } from 'three';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import type { IFCViewerAPI } from '@/lib/ifc-viewer';
import { ifcCategoryIcon } from '@/lib/ifc-category-icons';
import {
  ifcCategoryLabel,
  spatialTreeRowLabel,
} from '@/lib/ifc-spatial-tree-helpers';

import { cn } from '@/lib/utils';

const highlightMaterial: FRAGS.MaterialDefinition = {
  color: new Color('gold'),
  opacity: 1,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  transparent: false,
};

const renderHighlightedLabel = (label: string, query: string) => {
  if (!query) return label;

  const idx = label.toLowerCase().indexOf(query);

  if (idx === -1) return label;

  return (
    <>
      {label.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-400/70 text-inherit">
        {label.slice(idx, idx + query.length)}
      </mark>
      {label.slice(idx + query.length)}
    </>
  );
};

export type IfcSpatialTreeNodeProps = {
  depth: number;
  forceOpenSet?: Set<SpatialTreeItem> | null;
  getViewerApi: () => IFCViewerAPI | null;
  hiddenMap: Record<number, boolean>;
  isRoot: boolean;
  node: SpatialTreeItem;
  onSelectChange: (localId: number | null) => void;
  onToggleHidden: (localId: number, hide: boolean) => void;
  searchQuery?: string;
  selectedLocalId: number | null;
  visibleSet?: Set<SpatialTreeItem> | null;
};

export const IfcSpatialTreeNode = ({
  depth,
  forceOpenSet = null,
  getViewerApi,
  hiddenMap,
  isRoot,
  node,
  onSelectChange,
  onToggleHidden,
  searchQuery = '',
  selectedLocalId,
  visibleSet = null,
}: IfcSpatialTreeNodeProps) => {
  const api = getViewerApi();
  const model = api?.getPrimaryFragmentsModel();
  const rowLabel = spatialTreeRowLabel(node);
  const CategoryIcon = ifcCategoryIcon(ifcCategoryLabel(node.category));
  const canInteract = node.localId != null && model;
  const isHidden = node.localId != null && Boolean(hiddenMap[node.localId]);
  const allKids = node.children ?? [];
  const kids = visibleSet ? allKids.filter((child) => visibleSet.has(child)) : allKids;
  const hasKids = kids.length > 0;

  const isSelected =
    node.localId != null && selectedLocalId === node.localId;

  const [open, setOpen] = useState(isRoot);
  const isForcedOpen = Boolean(forceOpenSet?.has(node));
  const effectiveOpen = open || isForcedOpen;

  const onRowActivate = async () => {
    if (!canInteract || node.localId == null || !api) return;

    const prev = selectedLocalId;

    if (prev != null && prev !== node.localId) {
      await api.resetHighlightLocalIds([prev]);
    }

    await api.highlightLocalIds([node.localId], highlightMaterial);
    onSelectChange(node.localId);
  };

  const onToggleHiddenClick: MouseEventHandler<HTMLButtonElement> = async (e) => {
    e.stopPropagation();

    if (!canInteract || node.localId == null || !api) return;

    const m = api.getPrimaryFragmentsModel();

    if (!m) return;

    const nextHide = !isHidden;

    onToggleHidden(node.localId, nextHide);
    await m.setVisible([node.localId], !nextHide);
    api.updateFragmentsView();
  };

  const rowInner = (
    <>
      <CategoryIcon aria-hidden className="size-4 shrink-0 text-gray-500" />
      <button
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm disabled:cursor-default',
          canInteract ? 'cursor-pointer text-gray-900' : 'cursor-default text-gray-400',
        )}
        disabled={!canInteract}
        title={canInteract ? 'Resaltar en el visor 3D' : 'Sin id local / sin modelo'}
        type="button"
        onClick={onRowActivate}
      >
        {renderHighlightedLabel(rowLabel, searchQuery)}
      </button>
      <button
        aria-label={isHidden ? 'Mostrar geometría en el visor' : 'Ocultar geometría en el visor'}
        className={cn(
          'shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600',
          isHidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          !canInteract && 'pointer-events-none opacity-0',
        )}
        disabled={!canInteract}
        title={isHidden ? 'Mostrar geometría' : 'Ocultar geometría'}
        type="button"
        onClick={onToggleHiddenClick}
      >
        {isHidden
          ? <EyeOff aria-hidden className="size-3.5" />
          : <Eye aria-hidden className="size-3.5" />}
      </button>
    </>
  );

  const rowClassName = cn(
    'group flex items-center gap-1.5 rounded border-l-2 border-transparent py-1 pr-1',
    isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50',
  );

  const rowStyle = { paddingLeft: `${depth * 20}px` };

  if (!hasKids) {
    return (
      <div className="select-none text-sm">
        <div className={rowClassName} style={rowStyle}>
          <span aria-hidden className="inline-flex size-5 shrink-0" />
          {rowInner}
        </div>
      </div>
    );
  }

  return (
    <Collapsible
      className="select-none text-sm"
      open={effectiveOpen}
      onOpenChange={setOpen}
    >
      <div className={rowClassName} style={rowStyle}>
        <CollapsibleTrigger asChild>
          <Button
            className="size-5 shrink-0 p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            size="icon"
            title={effectiveOpen ? 'Colapsar rama' : 'Expandir rama'}
            type="button"
            variant="ghost"
          >
            <ChevronRight
              aria-hidden
              className={cn('size-3.5 transition-transform', effectiveOpen && 'rotate-90')}
            />
          </Button>
        </CollapsibleTrigger>
        {rowInner}
      </div>
      <CollapsibleContent className="mt-0 space-y-0 data-[state=closed]:animate-none">
        {kids.map((ch, i) => (
          <IfcSpatialTreeNode
            key={`${String(ch.localId)}-${String(ch.category)}-${i}`}
            depth={depth + 1}
            forceOpenSet={forceOpenSet}
            getViewerApi={getViewerApi}
            hiddenMap={hiddenMap}
            isRoot={false}
            node={ch}
            onSelectChange={onSelectChange}
            onToggleHidden={onToggleHidden}
            searchQuery={searchQuery}
            selectedLocalId={selectedLocalId}
            visibleSet={visibleSet}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};
```

Notes on what changed and why, in case anything looks surprising during review:
- `prefix`/`connector`/`nextPrefix`/`isLast` (the ASCII-tree string-building system) are gone entirely, replaced by the numeric `depth` prop and `paddingLeft: depth * 20px` inline style (a dynamic per-row value, not expressible with static Tailwind classes).
- The always-visible hide/show `<input type="checkbox">` is replaced by an `Eye`/`EyeOff` icon button that is `opacity-0` by default, revealed on `group-hover` (the row wrapper carries the `group` class), except when the element is already hidden — then the `EyeOff` icon stays at `opacity-100` unconditionally, so a user scanning the tree can spot and un-hide elements without hovering row-by-row.
- The selected row always reserves a 2px `border-transparent` on the left (`border-l-2 border-transparent`), switching only its *color* to `border-blue-500` when selected — this avoids a 2px content shift when a row becomes/stops being selected (a border that only appears on selection would shift everything right by its own width).
- Typography moves from `font-mono text-[0.72rem]` to the ambient `text-sm` (no explicit font override, so it inherits whatever sans-serif the app already uses elsewhere).
- `onHideChange` (a `ChangeEventHandler` reacting to a checkbox's `onChange`) becomes `onToggleHiddenClick` (a `MouseEventHandler` reacting to a button's `onClick`) — same underlying calls (`onToggleHidden`, `m.setVisible`, `api.updateFragmentsView()`), just driven by a toggle-button click instead of a checkbox state change.

- [ ] **Step 2: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: `npm run build` FAILS at this point — the one caller of `<IfcSpatialTreeNode>` (`IfcSpatialStructurePanel`, in `src/components/ifc/ifc-spatial-structure-panel.tsx`) still passes the old `prefix`/`isLast` props and is missing the new required `depth` prop. Confirm the error is exactly a props-mismatch TypeScript error at that one call site, nothing else — this is expected and gets fixed in Task 3, which is next.

- [ ] **Step 3: Commit**

```bash
git add src/components/ifc/ifc-spatial-tree-node.tsx
git commit -m "$(cat <<'EOF'
Restyle the spatial tree row: depth indentation, category icons, hover-reveal hide toggle

Replaces the ASCII-art terminal look (monospace font, hand-drawn
connectors, dark background) with a light-themed indented list:
depth-based padding instead of prefix strings, an icon per IFC
category, and the always-visible hide checkbox becomes an eye icon
that only appears on row hover (or stays visible if already hidden).
No search/selection/highlight behavior changes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(Committing a known-red build is acceptable here only because Task 3 is the very next task in this same plan and fixes it immediately — do not stop or ship between Task 2 and Task 3.)

---

### Task 3: Light-theme the structure panel container and search input

**Files:**
- Modify: `src/components/ifc/ifc-spatial-structure-panel.tsx`

**Interfaces:**
- Consumes: `IfcSpatialTreeNodeProps`'s new shape (Task 2): `depth: number` replaces `prefix`/`isLast`.
- Produces: none further downstream — this is the last task in the plan; `npm run build` must be fully GREEN after it.

- [ ] **Step 1: Restyle the "no tree" and "no results" text, container, and search input; update the tree call site**

Change:

```tsx
  if (!tree) {
    return (
      <p className="mt-2 text-xs opacity-80">
        Sin datos de árbol.
      </p>
    );
  }

  const noSearchResults = activeQuery !== '' && visibleSet != null && visibleSet.size === 0;

  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col">
      <input
        aria-label="Buscar elemento por nombre o tipo IFC"
        className="mb-2 w-full rounded-md border border-white/10 bg-neutral-950/40 px-2 py-1 font-mono text-[0.72rem] placeholder:opacity-60"
        placeholder="Buscar por nombre o tipo IFC…"
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />
      {noSearchResults ? (
        <p className="text-xs opacity-80">Sin resultados.</p>
      ) : (
        <div className="max-h-[min(60vh,calc(100vh-14rem))] min-h-40 flex-1 overflow-auto rounded-md border border-white/10 bg-neutral-950/40 p-2 pr-1">
          <IfcSpatialTreeNode
            forceOpenSet={forceOpenSet}
            getViewerApi={getViewerApi}
            hiddenMap={hiddenMap}
            isLast
            isRoot
            node={tree}
            prefix=""
            searchQuery={activeQuery}
            selectedLocalId={selectedLocalId}
            visibleSet={visibleSet}
            onSelectChange={setSelectedLocalId}
            onToggleHidden={(localId, hide) => {
              setHiddenMap((prev) => ({
                ...prev,
                [localId]: hide,
              }));
            }}
          />
        </div>
      )}
    </div>
  );
};
```

to:

```tsx
  if (!tree) {
    return (
      <p className="mt-2 text-xs text-gray-500">
        Sin datos de árbol.
      </p>
    );
  }

  const noSearchResults = activeQuery !== '' && visibleSet != null && visibleSet.size === 0;

  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col">
      <div className="relative mb-2">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          aria-label="Buscar elemento por nombre o tipo IFC"
          className="w-full rounded-md border border-gray-200 bg-white py-1.5 pr-2 pl-8 text-sm placeholder:text-gray-400"
          placeholder="Buscar por nombre o tipo IFC…"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
      {noSearchResults ? (
        <p className="text-xs text-gray-500">Sin resultados.</p>
      ) : (
        <div className="max-h-[min(60vh,calc(100vh-14rem))] min-h-40 flex-1 overflow-auto rounded-md border border-gray-200 bg-white p-2 pr-1">
          <IfcSpatialTreeNode
            depth={0}
            forceOpenSet={forceOpenSet}
            getViewerApi={getViewerApi}
            hiddenMap={hiddenMap}
            isRoot
            node={tree}
            searchQuery={activeQuery}
            selectedLocalId={selectedLocalId}
            visibleSet={visibleSet}
            onSelectChange={setSelectedLocalId}
            onToggleHidden={(localId, hide) => {
              setHiddenMap((prev) => ({
                ...prev,
                [localId]: hide,
              }));
            }}
          />
        </div>
      )}
    </div>
  );
};
```

Add the `Search` icon import at the top of the file, alongside the existing `react` import (grouped as its own third-party import per the project's existing import-grouping style — see how `ifc-spatial-tree-node.tsx` groups `lucide-react` separately from `react` and from `@/`-aliased imports):

```tsx
import type { SpatialTreeItem } from '@thatopen/fragments';
import { Search } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { IfcSpatialTreeNode } from '@/components/ifc/ifc-spatial-tree-node';
import type { IFCViewerAPI } from '@/lib/ifc-viewer';
import {
  collectNodesToReveal,
  spatialTreeRowLabel,
} from '@/lib/ifc-spatial-tree-helpers';
```

- [ ] **Step 2: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 errors — this is the task that turns the build green again after Task 2 left it red (missing `depth` prop / stale `prefix`/`isLast` at this file's call site, now fixed).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:5173/validator`, load an IFC file with a variety of element types (at minimum: walls, doors, windows, and something not in the curated 13 — e.g. `IfcFurnishingElement` or `IfcRailing` if the test file has one), open "Estructura IFC".

Check:
1. The tree background matches the light panel (no dark `bg-neutral-950` anywhere) — no theme clash.
2. Rows are indented by depth with plain padding, no `├──`/`└──` characters anywhere.
3. Each row shows a category icon; a type outside the curated 13 shows the generic `Box` fallback icon (not a blank space).
4. Hovering a row reveals an eye icon on the right; clicking it hides the element in the 3D view and the icon switches to a crossed-out eye that stays visible even without hovering; clicking again un-hides it.
5. Clicking a row's label highlights the element gold in the 3D viewer (existing behavior, confirm it still works) and the row shows a blue left-accent border + light blue background — confirm no visible content shift compared to an unselected row (the reserved 2px transparent border should prevent that).
6. The search box has a magnifying-glass icon inside it on the left, light background, normal (non-monospace) text; typing still prunes/expands/highlights matches exactly as before (existing debounce/logic, unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/ifc/ifc-spatial-structure-panel.tsx
git commit -m "$(cat <<'EOF'
Light-theme the structure panel container and search input

Matches the panel's own bg-white/text-gray-900 palette instead of the
previous dark bg-neutral-950 tree background, and adds a search icon
inside the input. No filter/search logic changes — the one behavior
change is the call site update to IfcSpatialTreeNode's new depth prop.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** icon mapping (Task 1), indentation/icons/hover-eye/selected-accent/typography (Task 2), light-theme container/search icon (Task 3), manual verification walks all 6 spec acceptance points. No guide lines anywhere (matches the user's explicit choice). No behavior changes to search/selection logic anywhere (confirmed: `searchInput`/`activeQuery`/`searchReveal`/`visibleSet`/`forceOpenSet`/debounce untouched in Task 3; `onRowActivate`/`onSelectChange` untouched in Task 2 aside from being called from a differently-styled button).
- **Placeholder scan:** no TBD/TODO; every step has literal code.
- **Type consistency:** `IfcSpatialTreeNodeProps` (Task 2: `depth`, no `prefix`/`isLast`) matches exactly what Task 3's call site passes (`depth={0}`, no `prefix`/`isLast`). `ifcCategoryIcon(categoryLabel: string): LucideIcon` (Task 1) matches its one call site in Task 2 (`ifcCategoryIcon(ifcCategoryLabel(node.category))`, where `ifcCategoryLabel` returns `string`).
