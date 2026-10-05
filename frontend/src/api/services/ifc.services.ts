import { apiBlob, apiJson, apiJsonOrNull } from '..';
import type {
  IfcParcelContextResponse,
  ValidateIfcZoningParams,
  ZoningComplianceResponse,
} from '../types';

export const fetchParcelIdFromIfc = (file: File): Promise<{ parcelId: string } | null> => {
  const form = new FormData();

  form.append('file', file);

  return apiJsonOrNull<{ parcelId: string }>('/api/v1/ifc/parcel-id', {
    body: form,
    method: 'POST',
  });
};

export const extractSiteCoordinates = (
  file: File,
): Promise<{ lat: number; lon: number } | null> => {
  const form = new FormData();

  form.append('file', file);

  return apiJsonOrNull<{ lat: number; lon: number }>('/api/v1/ifc/site-coordinates', {
    body: form,
    method: 'POST',
  });
};

export const georeferenceIfc = (file: File, parcelId: string): Promise<Blob> => {
  const form = new FormData();

  form.append('file', file);

  return apiBlob(`/api/v1/ifc/georeference/${encodeURIComponent(parcelId.trim())}`, {
    body: form,
    method: 'POST',
  });
};

/**
 * Resuelve parcela Montevideo a partir del IFC (y padrón opcional).
 * POST `/api/v1/ifc/parcel-context` — multipart: `file` (obligatorio), `parcel_id` (opcional).
 */
export const fetchIfcParcelContext = (
  file: File,
  parcelId?: string,
): Promise<IfcParcelContextResponse | null> => {
  const form = new FormData();

  form.append('file', file);

  const trimmed = parcelId?.trim();

  if (trimmed) form.append('parcel_id', trimmed);

  return apiJsonOrNull<IfcParcelContextResponse>('/api/v1/ifc/parcel-context', {
    body: form,
    method: 'POST',
  });
};

const buildValidateZoningForm = ({
  file,
  parcelId,
  municipalityCode,
  parcelGeometryJson,
  forceFail,
}: ValidateIfcZoningParams): FormData => {
  const form = new FormData();

  form.append('file', file);

  const muni = municipalityCode?.trim();

  if (muni) {
    form.append('municipality_code', muni);

    const geom = parcelGeometryJson?.trim();

    if (geom) form.append('parcel_geometry_json', geom);
  }

  const pid = parcelId?.trim();

  if (pid) form.append('parcel_id', pid);
  if (forceFail) form.append('force_fail', 'true');

  return form;
};

/**
 * POST `/api/v1/ifc/validate-zoning` (multipart).
 *
 * - Sin WFS (preferred): enviar `parcel_geometry_json` + `municipality_code` para usar geometría directa.
 * - Fallback: si falta `parcel_geometry_json` pero hay `parcel_id`, backend intenta resolver geometría por padrón.
 * - Si no hay ni geometría ni padrón, altura puede validarse; FOS/retiro pueden no estar disponibles.
 * - Con WFS: no enviar `municipality_code` (omitir o vacío). Opcional `parcel_id`.
 */
export const validateIfcZoning = (
  params: ValidateIfcZoningParams,
): Promise<ZoningComplianceResponse> =>
  apiJson<ZoningComplianceResponse>('/api/v1/ifc/validate-zoning', {
    body: buildValidateZoningForm(params),
    method: 'POST',
  });

/**
 * POST `/api/v1/ifc/validate-zoning/bcf` — mismos parámetros que `validateIfcZoning`,
 * devuelve `.bcfzip` con un topic por chequeo no cumplido.
 */
export const downloadValidateZoningBcf = (
  params: ValidateIfcZoningParams,
): Promise<Blob> =>
  apiBlob('/api/v1/ifc/validate-zoning/bcf', {
    body: buildValidateZoningForm(params),
    method: 'POST',
  });
