import type { IfcParcelContextResponse, ParcelMapContext } from '@/api/types';

type LngLat = [number, number];

/*
 Genera un poligono en lon/lat (2D) que envuelve la geometría del parcel.
 Sirve como región para la capa `clip` de Mapbox (sin extrusión 3D).
*/
export const parcelGeometryToClipRing = (geometry: unknown): LngLat[] | null => {
  if (!geometry || typeof geometry !== 'object') return null;

  const { type, coordinates } = geometry as { coordinates?: unknown; type?: string };

  if (type === 'Polygon' && Array.isArray(coordinates)) {
    const rings = coordinates as number[][][];

    if (!rings.length || !rings[0].length) return null;

    return rings[0] as unknown as LngLat[];
  }

  if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
    const polys = coordinates as number[][][][];

    let largestRing: number[][] = [];

    for (const poly of polys) {
      const outer = poly[0];

      if (!outer) continue;

      if (outer.length > largestRing.length) {
        largestRing = outer;
      }
    }

    return largestRing.length >= 4 ? (largestRing as unknown as LngLat[]) : null;
  }

  return null;
};

export const parcelResponseToMapCenter = (
  data: ParcelMapContext | undefined,
): [number, number] | undefined => {
  if (!data?.foundParcel) return undefined;

  if (isIfcParcelContext(data) && data.centroidWgs84) {
    const { lon, lat } = data.centroidWgs84;

    if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
  }

  if ('centroid' in data && data.centroid) {
    const { lat, lon } = data.centroid;

    if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
  }

  return undefined;
};

const isIfcParcelContext = (data: ParcelMapContext): data is IfcParcelContextResponse =>
  'centroidWgs84' in data;
