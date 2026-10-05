import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  ValidateIfcZoningParams,
  ZoningComplianceResponse,
} from '@/api/types';

import useDownloadValidateZoningBcf from '@/hooks/use-download-validate-zoning-bcf';
import useValidateIfcZoning from '@/hooks/use-validate-ifc-zoning';

import { useIfcParcelContext } from './viewers/ifc-parcel-context';

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

type ZoningValidationContextValue = {
  clearZoningUi: VoidFunction;
  downloadZoningBcf: () => Promise<void>;
  downloadZoningBcfPending: boolean;
  runZoningValidation: () => Promise<void>;
  setZoningSheetOpen: (open: boolean) => void;
  zoningError: string | null;
  zoningPending: boolean;
  zoningResult: ZoningComplianceResponse | null;
  zoningSheetOpen: boolean;
};

const ZoningValidationContext = createContext<ZoningValidationContextValue | null>(null);

export const ZoningValidationProvider = ({ children }: { children: ReactNode }) => {
  const { data: parcelContextData, file, parcelId } = useIfcParcelContext();
  const { isPending: zoningPending, mutateAsync: validateZoning } = useValidateIfcZoning();

  const {
    isPending: downloadZoningBcfPending,
    mutateAsync: downloadZoningBcfMutation,
  } = useDownloadValidateZoningBcf();

  const [zoningError, setZoningError] = useState<string | null>(null);
  const [zoningResult, setZoningResult] = useState<ZoningComplianceResponse | null>(null);
  const [zoningSheetOpen, setZoningSheetOpen] = useState(false);

  const clearZoningUi = useCallback(() => {
    setZoningError(null);
    setZoningResult(null);
    setZoningSheetOpen(false);
  }, []);

  useEffect(() => {
    if (!file) {
      queueMicrotask(clearZoningUi);
    }
  }, [clearZoningUi, file]);

  const buildZoningParams = useCallback((): ValidateIfcZoningParams | null => {
    if (!file) return null;

    const pid =
      parcelId?.trim()
      || (parcelContextData?.foundParcel ? parcelContextData.parcelId?.trim() : undefined);

    const ctx = parcelContextData;
    const muni = ctx?.municipalityCode?.trim();

    if (muni) {
      const geometryJson =
        ctx?.foundParcel && ctx.parcel?.geometry != null
          ? JSON.stringify(ctx.parcel.geometry)
          : undefined;

      return {
        file,
        municipalityCode: muni,
        parcelGeometryJson: geometryJson,
        parcelId: pid || undefined,
      };
    }

    return {
      file,
      parcelId: pid || undefined,
    };
  }, [file, parcelContextData, parcelId]);

  // Runs zoning validation using the best available parcel context; clears prior result/error then opens the sheet.
  const runZoningValidation = useCallback(async () => {
    const params = buildZoningParams();

    if (!params) {
      setZoningError('No hay archivo IFC cargado.');
      setZoningResult(null);
      setZoningSheetOpen(true);

      return;
    }

    setZoningError(null);
    setZoningResult(null);
    setZoningSheetOpen(true);

    try {
      const result = await validateZoning(params);

      setZoningResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      setZoningError(message);
    }
  }, [buildZoningParams, validateZoning]);

  const downloadZoningBcf = useCallback(async () => {
    const params = buildZoningParams();

    if (!params) {
      setZoningError('No hay archivo IFC cargado.');
      setZoningSheetOpen(true);

      return;
    }

    setZoningError(null);

    try {
      const blob = await downloadZoningBcfMutation(params);
      const baseName = params.file.name.replace(/\.ifc$/i, '');

      triggerBlobDownload(blob, `${baseName || 'validation'}.bcfzip`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      setZoningError(message);
      setZoningSheetOpen(true);
    }
  }, [buildZoningParams, downloadZoningBcfMutation]);

  const value = useMemo(
    (): ZoningValidationContextValue => ({
      clearZoningUi,
      downloadZoningBcf,
      downloadZoningBcfPending,
      runZoningValidation,
      setZoningSheetOpen,
      zoningError,
      zoningPending,
      zoningResult,
      zoningSheetOpen,
    }),
    [
      clearZoningUi,
      downloadZoningBcf,
      downloadZoningBcfPending,
      runZoningValidation,
      zoningError,
      zoningPending,
      zoningResult,
      zoningSheetOpen,
    ],
  );

  return (
    <ZoningValidationContext.Provider value={value}>
      {children}
    </ZoningValidationContext.Provider>
  );
};

export const useZoningValidationContext = (): ZoningValidationContextValue => {
  const ctx = useContext(ZoningValidationContext);

  if (!ctx) {
    throw new Error('useZoningValidationContext debe usarse dentro de ZoningValidationProvider');
  }

  return ctx;
};
