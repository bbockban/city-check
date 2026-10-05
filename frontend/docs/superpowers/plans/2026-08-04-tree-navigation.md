# Tree Search and 3D-to-Tree Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a text search/filter to the IFC spatial tree panel, and let clicking an element in the standalone 3D viewer reveal and highlight it in that tree — both directions of "find this element" now work.

**Architecture:** A single shared tree-traversal utility (`collectNodesToReveal`) computes, given a match predicate, the set of tree nodes (by object identity, not `localId`, since some aggregate nodes have `localId === null`) that must stay visible/force-open. The search box and the 3D-pick flow both call it with different predicates. Selection (`selectedLocalId`) is lifted from `IfcSpatialStructurePanel` to `IFCViewer` so a 3D click — which can happen while the panel is closed — can open the panel and drive it. A new one-shot `revealTargetLocalId` (distinct from `selectedLocalId`) exists purely to trigger "force these ancestors open + scroll to this node" once per pick, without permanently pinning the tree open or fighting the user's manual expand/collapse afterward.

**Tech Stack:** React 19, TypeScript, `@thatopen/fragments` (`FragmentsManager.raycast`), three.js (`Vector2`), Tailwind (existing `cn` helper).

## Global Constraints

- No test framework exists in this repo (confirmed: no `vitest`/`jest` config, no `tests/` directory). Every task is verified via `npm run lint`, `npm run build` (type-check), and a manual browser check with `npm run dev` — do not introduce a test runner as part of this plan.
- ESLint enforces: single quotes, 2-space indent, alphabetically sorted object keys (`sort-keys`), trailing commas in multiline expressions, space before function parens. Run `npm run lint -- --fix` if `sort-keys-fix` can auto-resolve ordering.
- Do not touch `src/components/map-box/` or anything Mapbox-related — this feature is standalone-IFC-viewer only.
- Do not add a debounce library — none exists in `package.json`; implement debouncing with a plain `useEffect` + `setTimeout`.
- Pruning (hiding non-matching nodes) only happens while the search box has text. The 3D-pick reveal must never hide sibling branches — it only forces the ancestor chain of the picked node open and scrolls to it.

---

### Task 1: Shared reveal utility and shared highlight material

**Files:**
- Modify: `src/lib/ifc-spatial-tree-helpers.ts`
- Modify: `src/components/ifc/ifc-spatial-tree-node.tsx:1-27` (remove local `highlightMaterial`, import the shared one)

**Interfaces:**
- Consumes: nothing new (pure addition to an existing helpers file).
- Produces:
  - `collectNodesToReveal(tree: SpatialTreeItem, matches: (node: SpatialTreeItem) => boolean): Set<SpatialTreeItem>` — exported from `src/lib/ifc-spatial-tree-helpers.ts`. Returns the set of node objects (by reference) that are either a match themselves or an ancestor of a match. Task 2 and Task 3 both call this.
  - `spatialTreeHighlightMaterial: FRAGS.MaterialDefinition` — exported from the same file. Task 2 and Task 4 both use it (replaces the material object currently duplicated only in `ifc-spatial-tree-node.tsx`).

- [ ] **Step 1: Add the shared highlight material and the reveal utility to `ifc-spatial-tree-helpers.ts`**

Current top of the file:

```ts
import type { SpatialTreeItem } from '@thatopen/fragments';

/** IFC Name / long name when the fragment tree exposes it (often absent). */
const spatialTreeName = (node: SpatialTreeItem) => {
```

Replace the import line and insert the new exports right after `spatialTreeName`'s closing brace (i.e. right before `spatialTreeRowLabel`):

```ts
import type { SpatialTreeItem } from '@thatopen/fragments';
import * as FRAGS from '@thatopen/fragments';
import { Color } from 'three';

/** IFC Name / long name when the fragment tree exposes it (often absent). */
const spatialTreeName = (node: SpatialTreeItem) => {
  const n = node as SpatialTreeItem & { longName?: unknown; name?: unknown };
  const pick = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  return pick(n.name) || pick(n.longName);
};

/** Shared highlight style for both tree-driven and 3D-pick-driven selection. */
export const spatialTreeHighlightMaterial: FRAGS.MaterialDefinition = {
  color: new Color('gold'),
  opacity: 1,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  transparent: false,
};

/**
 * Node objects (by reference, not localId — some aggregate nodes have
 * localId === null) that are either a match themselves or an ancestor of a
 * match. Used to force-open branches and, while a search is active, to
 * prune non-matching nodes.
 */
export const collectNodesToReveal = (
  tree: SpatialTreeItem,
  matches: (node: SpatialTreeItem) => boolean,
): Set<SpatialTreeItem> => {
  const nodesToReveal = new Set<SpatialTreeItem>();

  const visit = (node: SpatialTreeItem): boolean => {
    let matched = matches(node);

    for (const child of node.children ?? []) {
      if (visit(child)) matched = true;
    }

    if (matched) nodesToReveal.add(node);

    return matched;
  };

  visit(tree);

  return nodesToReveal;
};
```

