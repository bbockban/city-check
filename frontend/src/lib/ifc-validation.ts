const PHYSICAL_PRODUCT_TYPES = new Set([
  'IFCBEAM',
  'IFCBUILDINGELEMENTPROXY',
  'IFCCOLUMN',
  'IFCCOVERING',
  'IFCCURTAINWALL',
  'IFCDOOR',
  'IFCFOOTING',
  'IFCFURNISHINGELEMENT',
  'IFCMEMBER',
  'IFCPILE',
  'IFCPLATE',
  'IFCRAILING',
  'IFCRAMP',
  'IFCROOF',
  'IFCSLAB',
  'IFCSTAIR',
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCWINDOW',
]);

const SPATIAL_STRUCTURE_TYPES = new Set([
  'IFCBUILDING',
  'IFCBUILDINGSTOREY',
  'IFCSITE',
  'IFCSPACE',
]);

const SUPPORTED_GEOMETRY_TYPES = [
  'IFCBOOLEANCLIPPINGRESULT',
  'IFCEXTRUDEDAREASOLID',
  'IFCFACEBASEDSURFACEMODEL',
  'IFCFACETEDBREP',
  'IFCMAPPEDITEM',
  'IFCSURFACEOFLINEAREXTRUSION',
];

const getEntityTypes = (ifcText: string) => [
  ...ifcText.matchAll(/^#\d+=([A-Z0-9_]+)\(/gm),
].map((match) => match[1]);

const getIfcSchema = (ifcText: string) => {
  const schema = ifcText.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);

  return schema?.[1];
};

const has3DGeometricContext = (ifcText: string) => [
  ...ifcText.matchAll(/IFCGEOMETRICREPRESENTATIONCONTEXT\(([^;]+)\);/gi),
].some((match) => {
  const args = match[1].split(',');
  const dimension = Number(args[2]?.trim());

  return dimension === 3;
});

// Umbral en metros UTM: coordenadas fuera de este rango caen lejos de cualquier huso real.
const MAX_PLAUSIBLE_MAP_CONVERSION_METERS = 10_000_000;

const getIfcWarnings = (ifcText: string) => {
  const warnings: string[] = [];

  if (ifcText.includes('IFCMAPCONVERSION(')) {
    const hasExtremeGeoreference = [
      ...ifcText.matchAll(/IFCMAPCONVERSION\([^,]+,[^,]+,([^,]+),([^,]+),([^,]+),/gi),
    ].some((match) => {
      const eastings = Math.abs(Number(match[1]));
      const northings = Math.abs(Number(match[2]));

      return eastings > MAX_PLAUSIBLE_MAP_CONVERSION_METERS || northings > MAX_PLAUSIBLE_MAP_CONVERSION_METERS;
    });

    if (hasExtremeGeoreference) {
      warnings.push('IfcMapConversion contiene coordenadas extremas: el modelo puede quedar fuera del rango visual.');
    }
  }

  return warnings;
};

export const getIfcValidationErrors = (ifcText: string) => {
  const errors: string[] = [];
  const schema = getIfcSchema(ifcText);
  const entityTypes = getEntityTypes(ifcText);

  const hasPhysicalProducts = entityTypes.some((type) => (
    PHYSICAL_PRODUCT_TYPES.has(type)
  ));

  const hasSpatialStructure = entityTypes.some((type) => (
    SPATIAL_STRUCTURE_TYPES.has(type)
  ));

  if (!schema) {
    errors.push('No se pudo identificar FILE_SCHEMA en el IFC.');
  } else if (!schema.toUpperCase().startsWith('IFC4')) {
    errors.push(`Versión IFC no soportada: ${schema}. El visualizador acepta IFC4 y sus variantes.`);
  }

  if (!ifcText.includes('IFCGEOMETRICREPRESENTATIONCONTEXT(')) {
    errors.push('Falta IfcGeometricRepresentationContext: no hay contexto geométrico para interpretar las formas.');
  } else if (!has3DGeometricContext(ifcText)) {
    errors.push('IfcGeometricRepresentationContext no define un contexto 3D válido.');
  }

  if (ifcText.includes('IFCTRIANGULATEDFACESET(') && !ifcText.includes('IFCCARTESIANPOINTLIST3D(')) {
    errors.push('IfcTriangulatedFaceSet está incompleto: falta CoordList / IfcCartesianPointList3D.');
  }

  if (hasSpatialStructure && !hasPhysicalProducts) {
    errors.push('El IFC contiene estructura espacial, pero no elementos físicos renderizables.');
  }

  if (hasPhysicalProducts && !ifcText.includes('IFCPRODUCTDEFINITIONSHAPE(')) {
    errors.push('Falta IfcProductDefinitionShape: los productos no tienen representación geométrica para renderizar.');
  }

  if (
    ifcText.includes('IFCSHAPEREPRESENTATION(')
    && SUPPORTED_GEOMETRY_TYPES.every((type) => !ifcText.includes(`${type}(`))
  ) {
    errors.push('Faltan entidades del recurso geométrico general: no hay sólidos, mallas o representaciones soportadas para convertir a malla.');
  }

  return errors;
};

export const validateIfcFile = async (file: File) => {
  const ifcText = await file.text();
  const errors = getIfcValidationErrors(ifcText);
  const warnings = getIfcWarnings(ifcText);

  return {
    errors,
    valid: errors.length === 0,
    warnings,
  };
};
