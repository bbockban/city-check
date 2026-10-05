import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router';
import { useState } from 'react';
import {
  ArrowLeft,
  Download,
  Scale,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import UploadModal from '@/components/validator/modals';
import Viewers from '@/components/validator/viewers';
import { ZoningValidationProvider, useZoningValidationContext } from '@/components/validator/zoning-validation-context';

import { IfcParcelProvider, useIfcParcelContext } from '@/components/validator/viewers/ifc-parcel-context';
import { MapTransformProvider, useMapTransformContext } from '@/components/validator/viewers/map-transform-context';

import { ROUTES } from '@/constants';
import { embedMapConversion } from '@/lib/embed-map-conversion';
import useGeoreferenceIfc from '@/hooks/use-georeference-ifc';

type Session = { file: File; parcelId: string; parcelIdModified: boolean };

type ValidatorChromeProps = {
  ifcSession: Session | undefined;
  onFileUpload: (payload?: Session) => void;
  onNewFile: () => void;
  showUploadModal: boolean;
  onUploadOpenChange: (open: boolean) => void;
};

const pillClass = 'rounded-full border-medium-blue shadow-sm';

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.download = filename;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const ValidatorChrome = ({
  ifcSession,
  onFileUpload,
  onNewFile,
  onUploadOpenChange,
  showUploadModal,
}: ValidatorChromeProps) => {
  const navigate = useNavigate();
  const { isPending: backendDownloading, mutate: georeference } = useGeoreferenceIfc();
  const { runZoningValidation, zoningPending } = useZoningValidationContext();
  const { georefParams } = useMapTransformContext();
  const { isGeoreferenced } = useIfcParcelContext();
  const [isEmbedding, setIsEmbedding] = useState(false);
  const downloading = backendDownloading || isEmbedding;

  const handleDownload = async () => {
    if (!ifcSession) return;

    const filename = ifcSession.file.name.replace('.ifc', '_georef.ifc');

    if (georefParams) {
      setIsEmbedding(true);

      try {
        const blob = await embedMapConversion(ifcSession.file, georefParams.lngLat, georefParams.rotateZ);

        triggerBlobDownload(blob, filename);
      } catch {
        // TODO: mostrar error al usuario
      } finally {
        setIsEmbedding(false);
      }

      return;
    }

    georeference(ifcSession, {
      onError: () => {
        // TODO: mostrar error al usuario
      },
      onSuccess: (blob) => triggerBlobDownload(blob, filename),
    });
  };

  return (
    <div className="flex h-screen flex-col bg-primary">
      <header
        className="flex flex-col items-start justify-between gap-3 border-b border-medium-blue bg-primary/95 px-4 py-4 sm:flex-row sm:items-center md:px-6"
      >
        <div className="flex items-center gap-4">
          <Button
            className="rounded-full text-light-blue hover:bg-primary/30 hover:text-light-blue/80"
            size="sm"
            variant="ghost"
            onClick={() => navigate({ to: ROUTES.HOME })}
          >
            <ArrowLeft className="mr-2 size-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-xl text-light-blue">
              Validador IFC
            </h1>
            {ifcSession?.file && (
              <p className="max-w-[200px] truncate text-sm text-medium-blue sm:max-w-none">
                {ifcSession.file.name}
                {ifcSession.parcelId ? ` · Padrón: ${ifcSession.parcelId}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ifcSession && (
            <>
              <Button
                className={pillClass}
                disabled={zoningPending || !isGeoreferenced}
                size="sm"
                variant="outline"
                onClick={() => { void runZoningValidation(); }}
              >
                <Scale className="mr-2 size-4" />
                {zoningPending ? 'Validando…' : 'Validar zonificación'}
              </Button>
              <Button
                className={pillClass}
                disabled={downloading || !isGeoreferenced}
                size="sm"
                variant="outline"
                onClick={handleDownload}
              >
                <Download className="mr-2 size-4" />
                {downloading ? 'Descargando...' : 'Descargar georeferenciado'}
              </Button>
            </>
          )}
          <Button
            className={pillClass}
            size="sm"
            variant="outline"
            onClick={onNewFile}
          >
            <Upload className="mr-2 size-4" />
            Cargar nuevo archivo
          </Button>
        </div>
      </header>
      <Viewers />
      <UploadModal
        onFileUpload={onFileUpload}
        onOpenChange={onUploadOpenChange}
        open={showUploadModal}
      />
    </div>
  );
};

const ValidationPage = () => {
  const [ifcSession, setIfcSession] = useState<Session | undefined>();
  const [showUploadModal, setShowUploadModal] = useState(true);

  const handleFileUpload = (payload?: Session) => {
    setIfcSession(payload);
  };

  const handleNewFile = () => {
    setShowUploadModal(true);
  };

  return (
    <MapTransformProvider>
      <IfcParcelProvider
        file={ifcSession?.file}
        parcelId={ifcSession?.parcelId}
        parcelIdModified={ifcSession?.parcelIdModified}
      >
        <ZoningValidationProvider>
          <ValidatorChrome
            ifcSession={ifcSession}
            showUploadModal={showUploadModal}
            onFileUpload={handleFileUpload}
            onNewFile={handleNewFile}
            onUploadOpenChange={setShowUploadModal}
          />
        </ZoningValidationProvider>
      </IfcParcelProvider>
    </MapTransformProvider>
  );
};

export const Route = createFileRoute('/validator')({ component: ValidationPage });
