/** POST `/api/v1/ifc/validate-zoning` — un ítem de `parameterChecks`. */
export interface ZoningParameterCheck {
  compliant: boolean | null;
  limitValue: number | null;
  measuredValue: number | null;
  notes: string;
  parameterKind: string;
  unit: string;
}

/** POST `/api/v1/ifc/validate-zoning` — cuerpo de respuesta (camelCase). */
export interface ZoningComplianceResponse {
  municipalityCode: string;
  overallCompliant: boolean | null;
  parcelId: string;
  parameterChecks: ZoningParameterCheck[];
  warnings: string[];
  zoningAreaId: number;
  zoningAreaName: string;
}

/** @deprecated Usar `ZoningComplianceResponse`. */
export type ValidateZoningResponse = ZoningComplianceResponse;

/** Argumentos para `validateIfcZoning`. */
export type ValidateIfcZoningParams = {
  file: File;
  /** Modo con WFS: padrón u omisión + resolución por sitio. Modo sin WFS: solo informativo. */
  parcelId?: string;
  /**
   * Modo sin WFS: código IMM (ej. CH, A). Si tiene valor, el backend no usa WFS.
   * Omitir o vacío → modo clásico con WFS.
   */
  municipalityCode?: string | null;
  /**
   * Preferred (sin WFS): GeoJSON Geometry serializada a string JSON (WGS84).
   * Si falta y hay `parcelId`, backend puede resolver geometría por padrón.
   */
  parcelGeometryJson?: string;
  /** Debug: fuerza que todos los checks queden como no cumplidos. */
  forceFail?: boolean;
};

/** Respuesta GET `/api/v1/parcels/montevideo/{parcel_id}` (catastro sin IFC). */
export interface MontevideoParcelResponse {
  centroid: { lat: number; lon: number };
  error?: string;
  foundNeighborhood: boolean;
  foundParcel: boolean;
  parcelPercent?: number;
  parcel: {
    geometry: unknown;
    properties: Record<string, unknown>;
  };
  parcelId: string;
}

export type IfcParcelResolveMode = 'parcel_id' | 'ifc_site_at_point';

export interface CentroidWgs84 {
  lon: number;
  lat: number;
}

export interface CentroidUtmPlanM {
  easting: number;
  northing: number;
}

export interface IfcParcelNeighborhood {
  name: string;
  properties: Record<string, unknown>;
  geometry: unknown;
}

/** Respuesta POST `/api/v1/ifc/parcel-context` (IFC + padrón opcional). */
export interface IfcParcelContextResponse {
  resolveMode: IfcParcelResolveMode;
  parcelId: string;
  /** % objetivo de ocupación para escalar IFC en mapa. */
  targetOccupiedPercent?: number | null;
  /** @deprecated Mantener por compatibilidad temporal con respuestas anteriores. */
  parcelOccupiedPercent?: number | null;
  foundParcel: boolean;
  foundNeighborhood: boolean;
  parcel: {
    geometry: unknown;
    properties: Record<string, unknown>;
  };
  neighborhood: IfcParcelNeighborhood | null;
  municipalityCode: string | null;
  centroidWgs84: CentroidWgs84 | null;
  centroidUtmPlanM: CentroidUtmPlanM | null;
  fosPlanProjectionEpsg: number | null;
  fosPlanProjectionAuthority: string | null;
  warnings: string[];
}

/** Contexto de parcela para el mapa: GET catastro o POST parcel-context. */
export type ParcelMapContext = MontevideoParcelResponse | IfcParcelContextResponse;
