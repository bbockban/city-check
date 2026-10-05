// Lee IfcMapConversion de un archivo IFC STEP mediante parsing de texto (sin WASM).
// Devuelve posición (lngLat) y rumbo desde XAxisAbscissa/Ordinate, o null si no existe.
//
// Formato STEP de IfcMapConversion (posicional):
//   IFCMAPCONVERSION(sourceCRS, targetCRS, eastings, northings, height, xAbsc, xOrd, scale)
// XAxisAbscissa = cos(rumbo), XAxisOrdinate = sin(rumbo) donde el rumbo es CCW desde el Este.
//
// api.WriteLine de web-ifc puede emitir valores envueltos en tipo (p. ej. IFCLENGTHMEASURE(570000.))
// en lugar de números simples cuando las entidades se crean programáticamente. NUM_OR_NULL cubre ambos.

import { utm21sToWgs84 } from './utm-zone21s';

export type MapConversionState = {
  heading: number;
  lngLat: [number, number];
};

const RAW_NUM = '[-\\d.Ee+]+';
// Coincide con número simple, IFCXXX(n) envuelto en tipo, o null STEP ($).
const NUM_OR_NULL = `(?:[A-Z]+\\(${RAW_NUM}\\)|${RAW_NUM}|\\$)`;
const HANDLE_OR_NULL = '(?:#\\d+|\\$)';
const SEP = '\\s*,\\s*';

// Captura: (eastings_raw)(northings_raw)(xAbsc_raw)(xOrd_raw)
// Flag 'g' para iterar todas las ocurrencias (la primera puede ser una entidad borrada con $ nulls).
const MAP_CONVERSION_RE = new RegExp(
  `IFCMAPCONVERSION\\s*\\(\\s*${HANDLE_OR_NULL}${SEP}${HANDLE_OR_NULL}${SEP}(${NUM_OR_NULL})${SEP}(${NUM_OR_NULL})${SEP}${NUM_OR_NULL}${SEP}(${NUM_OR_NULL})${SEP}(${NUM_OR_NULL})`,
  'gi',
);

// Extrae el valor numérico de un número simple o de IFCXXX(número).
const extractNum = (raw: string): number => {
  const m = /[-\d.Ee+]+/.exec(raw);

  return m ? parseFloat(m[0]) : NaN;
};

export const readMapConversionState = async (file: File): Promise<MapConversionState | null> => {
  const text = await file.text();

  // Iterar todas las ocurrencias: web-ifc puede dejar una entidad borrada (con $ en campos)
  // antes de la nueva entidad válida cuando se usa DeleteLine + WriteLine + SaveModel.
  MAP_CONVERSION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MAP_CONVERSION_RE.exec(text)) !== null) {
    const [, rawE, rawN, rawAbsc, rawOrd] = match;

    if (rawE === '$' || rawN === '$' || rawAbsc === '$' || rawOrd === '$') continue;

    const easting = extractNum(rawE);
    const northing = extractNum(rawN);
    const xAbsc = extractNum(rawAbsc);
    const xOrd = extractNum(rawOrd);

    if ([easting, northing, xAbsc, xOrd].some((v) => !Number.isFinite(v))) continue;

    return {
      heading: Math.atan2(xOrd, xAbsc),
      lngLat: utm21sToWgs84(easting, northing),
    };
  }

  return null;
};
