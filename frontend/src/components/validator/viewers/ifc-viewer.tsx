import type { SpatialTreeItem } from '@thatopen/fragments';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ClipboardList, Layers } from 'lucide-react';
import { toast } from 'sonner';

import { InspectorSidePanel } from '@/components/validator/inspector-side-panel';
import { useZoningValidationContext } from '@/components/validator/zoning-validation-context';
import { Button } from '@/components/ui/button';

import { setupIFCViewer, type IFCViewerAPI } from '@/lib/ifc-viewer';

import { ViewerLoadingOverlay } from '@/components/ui/viewer-loading-overlay';
import { validateIfcFile } from '@/lib/ifc-validation';

import { IfcViewerStructurePanelContent } from './ifc-viewer-structure-panel-content';
import { IfcViewerZoningPanelContent } from './ifc-viewer-zoning-panel-content';
import { useIfcParcelContext } from './ifc-parcel-context';

type LoadingPhase = 'viewer' | 'file';

const IFCViewer = () => {
  const { file, isGeoreferenced } = useIfcParcelContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<IFCViewerAPI | null>(null);
  const fileRef = useRef<File | null>(null);

  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>('viewer');
  const [spatialTree, setSpatialTree] = useState<SpatialTreeItem | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);
  const [structureSourceFile, setStructureSourceFile] = useState<string | null>(null);

  const {
    runZoningValidation,
    setZoningSheetOpen,
    zoningPending,
    zoningResult,
    zoningSheetOpen,
  } = useZoningValidationContext();

  useEffect(() => {
    fileRef.current = file ?? null;
  }, [file]);

  useEffect(() => {
    if (!file) {
      setSpatialTree(null);
      setStructureSourceFile(null);
      setStructureError(null);
    }
  }, [file]);

  // Loads and caches the model spatial tree used by the inspector side panel.
  const loadStructureTree = useCallback(async () => {
    const api = apiRef.current;
    const model = api?.getPrimaryFragmentsModel();

    if (!api || !model) {
      setStructureError('No hay modelo IFC en el visor.');

      return;
    }

    setStructureError(null);
    setStructureLoading(true);
    setSpatialTree(null);

    try {
      const root = await model.getSpatialStructure();

      setStructureSourceFile(fileRef.current?.name ?? null);
      setSpatialTree(root);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      setStructureError(message);
      setSpatialTree(null);
      setStructureSourceFile(null);
    } finally {
      setStructureLoading(false);
    }
  }, []);

  const openStructureSheet = useCallback(() => {
    setZoningSheetOpen(false);
    setStructureSheetOpen(true);

    const fileName = fileRef.current?.name ?? '';

    const stale =
      structureSourceFile != null
      && structureSourceFile !== fileName;

    const needTree = spatialTree == null || stale;

    if (needTree && !structureLoading) {
      void loadStructureTree();
    }
  }, [loadStructureTree, setZoningSheetOpen, spatialTree, structureLoading, structureSourceFile]);

  const openZoningSheetFab = useCallback(() => {
    setStructureSheetOpen(false);

    if (zoningResult) {
      setZoningSheetOpen(true);
    } else {
      void runZoningValidation();
    }
  }, [runZoningValidation, setZoningSheetOpen, zoningResult]);

  const loadFile = async (api: IFCViewerAPI, nextFile: File) => {
    const validation = await validateIfcFile(nextFile);

    if (!validation.valid) {
      toast.error(validation.errors[0]);

      return;
    }

    try {
      await api.loadIfcFromFile(nextFile);
    } catch {
      toast.error('No se pudo visualizar el IFC: falló la conversión de la geometría a malla.');
    }
  };

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    let cancelled = false;

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

    return () => {
      cancelled = true;

      if (apiRef.current) {
        apiRef.current.cleanup();
        apiRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!apiRef.current) return;

    if (!file) {
      apiRef.current.clearScene();

      return;
    }

    const id = requestAnimationFrame(() => setLoadingPhase('file'));

    loadFile(apiRef.current, file).finally(() => {
      setLoadingPhase(null);
    });

    return () => cancelAnimationFrame(id);
  }, [file]);

  const loadingMessage = loadingPhase === 'viewer'
    ? 'Iniciando visor 3D…'
    : 'Cargando modelo IFC…';

  return (
    <div className="relative h-full w-full min-h-0 bg-primary">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="absolute bottom-6 left-4 z-30 flex flex-col gap-3">
        <Button
          aria-label="Abrir panel: estructura IFC — árbol espacial, filtro, resaltar y ocultar geometría"
          className="size-14 shrink-0 rounded-full border border-gray-200 bg-white p-0 text-gray-900 shadow-lg hover:bg-gray-50"
          title="Estructura IFC: árbol espacial, filtro, resaltar y ocultar elementos en el visor."
          type="button"
          variant="outline"
          onClick={openStructureSheet}
        >
          <Layers className="size-6" />
        </Button>
        <Button
          aria-label="Abrir panel: validación de zonificación — resultados y descarga BCF"
          className="size-14 shrink-0 rounded-full border border-gray-200 bg-white p-0 text-gray-900 shadow-lg hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
          disabled={zoningPending || !isGeoreferenced}
          title={!isGeoreferenced ? 'El IFC no contiene coordenadas geográficas' : 'Zonificación: resultados de cumplimiento y descarga BCF.'}
          type="button"
          variant="outline"
          onClick={openZoningSheetFab}
        >
          <ClipboardList className="size-6" />
        </Button>
      </div>

      <InspectorSidePanel
        open={structureSheetOpen}
        title="Estructura IFC"
        onOpenChange={setStructureSheetOpen}
      >
        <IfcViewerStructurePanelContent
          getViewerApi={() => apiRef.current}
          spatialTree={spatialTree}
          structureError={structureError}
          structureLoading={structureLoading}
          structureSourceFile={structureSourceFile}
        />
      </InspectorSidePanel>

      <InspectorSidePanel
        open={zoningSheetOpen}
        title="Validación de zonificación"
        onOpenChange={setZoningSheetOpen}
      >
        <IfcViewerZoningPanelContent />
      </InspectorSidePanel>

      <ViewerLoadingOverlay
        message={loadingMessage}
        show={loadingPhase !== null}
      />
    </div>
  );
};

export default IFCViewer;