- [ ] **Step 2: Point `ifc-spatial-tree-node.tsx` at the shared material**

In `src/components/ifc/ifc-spatial-tree-node.tsx`, remove:

```ts
import * as FRAGS from '@thatopen/fragments';
```
(keep the existing `import type { SpatialTreeItem } from '@thatopen/fragments';` if present — check the real current import; as of this plan's writing the file imports `import * as FRAGS from '@thatopen/fragments';` at line 2 and does NOT separately import `SpatialTreeItem` as a type from there, it imports it via `IfcSpatialTreeNodeProps`'s `node: SpatialTreeItem` using the same `FRAGS` namespace is not the case — the real current line 1 is `import type { SpatialTreeItem } from '@thatopen/fragments';`, so both the type import and the `* as FRAGS` import currently coexist; remove only the `* as FRAGS` line, keep the `type { SpatialTreeItem }` line untouched)

and remove:

```ts
import { Color } from 'three';
```

and remove the whole local declaration:

```ts
const highlightMaterial: FRAGS.MaterialDefinition = {
  color: new Color('gold'),
  opacity: 1,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  transparent: false,
};
```

Add, alongside the other `@/lib` imports:

```ts
import { spatialTreeHighlightMaterial } from '@/lib/ifc-spatial-tree-helpers';
```

