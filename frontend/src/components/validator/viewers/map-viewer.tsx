import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import 'mapbox-gl/dist/mapbox-gl.css';

import { BimModel } from '@/components/map-box';
import { Button } from '@/components/ui/button';
import { ViewerLoadingOverlay } from '@/components/ui/viewer-loading-overlay';

import {
  parcelGeometryToClipRing,
  parcelResponseToMapCenter,
} from '@/lib/parcel-manipulation';
import { readMapConversionState } from '@/lib/read-map-conversion';

import { useIfcParcelContext } from './ifc-parcel-context';
import { useMapTransformContext } from './map-transform-context';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

const TOKEN_ERROR =
  !MAPBOX_TOKEN &&
  'Token de Mapbox no configurado. Definí VITE_MAPBOX_TOKEN en el archivo .env';

// Máximo de frames RAF a esperar antes de abandonar si la geometría no está lista
const AUTOSCALE_MAX_ATTEMPTS = 60;
const translationStep = 0.5;
const rotationStep = 5 * (Math.PI / 180);

const MapViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bimModelRef = useRef<BimModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setGeorefParams } = useMapTransformContext();

  const {
    file,
    parcelId,
    parcelIdModified,
    isPending,
    data: rawData,
    isError,
    error,
  } = useIfcParcelContext();

  const data = rawData ?? undefined;

  const waitParcel = Boolean(file) && isPending;

  // Nuevo mapa + instancia BIM al cambiar padrón o archivo (evita estado obsoleto de Mapbox/Three)
  const bimSessionKey = useMemo(() => {
    const pid = parcelId?.trim() ?? '';
    const fid = file ? `${file.name}:${file.size}:${file.lastModified}` : '';

    return `${pid}__${fid}`;
  }, [file, parcelId]);

  useEffect(() => {
    if (!containerRef.current || TOKEN_ERROR) return;

    setGeorefParams(null);

    const bimModel = new BimModel(containerRef.current);

    bimModelRef.current = bimModel;
    bimModelRef.current?.setModelScaleMultiplier(1);

    return () => {
      bimModel.dispose();
      bimModelRef.current = null;
    };
  }, [bimSessionKey, setGeorefParams]);

  // Al cambiar file / datos de parcela: limpiar, cargar IFC centrado y clip del bbox
  useEffect(() => {
    if (!bimModelRef.current) return;

    if (!file) {
      bimModelRef.current.clearScene();

      return;
    }

    if (waitParcel) return;

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);

      try {
        const clipRing = parcelGeometryToClipRing(data?.parcel.geometry || []);

        // Lee IfcMapConversion ANTES de cargar (solo texto, sin WASM).
        const savedGeoref = await readMapConversionState(file);

        if (cancelled) return;

        const parcelCenter = parcelResponseToMapCenter(data);

        // IfcMapConversion se confía salvo que el usuario haya tocado el campo de padrón a
        // mano (parcelIdModified): en ese caso pidió explícitamente "poné esto en este
        // padrón", una señal más confiable que cualquier heurística geográfica (en
        // Montevideo, padrones distintos y adyacentes pueden estar a pocos metros entre sí,
        // así que ni distancia ni cercanía al centroide alcanzan para distinguirlos). Si el
        // padrón vino solo del auto-resolve (sin editar), se sigue confiando en la posición
        // guardada del propio archivo, más precisa que el centroide de la parcela.
        const savedNearParcel = !parcelCenter || !savedGeoref || !parcelIdModified;

        // Prioridad de posición:
        //   1. IfcMapConversion si cerca del padrón — posición exacta de un download previo.
        //   2. centroide del padrón — punto de partida por defecto.
        //   3. IfcMapConversion de todos modos — último recurso sin padrón.
        const modelCenter =
          (savedNearParcel ? savedGeoref?.lngLat : undefined) ??
          parcelCenter ??
          savedGeoref?.lngLat;

        await bimModelRef.current?.setFile(file, modelCenter ?? undefined);

        if (cancelled) return;

        // Aplica el rumbo de IfcMapConversion para visualización inicial.
        // Reset restaura heading=0° (norte), no este ángulo; el usuario puede corregir
        // archivos con MapConversion incorrecta usando Reset + botones de rotación.
        if (savedGeoref !== null) {
          bimModelRef.current?.setInitialHeading(savedGeoref.heading);
        }

        // Fija el baseline de Reset para que, con heading=0°, el bbox del edificio
        // quede centrado en el centroide del padrón. Esto compensa que el origen del
        // proyecto IFC puede no coincidir con el centro del edificio (p. ej. ModelC_georef).
        if (parcelCenter) {
          bimModelRef.current?.setResetBboxCenterAt(parcelCenter);
        }

        if (clipRing?.length) {
          await bimModelRef.current?.applyParcelClip(clipRing);
        } else {
          bimModelRef.current?.clearParcelClip();
        }

        if (cancelled) return;

        // targetOccupiedPercent viene como 60 (significa 60%), pasarlo tal cual
        const targetPercent = data?.targetOccupiedPercent ?? 0;

        if (clipRing?.length && targetPercent > 0) {
          // Fire-and-forget: no bloquear el overlay de carga esperando la convergencia de escala.
          // autoScaleToTargetCoveragePercent resuelve de una vez cuando la geometría está lista;
          // reintentamos en frames RAF hasta que models[] esté poblado.
          void (async () => {
            for (let i = 0; i < AUTOSCALE_MAX_ATTEMPTS; i++) {
              if (cancelled) return;

              const result = bimModelRef.current?.autoScaleToTargetCoveragePercent(targetPercent);

              if (result != null) return; // resuelto — listo

              // Geometría aún no lista, esperar un frame y reintentar
              await new Promise<void>((res) => requestAnimationFrame(() => res()));
            }
          })();
        }

        const geoState = bimModelRef.current?.getGeorefState();

        if (geoState) setGeorefParams(geoState);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [bimSessionKey, file, data, waitParcel, setGeorefParams]);

  const syncGeoref = () => {
    const state = bimModelRef.current?.getGeorefState();

    if (state) setGeorefParams(state);
  };

  const handleMoveN = () => {
    bimModelRef.current?.moveModel(0, translationStep);
    syncGeoref();
  };

  const handleMoveS = () => {
    bimModelRef.current?.moveModel(0, -translationStep);
    syncGeoref();
  };

  const handleMoveE = () => {
    bimModelRef.current?.moveModel(translationStep, 0);
    syncGeoref();
  };

  const handleMoveW = () => {
    bimModelRef.current?.moveModel(-translationStep, 0);
    syncGeoref();
  };

  const handleRotateCCW = () => {
    bimModelRef.current?.rotateModel(rotationStep);
    syncGeoref();
  };

  const handleRotateCW = () => {
    bimModelRef.current?.rotateModel(-rotationStep);
    syncGeoref();
  };

  const handleReset = () => {
    bimModelRef.current?.resetTransform();
    syncGeoref();
  };

  if (TOKEN_ERROR) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-primary">
        <div className="text-center space-y-4">
          <p className="text-red-500 text-lg">Error: {TOKEN_ERROR}</p>
        </div>
      </div>
    );
  }

  const overlayMessage = waitParcel
    ? 'Consultando parcela en la API…'
    : 'Cargando modelo IFC en el mapa…';

  return (
    <div className="h-full w-full relative bg-primary overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <ViewerLoadingOverlay
        message={overlayMessage}
        show={isLoading || waitParcel}
      />

      {isError && file && (
        <div
          className="absolute top-2 left-2 right-2 z-10 rounded-md border border-amber-600/50 bg-primary/95 px-3 py-2
            text-sm text-amber-200"
        >
          No se pudo cargar el padrón ({error?.message ?? 'error de red'}).
        </div>
      )}

      {!file && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/80 pointer-events-none">
          <div className="text-center space-y-4 text-medium-blue">
            <p className="text-lg">No hay archivo cargado</p>
            <p className="text-sm">
              Carga un archivo IFC para visualizarlo en el mapa
            </p>
          </div>
        </div>
      )}

      {file && (
        <div
          className="absolute bottom-8 left-4 z-10 flex flex-col items-center gap-1 rounded-lg border border-medium-blue
            bg-primary/90 p-2 text-light-blue shadow-lg"
        >
          <Button
            className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
            size="sm"
            title="Mover norte"
            variant="ghost"
            onClick={handleMoveN}
          >
            ↑
          </Button>

          {/* Fila central: O, botones de rotación, E */}
          <div className="flex items-center gap-1">
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Mover oeste"
              variant="ghost"
              onClick={handleMoveW}
            >
              ←
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Rotar sentido antihorario"
              variant="ghost"
              onClick={handleRotateCCW}
            >
              ↺
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Rotar sentido horario"
              variant="ghost"
              onClick={handleRotateCW}
            >
              ↻
            </Button>
            <Button
              className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
              size="sm"
              title="Mover este"
              variant="ghost"
              onClick={handleMoveE}
            >
              →
            </Button>
          </div>
          <Button
            className="h-7 w-7 p-0 text-light-blue hover:bg-medium-blue/20"
            size="sm"
            title="Mover sur"
            variant="ghost"
            onClick={handleMoveS}
          >
            ↓
          </Button>
          <Button
            className="mt-1 h-6 px-2 text-xs text-medium-blue hover:bg-medium-blue/20"
            size="sm"
            title="Restaurar posición inicial"
            variant="ghost"
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
};

export default MapViewer;
