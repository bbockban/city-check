import { IfcAPI, IFCSITE } from 'web-ifc';

type LngLat = [number, number];

const dmsToDec = (dms: { value: number }[]): number => {
  const [deg, min = { value: 0 }, sec = { value: 0 }, mil = { value: 0 }] = dms;
  const sign = deg.value < 0 ? -1 : 1;

  return sign * (Math.abs(deg.value) + min.value / 60 + sec.value / 3600 + mil.value / 3_600_000);
};

/**
 * Parsea un archivo IFC y extrae RefLatitude/RefLongitude del primer IfcSite.
 * Retorna [lng, lat] o null si no se encuentra.
 */
export const extractIfcSiteCoords = async (file: File): Promise<LngLat | null> => {
  const api = new IfcAPI();

  api.SetWasmPath('/web-ifc/');
  await api.Init();

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const modelId = api.OpenModel(buffer);
    const sites = api.GetLineIDsWithType(modelId, IFCSITE);

    if (!sites.size()) return null;

    const site = api.GetLine(modelId, sites.get(0)) as {
      RefLatitude?: { value: { value: number }[] };
      RefLongitude?: { value: { value: number }[] };
    };

    const rawLat = site.RefLatitude?.value;
    const rawLng = site.RefLongitude?.value;

    if (!rawLat?.length || !rawLng?.length) return null;

    const lat = dmsToDec(rawLat);
    const lng = dmsToDec(rawLng);

    if (lat === 0 && lng === 0) return null;

    return [lng, lat];
  } finally {
    api.Dispose();
  }
};
