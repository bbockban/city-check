import {
  Handle,
  IFC4,
  IfcAPI,
  IFCGEOMETRICREPRESENTATIONCONTEXT,
  IFCMAPCONVERSION,
  IFCPROJECTEDCRS,
  IFCSITE,
} from 'web-ifc';

import { wgs84ToUtm21s } from './utm-zone21s';

// Converts decimal degrees to IFC IfcCompoundPlaneAngleMeasure: [deg, min, sec, microsec].
const decimalToDms = (decimal: number): [number, number, number, number] => {
  const sign = decimal < 0 ? -1 : 1;
  const abs = Math.abs(decimal);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const sFloat = (mFloat - m) * 60;
  const s = Math.floor(sFloat);
  const micro = Math.round((sFloat - s) * 1_000_000);

  return [sign * d, m, s, micro];
};

export const embedMapConversion = async (
  file: File,
  lngLat: [number, number],
  rotateZ: number,
): Promise<Blob> => {
  const api = new IfcAPI();

  api.SetWasmPath('/web-ifc/');
  await api.Init();

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const modelID = api.OpenModel(buffer);

    try {
      // Elimina entidades de georef previas para evitar duplicados.
      const existingMC = api.GetLineIDsWithType(modelID, IFCMAPCONVERSION);

      for (let i = 0; i < existingMC.size(); i++) {
        api.DeleteLine(modelID, existingMC.get(i));
      }

      const existingCRS = api.GetLineIDsWithType(modelID, IFCPROJECTEDCRS);

      for (let i = 0; i < existingCRS.size(); i++) {
        api.DeleteLine(modelID, existingCRS.get(i));
      }

      // Escribe IfcProjectedCRS para EPSG:32721 (WGS84 / UTM zona 21S).
      const projCRS = new IFC4.IfcProjectedCRS(
        new IFC4.IfcLabel('EPSG:32721'),
        null,
        null,
        null,
        null,
        null,
        null,
      );

      api.WriteLine(modelID, projCRS);

      // SourceCRS debe ser un IfcGeometricRepresentationContext (estándar IFC4).
      const ctxIDs = api.GetLineIDsWithType(modelID, IFCGEOMETRICREPRESENTATIONCONTEXT);

      if (ctxIDs.size() === 0) {
        throw new Error('IFC file has no IfcGeometricRepresentationContext — cannot embed map conversion');
      }

      const ctxExpressID = ctxIDs.get(0);
      const [easting, northing] = wgs84ToUtm21s(lngLat[0], lngLat[1]);
      const xAbsc = Math.cos(rotateZ);
      const xOrd = Math.sin(rotateZ);

      // XAxisAbscissa/Ordinate codifican la dirección del eje X del IFC en el CRS proyectado.
      // rotateZ = 0 → el eje X apunta al Este (cos=1, sin=0).
      const mc = new IFC4.IfcMapConversion(
        new Handle<IFC4.IfcGeometricRepresentationContext>(ctxExpressID),
        new Handle<IFC4.IfcProjectedCRS>(projCRS.expressID),
        new IFC4.IfcLengthMeasure(easting),
        new IFC4.IfcLengthMeasure(northing),
        new IFC4.IfcLengthMeasure(0),
        new IFC4.IfcReal(xAbsc),
        new IFC4.IfcReal(xOrd),
        new IFC4.IfcReal(1.0),
      );

      api.WriteLine(modelID, mc);

      // Actualiza IfcSite.RefLatitude/RefLongitude para que otros visores (y el nuestro
      // como fallback) usen las coordenadas que el usuario estableció en el mapa.
      const siteIDs = api.GetLineIDsWithType(modelID, IFCSITE);

      if (siteIDs.size() > 0) {
        try {
          const site = api.GetLine(modelID, siteIDs.get(0), false) as IFC4.IfcSite;
          const latDms = decimalToDms(lngLat[1]);
          const lngDms = decimalToDms(lngLat[0]);

          // web-ifc's IfcCompoundPlaneAngleMeasure no setea `.name` en su constructor
          // (a diferencia de IfcLengthMeasure/IfcReal/IfcContextDependentMeasure), y
          // WriteLine lo necesita para serializar — sin esto, la escritura tira
          // "Cannot read properties of undefined (reading 'name')".
          const refLatitude = new IFC4.IfcCompoundPlaneAngleMeasure(latDms);
          const refLongitude = new IFC4.IfcCompoundPlaneAngleMeasure(lngDms);

          (refLatitude as unknown as { name: string }).name = 'IFCCOMPOUNDPLANEANGLEMEASURE';
          (refLongitude as unknown as { name: string }).name = 'IFCCOMPOUNDPLANEANGLEMEASURE';

          site.RefLatitude = refLatitude;
          site.RefLongitude = refLongitude;
          api.WriteLine(modelID, site);
        } catch (err) {
          // No fatal: algunos archivos IFC no admiten modificación de IfcSite en lugar.
          // Se deja logueado porque, si falla, el archivo queda con RefLatitude/RefLongitude
          // desactualizado (apuntando a la posición original) mientras IfcMapConversion sí
          // se actualiza — dos referencias de georef contradictorias en el mismo archivo.
          console.warn('embedMapConversion: no se pudo actualizar IfcSite.RefLatitude/RefLongitude', err);
        }
      }

      const outputBuffer = api.SaveModel(modelID);

      return new Blob([new Uint8Array(outputBuffer)], { type: 'application/octet-stream' });
    } finally {
      api.CloseModel(modelID);
    }
  } finally {
    api.Dispose();
  }
};
