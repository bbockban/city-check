import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { UseQueryResult } from '@tanstack/react-query';

import useParcelFromIfc from '@/hooks/use-parcel-from-ifc';

import type { IfcParcelContextResponse } from '@/api/types';
import { extractIfcSiteCoords } from '@/lib/ifc-site-coords';

export type IfcParcelContextValue = {
  file: File | undefined;
  isGeoreferenced: boolean;
  parcelId: string | undefined;
  parcelIdModified: boolean;
} & UseQueryResult<IfcParcelContextResponse | null, Error>;

const IfcParcelContext = createContext<IfcParcelContextValue | null>(null);

export interface IfcParcelProviderProps {
  children: ReactNode;
  file: File | undefined;
  parcelId?: string;
  parcelIdModified?: boolean;
}

export const IfcParcelProvider = ({
  children,
  file,
  parcelId,
  parcelIdModified = false,
}: IfcParcelProviderProps) => {
  const query = useParcelFromIfc(file, parcelId);
  const [coordsResult, setCoordsResult] = useState<{ file: File; hasCoords: boolean } | null>(null);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;

    extractIfcSiteCoords(file)
      .then((coords) => {
        if (!cancelled) setCoordsResult({ file, hasCoords: coords != null });
      })
      .catch(() => {
        if (!cancelled) setCoordsResult({ file, hasCoords: false });
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const hasIfcCoords = Boolean(file) && coordsResult?.file === file && !!coordsResult?.hasCoords;
  const isGeoreferenced = hasIfcCoords || Boolean(parcelId) || query.isPending || query.data != null;

  const value: IfcParcelContextValue = {
    file,
    isGeoreferenced,
    parcelId,
    parcelIdModified,
    ...query,
  };

  return (
    <IfcParcelContext.Provider value={value}>
      {children}
    </IfcParcelContext.Provider>
  );
};

export const useIfcParcelContext = (): IfcParcelContextValue => {
  const ctx = useContext(IfcParcelContext);

  if (!ctx) {
    throw new Error('useIfcParcelContext debe usarse dentro de IfcParcelProvider');
  }

  return ctx;
};
