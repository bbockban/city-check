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
  const [searchInput, setSearchInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setActiveQuery(searchInput.trim().toLowerCase());
    }, 150);

    return () => clearTimeout(id);
  }, [searchInput]);

  const searchReveal = useMemo(() => {
    if (!tree || !activeQuery) return null;

    return collectNodesToReveal(
      tree,
      (node) => spatialTreeRowLabel(node).toLowerCase().includes(activeQuery),
    );
  }, [tree, activeQuery]);

  const visibleSet = searchReveal;
  const forceOpenSet = searchReveal;

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
            onToggleHidden={(localIds, hide) => {
              setHiddenMap((prev) => {
                const next = { ...prev };

                for (const localId of localIds) next[localId] = hide;

                return next;
              });
            }}
          />
        </div>
      )}
    </div>
  );
};
