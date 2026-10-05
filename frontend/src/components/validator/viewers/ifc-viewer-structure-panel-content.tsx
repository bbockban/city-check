import type { SpatialTreeItem } from '@thatopen/fragments';

import { IfcSpatialStructurePanel } from '@/components/ifc/ifc-spatial-structure-panel';

import type { IFCViewerAPI } from '@/lib/ifc-viewer';

import { useIfcParcelContext } from './ifc-parcel-context';

export type IfcViewerStructurePanelContentProps = {
  getViewerApi: () => IFCViewerAPI | null;
  spatialTree: SpatialTreeItem | null;
  structureError: string | null;
  structureLoading: boolean;
  structureSourceFile: string | null;
};

const MetaRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-2 text-xs">
    <span className="shrink-0 text-gray-500">{label}</span>
    <span className="truncate font-mono text-gray-800">{value}</span>
  </div>
);

export const IfcViewerStructurePanelContent = ({
  getViewerApi,
  spatialTree,
  structureError,
  structureLoading,
  structureSourceFile,
}: IfcViewerStructurePanelContentProps) => {
  const { data } = useIfcParcelContext();

  const lat = data?.centroidWgs84?.lat;
  const lon = data?.centroidWgs84?.lon;
  const parcelId = data?.parcelId;
  const municipalityCode = data?.municipalityCode;

  const hasMetadata = lat != null || parcelId || municipalityCode;

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      {hasMetadata && (
        <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5">
          {lat != null && lon != null && (
            <MetaRow
              label="Lat / Lon"
              value={`${lat.toFixed(6)}, ${lon.toFixed(6)}`}
            />
          )}
          {parcelId && (
            <MetaRow label="Padrón" value={parcelId} />
          )}
          {municipalityCode && (
            <MetaRow label="Municipio" value={municipalityCode} />
          )}
        </div>
      )}
      <p className="text-sm text-gray-600">
        Árbol espacial colapsable. Clic en el texto para resaltar; pasá el mouse sobre una fila y usá el ícono de ojo para ocultar geometría. El árbol se carga al abrir este panel o al cambiar el archivo IFC.
      </p>
      {structureLoading && (
        <p className="text-sm text-gray-600">
          Cargando estructura…
        </p>
      )}
      {structureError && (
        <p className="text-sm text-red-600">
          {structureError}
        </p>
      )}
      <IfcSpatialStructurePanel
        key={structureSourceFile ?? 'sin-arbol'}
        getViewerApi={getViewerApi}
        tree={spatialTree}
      />
    </div>
  );
};
