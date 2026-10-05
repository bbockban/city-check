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
  collectSubtreeLocalIds,
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
  onToggleHidden: (localIds: number[], hide: boolean) => void;
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
    const subtreeLocalIds = collectSubtreeLocalIds(node);

    onToggleHidden(subtreeLocalIds, nextHide);
    await m.setVisible(subtreeLocalIds, !nextHide);
    api.updateFragmentsView();
  };

  const rowInner = (
    <>
      {/* eslint-disable-next-line react-hooks/static-components -- ifcCategoryIcon looks up a stable icon reference from a fixed map (see ifc-category-icons.ts), it never creates a new component */}
      <CategoryIcon aria-hidden className="size-4 shrink-0 text-gray-500" />
      <button
        className={cn(
          'min-w-0 flex-1 truncate text-left text-sm disabled:cursor-default',
          canInteract ? 'cursor-pointer text-gray-900' : 'cursor-default text-gray-400',
        )}
        disabled={!canInteract}
        title={canInteract ? `${rowLabel} — clic para resaltar en el visor 3D` : `${rowLabel} — sin id local / sin modelo`}
        type="button"
        onClick={onRowActivate}
      >
        {renderHighlightedLabel(rowLabel, searchQuery)}
      </button>
      <button
        aria-label={isHidden ? 'Mostrar geometría en el visor' : 'Ocultar geometría en el visor'}
        className={cn(
          'shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600',
          isHidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          !canInteract && 'pointer-events-none opacity-0 group-hover:opacity-0',
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
