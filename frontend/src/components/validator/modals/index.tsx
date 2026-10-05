import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FieldGroup } from '@/components/ui/field';
import { FieldInput } from '@/components/ui/field-input';

import { cn } from '@/lib/utils';
import { validateIfcFile } from '@/lib/ifc-validation';
import useIfcParcelId from '@/hooks/use-ifc-parcel-id';

export interface IfcUploadPayload {
  file: File;
  parcelId: string;
  // true si el usuario tocó el campo de padrón a mano (lo tipeó o editó el auto-resuelto);
  // false si quedó tal cual lo completó el auto-resolve desde la georef del propio archivo.
  parcelIdModified: boolean;
}

interface UploadModalProps {
  onFileUpload: (payload?: IfcUploadPayload) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const UploadModal = ({ open, onOpenChange, onFileUpload }: UploadModalProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isParcelOpen, setIsParcelOpen] = useState(false);
  const [parcelId, setParcelId] = useState('');
  const [parcelIdModified, setParcelIdModified] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { isPending: isFetchingParcel, mutate: fetchParcelId } = useIfcParcelId();

  // Referencias (no estado) para que el callback async de fetchParcelId lea el
  // valor MÁS RECIENTE al momento de resolver, y no el que tenía cuando se
  // disparó la consulta (closure obsoleta / stale closure).
  const parcelIdModifiedRef = useRef(parcelIdModified);
  const pendingParcelFileRef = useRef<File | null>(null);

  useEffect(() => {
    parcelIdModifiedRef.current = parcelIdModified;
  }, [parcelIdModified]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setIsDragging(false);
      setIsParcelOpen(false);
      setParcelId('');
      setParcelIdModified(false);
      setSelectedFile(null);
    }

    onOpenChange(newOpen);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const validateAndSelectFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      toast.error('Formato no soportado: selecciona un archivo .ifc.');

      return;
    }

    const validation = await validateIfcFile(file);

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      setSelectedFile(null);

      return;
    }

    validation.warnings.forEach((warning) => toast.warning(warning));

    setIsParcelOpen(false);
    setParcelId('');
    setParcelIdModified(false);
    setSelectedFile(file);
    pendingParcelFileRef.current = file;

    fetchParcelId(file, {
      onError: () => {
        if (pendingParcelFileRef.current !== file) return;

        toast.warning('El IFC no está georeferenciado');
      },
      onSuccess: (data) => {
        // Si mientras se resolvía esta consulta el usuario ya seleccionó otro
        // archivo, o ya editó el padrón a mano, no pisar ese estado más nuevo
        // con el resultado (potencialmente obsoleto) del auto-detect.
        if (pendingParcelFileRef.current !== file || parcelIdModifiedRef.current) return;

        if (data?.parcelId) {
          setParcelId(data.parcelId);
          setIsParcelOpen(true);
        } else {
          toast.warning('El IFC no está georeferenciado');
        }
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;

    if (files.length > 0) {
      validateAndSelectFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    if (files && files.length > 0) {
      validateAndSelectFile(files[0]);
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileUpload({ file: selectedFile, parcelId: parcelId.trim(), parcelIdModified });
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="sm:max-w-lg bg-primary/95 border-2 border-medium-blue"
        hideCloseIcon
      >
        <DialogHeader>
          <DialogTitle className="text-light-blue">Cargar archivo IFC</DialogTitle>
          <DialogDescription className="text-medium-blue">
            Sube un archivo IFC para visualizar y validar tu proyecto de construcción
          </DialogDescription>
        </DialogHeader>
        <form
          className="h-94 space-y-4 overflow-y-auto pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleUpload();
          }}
        >
          <label
            className={cn(
              'block border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer',
              'border-medium-blue hover:border-medium-blue/80 bg-primary',
              { 'opacity-50 pointer-events-none': isFetchingParcel },
              { 'opacity-80': isDragging },
            )}
            htmlFor="file-upload"
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              accept=".ifc"
              aria-label="Seleccionar archivo IFC"
              className="hidden"
              disabled={isFetchingParcel}
              id="file-upload"
              onChange={handleFileInput}
              type="file"
            />
            {selectedFile ? (
              <div className="space-y-4 h-50">
                <div className="flex items-center justify-center">
                  <div className="p-3 bg-primary/90 rounded-full">
                    <Upload className="w-8 h-8 text-dark-green" />
                  </div>
                </div>
                <div>
                  <p className="max-w-full truncate text-light-blue">{selectedFile.name}</p>
                  <p className="text-sm text-medium-blue">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  className="border-medium-blue text-light-blue hover:bg-primary/90"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsParcelOpen(false);
                    setParcelId('');
                    setParcelIdModified(false);
                    setSelectedFile(null);
                    onFileUpload(undefined);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Quitar
                </Button>
              </div>
            ) : (
              <div className="gap-4 flex flex-col items-center h-50">
                <Upload className="size-8 text-medium-blue" />
                <p className="text-light-blue">
                  Arrastra tu archivo IFC aquí
                </p>
                <p className="text-sm text-medium-blue">o</p>
                <Button
                  asChild
                  className="border-medium-blue hover:bg-primary/90"
                  variant="outline"
                >
                  <span>
                    Seleccionar archivo
                  </span>
                </Button>
                <p className="text-xs text-medium-blue">
                  Solo archivos .ifc
                </p>
              </div>
            )}
          </label>

          {isFetchingParcel && (
            <p className="flex items-center gap-1.5 text-xs text-medium-blue">
              <Loader2 className="size-3 animate-spin" />
              Buscando padrón...
            </p>
          )}

          <Collapsible open={isParcelOpen} onOpenChange={setIsParcelOpen}>
            <CollapsibleTrigger type="button" className="flex w-full items-center gap-2 text-sm text-medium-blue transition-colors hover:text-light-blue">
              <ChevronDown
                className={cn('size-4 transition-transform', { 'rotate-180': isParcelOpen })}
              />
              Padrón (opcional)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <FieldGroup className="gap-4">
                <FieldInput
                  autoComplete="off"
                  id="parcel-id"
                  label="Padrón (UY)"
                  name="parcel_id"
                  placeholder="Identificador catastral / padrón"
                  type="text"
                  value={parcelId}
                  onChange={(e) => {
                    setParcelId(e.target.value);
                    setParcelIdModified(true);
                  }}
                />
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex justify-end gap-3">
            <Button
              className="bg-medium-blue hover:bg-medium-blue/80 text-white disabled:opacity-50"
              disabled={!selectedFile || isFetchingParcel}
              type="submit"
            >
              Cargar archivo
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UploadModal;