(this import already exists in the file for `spatialTreeRowLabel` — add `spatialTreeHighlightMaterial` to the same import statement's named list, keeping it alphabetically sorted per `sort-keys`/import ordering)

Then in `onRowActivate`, change:

```ts
    await api.highlightLocalIds([node.localId], highlightMaterial);
```

to:

```ts
    await api.highlightLocalIds([node.localId], spatialTreeHighlightMaterial);
```

- [ ] **Step 3: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 new errors. `FRAGS`/`Color` unused-import errors must be gone from `ifc-spatial-tree-node.tsx`; `ifc-spatial-tree-helpers.ts` must compile with the new `FRAGS`/`Color` imports.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ifc-spatial-tree-helpers.ts src/components/ifc/ifc-spatial-tree-node.tsx
git commit -m "$(cat <<'EOF'
Add shared tree-reveal utility and de-duplicate highlight material

collectNodesToReveal will back both the tree search box and 3D-pick
reveal; the highlight material moves out of ifc-spatial-tree-node.tsx
so ifc-viewer.ts's upcoming raycast picker can reuse the same style.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `IfcSpatialTreeNode` — pruning, forced-open, highlighted text, scroll-into-view

**Files:**
- Modify: `src/components/ifc/ifc-spatial-tree-node.tsx`

**Interfaces:**
- Consumes: `collectNodesToReveal` result type (`Set<SpatialTreeItem>`) — Task 3 will actually call `collectNodesToReveal` and pass the resulting sets down as props; this task only defines and uses the props on the component, with `null` as the safe "no filter active" default so the component works standalone before Task 3 wires it up.
- Produces: `IfcSpatialTreeNodeProps` gains three new fields (`forceOpenSet`, `visibleSet`, `searchQuery`) that Task 3 must pass when rendering the root `<IfcSpatialTreeNode>`.

- [ ] **Step 1: Extend `IfcSpatialTreeNodeProps` and thread the new props through recursion**

Change the props type from:

```ts
export type IfcSpatialTreeNodeProps = {
  getViewerApi: () => IFCViewerAPI | null;
  hiddenMap: Record<number, boolean>;
  isLast: boolean;
  isRoot: boolean;
  node: SpatialTreeItem;
  onSelectChange: (localId: number | null) => void;
  onToggleHidden: (localId: number, hide: boolean) => void;
  prefix: string;
  selectedLocalId: number | null;
};
```

to:

```ts
export type IfcSpatialTreeNodeProps = {
  forceOpenSet: Set<SpatialTreeItem> | null;
  getViewerApi: () => IFCViewerAPI | null;
  hiddenMap: Record<number, boolean>;
  isLast: boolean;
  isRoot: boolean;
  node: SpatialTreeItem;
  onSelectChange: (localId: number | null) => void;
  onToggleHidden: (localId: number, hide: boolean) => void;
  prefix: string;
  searchQuery: string;
  selectedLocalId: number | null;
  visibleSet: Set<SpatialTreeItem> | null;
};
```

Add the matching parameters to the component signature (destructured, keep alphabetical order to satisfy `sort-keys`):

```ts
export const IfcSpatialTreeNode = ({
  forceOpenSet,
  getViewerApi,
  hiddenMap,
  isLast,
  isRoot,
  node,
  onSelectChange,
  onToggleHidden,
  prefix,
  searchQuery,
  selectedLocalId,
  visibleSet,
}: IfcSpatialTreeNodeProps) => {
```

- [ ] **Step 2: Filter children by `visibleSet` before computing `kids`/`hasKids`**

Change:

```ts
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;
```

to:

```ts
  const allKids = node.children ?? [];
  const kids = visibleSet ? allKids.filter((child) => visibleSet.has(child)) : allKids;
  const hasKids = kids.length > 0;
```

- [ ] **Step 3: Force-open via `forceOpenSet`, on top of the existing manual toggle**

Change:

```ts
  const [open, setOpen] = useState(isRoot);
```

to (unchanged — manual toggle state stays exactly as-is):

```ts
  const [open, setOpen] = useState(isRoot);
  const isForcedOpen = Boolean(forceOpenSet?.has(node));
  const effectiveOpen = open || isForcedOpen;
```

Change the `<Collapsible open={open} onOpenChange={setOpen}>` usage to:

```ts
    <Collapsible
      className="select-none font-mono text-[0.72rem]"
      open={effectiveOpen}
      onOpenChange={setOpen}
    >
```

(only the `open` prop value changes, from `open` to `effectiveOpen`; `onOpenChange` keeps updating the manual `open` state as before — once `forceOpenSet` stops containing this node on a later render, `effectiveOpen` falls back to whatever the user last manually set)

- [ ] **Step 4: Highlight the matched substring in the row label**

Add a small helper above the component (after the `highlightMaterial`-related imports, before `IfcSpatialTreeNodeProps`):

```ts
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
```

Change the button's rendered content from:

```ts
        onClick={onRowActivate}
      >
        {treeLine}
      </button>
```

to:

```ts
        onClick={onRowActivate}
      >
        {prefix}
        {connector}
        {renderHighlightedLabel(rowLabel, searchQuery)}
      </button>
```

(`treeLine` itself — `` `${prefix}${connector}${rowLabel}` `` — is no longer needed for rendering; leave its declaration in place only if still referenced elsewhere in the file — it is not, per the current file content, so remove the `const treeLine = ...` line entirely to avoid an unused-variable lint error)

- [ ] **Step 5: Scroll the row into view when it becomes selected**

Add the `useRef` import to the existing React import line. Current:

```ts
import {
  type ChangeEventHandler,
  useState,
} from 'react';
```

becomes:

```ts
import {
  type ChangeEventHandler,
  useEffect,
  useRef,
  useState,
} from 'react';
```

Add, right after the `isSelected` computation:

```ts
  const isSelected =
    node.localId != null && selectedLocalId === node.localId;

  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);
```

Attach `ref={rowRef}` to both row wrapper `<div>`s that currently carry `isSelected && 'bg-white/10'` (the no-children branch and the has-children branch), e.g.:

```ts
        <div
          ref={rowRef}
          className={cn(
            'flex flex-wrap items-start gap-1 rounded px-0.5 py-[0.15rem] pl-0',
            isSelected && 'bg-white/10',
          )}
        >
```

and the equivalent one in the `Collapsible` branch.

- [ ] **Step 6: Propagate the three new props to the recursive call**

In the `kids.map((ch, i) => (<IfcSpatialTreeNode .../>))` block, add the three new props (keep alphabetical order):

```ts
        {kids.map((ch, i) => (
          <IfcSpatialTreeNode
            key={`${String(ch.localId)}-${String(ch.category)}-${i}`}
            forceOpenSet={forceOpenSet}
            getViewerApi={getViewerApi}
            hiddenMap={hiddenMap}
            isLast={i === kids.length - 1}
            isRoot={false}
            node={ch}
            onSelectChange={onSelectChange}
            onToggleHidden={onToggleHidden}
            prefix={nextPrefix}
            searchQuery={searchQuery}
            selectedLocalId={selectedLocalId}
            visibleSet={visibleSet}
          />
        ))}
```

- [ ] **Step 7: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 new errors. This component now fails to compile standalone until its one caller (`IfcSpatialStructurePanel`, Task 3) supplies the 3 new required props — that's expected and gets fixed in Task 3's first step. If you'd rather keep the tree green after this task in isolation, make the 3 new props optional with `| undefined` and default them to `null`/`''` via destructuring defaults (`forceOpenSet = null`, `visibleSet = null`, `searchQuery = ''`) — do that now so `npm run build` passes before Task 3 exists.

- [ ] **Step 8: Commit**

```bash
git add src/components/ifc/ifc-spatial-tree-node.tsx
git commit -m "$(cat <<'EOF'
Support pruning, forced-open branches, text highlight and autoscroll in the spatial tree node

Lays the per-node groundwork for the search box and 3D-click reveal
(both wired in the next tasks): a node can now be hidden by a filter,
forced open regardless of its own manual toggle, rendered with a
highlighted substring, and scrolled into view when selected.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Search box in `IfcSpatialStructurePanel`, lifted selection props

**Files:**
- Modify: `src/components/ifc/ifc-spatial-structure-panel.tsx`

**Interfaces:**
- Consumes: `collectNodesToReveal` (Task 1, `src/lib/ifc-spatial-tree-helpers.ts`), `spatialTreeRowLabel` (already exported from the same file), the extended `IfcSpatialTreeNodeProps` (Task 2).
- Produces: `IfcSpatialStructurePanelProps` gains `onRevealHandled`, `onSelectedLocalIdChange`, `revealTargetLocalId`, `selectedLocalId` — Task 5 (which touches `IfcViewerStructurePanelContent` and `IFCViewer`) must supply these when rendering `<IfcSpatialStructurePanel>`. Until Task 5 lands, this task makes the props required, which will fail `npm run build` at the one call site (`ifc-viewer-structure-panel-content.tsx`) — that's expected; Task 5 fixes it. This is called out again in Task 5's first step so the build is known to be red between Task 3 and Task 5.

- [ ] **Step 1: Replace the local `selectedLocalId` state with props, add the new props type**

Change:

```ts
import type { SpatialTreeItem } from '@thatopen/fragments';
import { useState } from 'react';

import { IfcSpatialTreeNode } from '@/components/ifc/ifc-spatial-tree-node';
import type { IFCViewerAPI } from '@/lib/ifc-viewer';

type IfcSpatialStructurePanelProps = {
  getViewerApi: () => IFCViewerAPI | null;
  tree: SpatialTreeItem | null;
};

export const IfcSpatialStructurePanel = ({
  getViewerApi,
  tree,
}: IfcSpatialStructurePanelProps) => {
  const [hiddenMap, setHiddenMap] = useState<Record<number, boolean>>({});
  const [selectedLocalId, setSelectedLocalId] = useState<number | null>(null);
```

to:

```ts
import type { SpatialTreeItem } from '@thatopen/fragments';
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

type IfcSpatialStructurePanelProps = {
  getViewerApi: () => IFCViewerAPI | null;
  onRevealHandled: () => void;
  onSelectedLocalIdChange: (localId: number | null) => void;
  revealTargetLocalId: number | null;
  selectedLocalId: number | null;
  tree: SpatialTreeItem | null;
};

export const IfcSpatialStructurePanel = ({
  getViewerApi,
  onRevealHandled,
  onSelectedLocalIdChange,
  revealTargetLocalId,
  selectedLocalId,
  tree,
}: IfcSpatialStructurePanelProps) => {
  const [hiddenMap, setHiddenMap] = useState<Record<number, boolean>>({});
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
```

- [ ] **Step 2: Debounce the search input into `activeQuery` (~150ms)**

Add, right after the `useState` declarations from Step 1:

```ts
  useEffect(() => {
    const id = setTimeout(() => {
      setActiveQuery(searchInput.trim().toLowerCase());
    }, 150);

    return () => clearTimeout(id);
  }, [searchInput]);
```

- [ ] **Step 3: Compute `visibleSet` (search-only pruning) and `forceOpenSet` (search OR pick-reveal)**

Add, right after the debounce effect from Step 2 (before the `if (!tree)` early return):

```ts
  const searchReveal = useMemo(() => {
    if (!tree || !activeQuery) return null;

    return collectNodesToReveal(
      tree,
      (node) => spatialTreeRowLabel(node).toLowerCase().includes(activeQuery),
    );
  }, [tree, activeQuery]);

  const pickReveal = useMemo(() => {
    if (!tree || activeQuery || revealTargetLocalId == null) return null;

    return collectNodesToReveal(
      tree,
      (node) => node.localId === revealTargetLocalId,
    );
  }, [tree, activeQuery, revealTargetLocalId]);

  const visibleSet = searchReveal;
  const forceOpenSet = searchReveal ?? pickReveal;
```

(`activeQuery` non-empty always wins pruning/force-open over a pending pick-reveal — a deliberate, currently-typed filter takes priority over a one-shot 3D-pick signal; see Global Constraints)

- [ ] **Step 4: Clear `revealTargetLocalId` one frame after it was used**

Add, right after the memos from Step 3:

```ts
  useEffect(() => {
    if (revealTargetLocalId == null) return;

    const id = requestAnimationFrame(() => onRevealHandled());

    return () => cancelAnimationFrame(id);
  }, [revealTargetLocalId, onRevealHandled]);
```

- [ ] **Step 5: "Sin resultados" when a search matches nothing**

Change:

```ts
  if (!tree) {
    return (
      <p className="mt-2 text-xs opacity-80">
        Sin datos de árbol.
      </p>
    );
  }
```

to:

```ts
  if (!tree) {
    return (
      <p className="mt-2 text-xs opacity-80">
        Sin datos de árbol.
      </p>
    );
  }

  const noSearchResults = activeQuery !== '' && visibleSet != null && visibleSet.size === 0;
```

- [ ] **Step 6: Render the search input, wire the new props into `IfcSpatialTreeNode`, use lifted selection**

Change:

```ts
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col">
      <div className="max-h-[min(60vh,calc(100vh-14rem))] min-h-40 flex-1 overflow-auto rounded-md border border-white/10 bg-neutral-950/40 p-2 pr-1">
        <IfcSpatialTreeNode
          getViewerApi={getViewerApi}
          hiddenMap={hiddenMap}
          isLast
          isRoot
          node={tree}
          prefix=""
          selectedLocalId={selectedLocalId}
          onSelectChange={setSelectedLocalId}
          onToggleHidden={(localId, hide) => {
            setHiddenMap((prev) => ({
              ...prev,
              [localId]: hide,
            }));
          }}
        />
      </div>
    </div>
  );
};
```

to:

```ts
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
            onSelectChange={onSelectedLocalIdChange}
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

- [ ] **Step 7: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: `npm run build` FAILS at this point — the one call site, `IfcViewerStructurePanelContent`, does not yet pass `selectedLocalId`/`onSelectedLocalIdChange`/`revealTargetLocalId`/`onRevealHandled`. Confirm the error is exactly a missing-props TypeScript error on `<IfcSpatialStructurePanel>` in `src/components/validator/viewers/ifc-viewer-structure-panel-content.tsx` and nothing else. This is expected and fixed in Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/components/ifc/ifc-spatial-structure-panel.tsx
git commit -m "$(cat <<'EOF'
Add search box to the IFC spatial tree panel

Filters by name or IFC type against the existing row-label text,
pruning non-matches and auto-expanding the branches that contain a
match. Selection state moves to props ahead of being lifted to
IFCViewer in the next task, so the 3D viewer can drive it too.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(Committing a known-red build is acceptable here only because Task 5 is the very next task in this same plan and fixes it immediately — do not stop or ship between Task 3 and Task 5.)

---

### Task 4: Raycast pick handler and `onElementPicked` in `IFCViewerAPI`

**Files:**
- Modify: `src/lib/ifc-viewer.ts`

**Interfaces:**
- Consumes: `spatialTreeHighlightMaterial` (Task 1), `fragments.raycast` and `world.camera.controls`/`world.camera.three`/`world.renderer.three.domElement` (all already available inside `setupIFCViewer` via `createThatOpenIFCRuntime`).
- Produces: `IFCViewerAPI` gains `onElementPicked: (cb: (localId: number) => void) => void`. Task 5 calls this once, right after `setupIFCViewer(container)` resolves.

- [ ] **Step 1: Add imports**

Change:

```ts
import type { FragmentsModel, MaterialDefinition } from '@thatopen/fragments';
import { Grids, ModelIdMapUtils } from '@thatopen/components';
import CameraControls from 'camera-controls';

import {
  createThatOpenIFCRuntime,
  loadIfcFileToScene,
} from '@/lib/thatopen-ifc-runtime';
```

to:

```ts
import type { FragmentsModel, MaterialDefinition } from '@thatopen/fragments';
import { Grids, ModelIdMapUtils } from '@thatopen/components';
import CameraControls from 'camera-controls';
import { Vector2 } from 'three';

import {
  createThatOpenIFCRuntime,
  loadIfcFileToScene,
} from '@/lib/thatopen-ifc-runtime';
import { spatialTreeHighlightMaterial } from '@/lib/ifc-spatial-tree-helpers';
```

- [ ] **Step 2: Add `onElementPicked` to the `IFCViewerAPI` interface**

Change:

```ts
export interface IFCViewerAPI {
  cleanup: VoidFunction;
  clearScene: () => Promise<void>;
  getPrimaryFragmentsModel: () => FragmentsModel | null;
  highlightLocalIds: (
    localIds: number[],
    material: MaterialDefinition,
  ) => Promise<void>;
  loadIfcFromFile: (file: File) => Promise<void>;
  resetHighlightLocalIds: (localIds: number[]) => Promise<void>;
  updateFragmentsView: () => void;
}
```

to:

```ts
export interface IFCViewerAPI {
  cleanup: VoidFunction;
  clearScene: () => Promise<void>;
  getPrimaryFragmentsModel: () => FragmentsModel | null;
  highlightLocalIds: (
    localIds: number[],
    material: MaterialDefinition,
  ) => Promise<void>;
  loadIfcFromFile: (file: File) => Promise<void>;
  onElementPicked: (cb: (localId: number) => void) => void;
  resetHighlightLocalIds: (localIds: number[]) => Promise<void>;
  updateFragmentsView: () => void;
}
```

- [ ] **Step 3: Track the last-registered pick callback and the currently highlighted pick**

Add, right after the existing `world.camera.controls?.mouseButtons...` block (the code added in the camera-controls task) and before `components.get(Grids).create(world);`:

```ts
  let onPickedCallback: ((localId: number) => void) | null = null;
  let lastPickedLocalId: number | null = null;
```

- [ ] **Step 4: Attach pointerdown/pointerup listeners on the renderer's canvas and raycast on click**

This closure references `highlightLocalIds`/`resetHighlightLocalIds`, so it must go **after** both are declared. Add the following right before the final `return {` statement of `setupIFCViewer` (i.e. immediately after the existing `const resetHighlightLocalIds = async (...) => { ... };` block, and before `return {`):

```ts
  const canvas = renderer?.three.domElement ?? null;

  let pointerDownAt: { x: number; y: number } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;

    pointerDownAt = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = async (e: PointerEvent) => {
    if (e.button !== 0 || !pointerDownAt || !canvas) {
      pointerDownAt = null;

      return;
    }

    const dx = e.clientX - pointerDownAt.x;
    const dy = e.clientY - pointerDownAt.y;

    pointerDownAt = null;

    if (Math.sqrt((dx * dx) + (dy * dy)) >= 5) return;

    const rect = canvas.getBoundingClientRect();
    const mouse = new Vector2(
      ((e.clientX - rect.left) / rect.width * 2) - 1,
      -((e.clientY - rect.top) / rect.height * 2) + 1,
    );

    const result = await fragments.raycast({
      camera: world.camera.three,
      dom: canvas,
      mouse,
    });

    if (!result) return;

    if (lastPickedLocalId != null && lastPickedLocalId !== result.localId) {
      await resetHighlightLocalIds([lastPickedLocalId]);
    }

    await highlightLocalIds([result.localId], spatialTreeHighlightMaterial);
    lastPickedLocalId = result.localId;
    onPickedCallback?.(result.localId);
  };

  canvas?.addEventListener('pointerdown', onPointerDown);
  canvas?.addEventListener('pointerup', onPointerUp);
```

- [ ] **Step 5: Expose `onElementPicked` and clean up the listeners on dispose**

Change:

```ts
  return {
    cleanup: () => {
      resizeObserver.disconnect();
      dispose();
    },
    clearScene,
    getPrimaryFragmentsModel,
    highlightLocalIds,
    loadIfcFromFile,
    resetHighlightLocalIds,
    updateFragmentsView,
  };
};
```

to:

```ts
  return {
    cleanup: () => {
      resizeObserver.disconnect();
      canvas?.removeEventListener('pointerdown', onPointerDown);
      canvas?.removeEventListener('pointerup', onPointerUp);
      dispose();
    },
    clearScene,
    getPrimaryFragmentsModel,
    highlightLocalIds,
    loadIfcFromFile,
    onElementPicked: (cb) => {
      onPickedCallback = cb;
    },
    resetHighlightLocalIds,
    updateFragmentsView,
  };
};
```

- [ ] **Step 6: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 new errors — in particular no "used before declaration" error on `highlightLocalIds`/`resetHighlightLocalIds`, which confirms the Step 4 block landed after both are defined.

- [ ] **Step 7: Manual smoke check (no browser interaction needed yet — Task 5 wires the consumer)**

Run: `npm run dev`, open `/validator`, load an IFC. Open the browser console and confirm no runtime errors appear on page load (the picker is attached but nothing consumes `onElementPicked` yet, so nothing visible should happen on click besides the same highlight-on-click that now also fires — clicking an element should still highlight it gold in the 3D view, same as clicking it in the tree already does).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ifc-viewer.ts
git commit -m "$(cat <<'EOF'
Add click-to-pick raycasting to the standalone IFC viewer

Left-click (without dragging past a 5px threshold, so it doesn't
fire during a pan) now raycasts against the loaded model and exposes
the hit's localId via a new onElementPicked callback, plus highlights
it in the 3D view the same way selecting it in the tree already does.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Lift selection state in `IFCViewer`, wire the pick callback end-to-end

**Files:**
- Modify: `src/components/validator/viewers/ifc-viewer.tsx`
- Modify: `src/components/validator/viewers/ifc-viewer-structure-panel-content.tsx`

**Interfaces:**
- Consumes: `IFCViewerAPI.onElementPicked` (Task 4); `IfcSpatialStructurePanelProps` (`selectedLocalId`, `onSelectedLocalIdChange`, `revealTargetLocalId`, `onRevealHandled` — Task 3).
- Produces: none further downstream — this is the integration task; all 6 manual scenarios from the spec are verified here.

- [ ] **Step 1: Lift selection state and add the pending-reveal ref in `IFCViewer`**

In `src/components/validator/viewers/ifc-viewer.tsx`, change the state block:

```ts
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>('viewer');
  const [spatialTree, setSpatialTree] = useState<SpatialTreeItem | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);
  const [structureSourceFile, setStructureSourceFile] = useState<string | null>(null);
```

to:

```ts
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>('viewer');
  const [revealTargetLocalId, setRevealTargetLocalId] = useState<number | null>(null);
  const [selectedLocalId, setSelectedLocalId] = useState<number | null>(null);
  const [spatialTree, setSpatialTree] = useState<SpatialTreeItem | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);
  const [structureSourceFile, setStructureSourceFile] = useState<string | null>(null);
```

Add, right after the `fileRef` declaration:

```ts
  const pendingRevealIdRef = useRef<number | null>(null);
```

- [ ] **Step 2: Apply a pending reveal once the tree finishes loading**

Add, right after the `loadStructureTree` callback definition (after its closing `}, []);`):

```ts
  useEffect(() => {
    if (spatialTree && pendingRevealIdRef.current != null) {
      setRevealTargetLocalId(pendingRevealIdRef.current);
      pendingRevealIdRef.current = null;
    }
  }, [spatialTree]);
```

- [ ] **Step 3: Register the pick callback once the viewer API is ready**

In the `useLayoutEffect` that calls `setupIFCViewer(container).then((api) => { ... })`, change:

```ts
    setupIFCViewer(container).then((api) => {
      if (cancelled) {
        api.cleanup();
      } else {
        apiRef.current = api;
        setLoadingPhase(null);

        if (fileRef.current) {
          setLoadingPhase('file');
          loadFile(api, fileRef.current).finally(() => setLoadingPhase(null));
        }
      }
    });
```

to:

```ts
    setupIFCViewer(container).then((api) => {
      if (cancelled) {
        api.cleanup();
      } else {
        apiRef.current = api;
        setLoadingPhase(null);

        api.onElementPicked((localId) => {
          setSelectedLocalId(localId);

          if (spatialTree) {
            setRevealTargetLocalId(localId);
          } else {
            pendingRevealIdRef.current = localId;
          }

          openStructureSheet();
        });

        if (fileRef.current) {
          setLoadingPhase('file');
          loadFile(api, fileRef.current).finally(() => setLoadingPhase(null));
        }
      }
    });
```

`openStructureSheet` and `spatialTree` are both already in scope inside `IFCViewer` (declared earlier in the same component) — no new imports needed. `openStructureSheet` itself already calls `loadStructureTree()` when `spatialTree` is stale/missing, which is what makes `pendingRevealIdRef` + the Step 2 effect necessary (the tree load is async).

Add `onRevealHandled` right after `openZoningSheetFab`:

```ts
  const onRevealHandled = useCallback(() => setRevealTargetLocalId(null), []);
```

Add `useRef` to the existing `react` import if not already present — check the current import list first; the file already imports `useRef` (used for `containerRef`/`apiRef`/`fileRef`), so no import change is needed there. It also already imports `useCallback`/`useEffect`/`useLayoutEffect`/`useState` — confirm `onRevealHandled`'s `useCallback` and the Step 2 `useEffect` don't need any new import additions.

- [ ] **Step 4: Pass the new props down to `IfcViewerStructurePanelContent`**

Change:

```ts
        <IfcViewerStructurePanelContent
          getViewerApi={() => apiRef.current}
          spatialTree={spatialTree}
          structureError={structureError}
          structureLoading={structureLoading}
          structureSourceFile={structureSourceFile}
        />
```

to:

```ts
        <IfcViewerStructurePanelContent
          getViewerApi={() => apiRef.current}
          revealTargetLocalId={revealTargetLocalId}
          selectedLocalId={selectedLocalId}
          spatialTree={spatialTree}
          structureError={structureError}
          structureLoading={structureLoading}
          structureSourceFile={structureSourceFile}
          onRevealHandled={onRevealHandled}
          onSelectedLocalIdChange={setSelectedLocalId}
        />
```

- [ ] **Step 5: Forward the new props through `IfcViewerStructurePanelContent`**

In `src/components/validator/viewers/ifc-viewer-structure-panel-content.tsx`, change:

```ts
export type IfcViewerStructurePanelContentProps = {
  getViewerApi: () => IFCViewerAPI | null;
  spatialTree: SpatialTreeItem | null;
  structureError: string | null;
  structureLoading: boolean;
  structureSourceFile: string | null;
};
```

to:

```ts
export type IfcViewerStructurePanelContentProps = {
  getViewerApi: () => IFCViewerAPI | null;
  onRevealHandled: () => void;
  onSelectedLocalIdChange: (localId: number | null) => void;
  revealTargetLocalId: number | null;
  selectedLocalId: number | null;
  spatialTree: SpatialTreeItem | null;
  structureError: string | null;
  structureLoading: boolean;
  structureSourceFile: string | null;
};
```

Change:

```ts
export const IfcViewerStructurePanelContent = ({
  getViewerApi,
  spatialTree,
  structureError,
  structureLoading,
  structureSourceFile,
}: IfcViewerStructurePanelContentProps) => {
```

to:

```ts
export const IfcViewerStructurePanelContent = ({
  getViewerApi,
  onRevealHandled,
  onSelectedLocalIdChange,
  revealTargetLocalId,
  selectedLocalId,
  spatialTree,
  structureError,
  structureLoading,
  structureSourceFile,
}: IfcViewerStructurePanelContentProps) => {
```

Change:

```ts
      <IfcSpatialStructurePanel
        key={structureSourceFile ?? 'sin-arbol'}
        getViewerApi={getViewerApi}
        tree={spatialTree}
      />
```

to:

```ts
      <IfcSpatialStructurePanel
        key={structureSourceFile ?? 'sin-arbol'}
        getViewerApi={getViewerApi}
        revealTargetLocalId={revealTargetLocalId}
        selectedLocalId={selectedLocalId}
        tree={spatialTree}
        onRevealHandled={onRevealHandled}
        onSelectedLocalIdChange={onSelectedLocalIdChange}
      />
```

- [ ] **Step 6: Lint and type-check**

Run: `npm run lint -- --fix && npm run build`
Expected: 0 errors — this is the task that must turn the build green again after Task 3 left it red.

- [ ] **Step 7: Manual verification of all 6 scenarios**

Run: `npm run dev`, open `http://localhost:5173/validator`, load an IFC file into the standalone 3D viewer.

1. Open "Estructura IFC", type a partial element name into the new search box → non-matching branches disappear, matching branches auto-expand, the matched substring is highlighted.
2. Clear the search, type an IFC type fragment (e.g. `wall`) → every `IfcWall`-labeled row appears.
3. Close the "Estructura IFC" panel. Left-click (no drag) an element in the 3D view → the panel opens by itself, the tree is expanded down to that element, scrolled into view, and highlighted.
4. With the panel already open, left-click a different element in 3D → tree updates to the new element without closing/reopening the panel.
5. Left-click and drag (pan) across the model → confirm this does NOT trigger a selection (no highlight change from the drag itself).
6. Left-click empty space away from the model → confirm nothing happens (no error, no selection change).

- [ ] **Step 8: Commit**

```bash
git add src/components/validator/viewers/ifc-viewer.tsx src/components/validator/viewers/ifc-viewer-structure-panel-content.tsx
git commit -m "$(cat <<'EOF'
Wire 3D-click selection into the spatial tree panel

Selection state moves up to IFCViewer so a pick in the 3D view — which
can happen while the structure panel is closed — opens the panel and
reveals the picked element in the tree, mirroring the existing
tree-to-3D highlight in the other direction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** shared utility (Task 1), search/prune/highlight (Tasks 1-3), 3D→tree pick + auto-open panel + scroll (Tasks 1, 4, 5), no changes to the map (verified no task touches `src/components/map-box/`), manual testing of all 6 spec scenarios (Task 5 Step 7). Deviation from the spec's literal `Set<number>` for the reveal utility: implemented as `Set<SpatialTreeItem>` (object identity) instead, because `SpatialTreeItem.localId` can be `null` for aggregate nodes — a number-keyed set can't represent those. Functionally equivalent for the spec's purpose (revealing ancestor branches), just correct for nodes without an id.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code.
- **Type consistency:** `IfcSpatialTreeNodeProps` (Task 2) → consumed by `IfcSpatialStructurePanel` (Task 3) → consumed by `IfcViewerStructurePanelContent`/`IFCViewer` (Task 5) all use the same field names (`forceOpenSet`, `visibleSet`, `searchQuery`, `selectedLocalId`, `onSelectedLocalIdChange`/`onSelectChange`, `revealTargetLocalId`, `onRevealHandled`) end to end — cross-checked against each task's exact prop lists above.
