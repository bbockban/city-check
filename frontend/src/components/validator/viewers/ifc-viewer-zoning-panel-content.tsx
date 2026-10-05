import { Download } from 'lucide-react';

import { ZoningResultPanel } from '@/components/validator/zoning-result-panel';
import { useZoningValidationContext } from '@/components/validator/zoning-validation-context';
import { Button } from '@/components/ui/button';

import { useIfcParcelContext } from './ifc-parcel-context';

export const IfcViewerZoningPanelContent = () => {
  const { file } = useIfcParcelContext();

  const {
    downloadZoningBcf,
    downloadZoningBcfPending,
    zoningError,
    zoningPending,
    zoningResult,
  } = useZoningValidationContext();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {zoningPending && (
        <p className="text-sm text-gray-600">
          Validando…
        </p>
      )}
      {zoningError && (
        <p className="text-sm text-red-600">
          {zoningError}
        </p>
      )}
      {zoningResult && (
        <>
          <Button
            className="w-fit text-primary-dark"
            disabled={!file || downloadZoningBcfPending}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              void downloadZoningBcf();
            }}
          >
            <Download className="mr-2 size-4" />
            {downloadZoningBcfPending ? 'Generando BCF…' : 'Descargar BCF'}
          </Button>
          <ZoningResultPanel data={zoningResult} />
        </>
      )}
      {!zoningPending && !zoningError && !zoningResult && (
        <p className="text-sm text-gray-600">
          Ejecutá la validación con el botón del encabezado para ver el resultado aquí.
        </p>
      )}
    </div>
  );
};
