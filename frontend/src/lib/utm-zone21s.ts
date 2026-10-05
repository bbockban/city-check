// Proyección Transversa de Mercator directa/inversa estándar, WGS84, Zona 21S (EPSG:32721).
// Expansión en series de Helmert — precisión subcentimétrica dentro de la zona.
// Referencias: USGS Professional Paper 1395 ("Map Projections — A Working Manual").

const A_WGS84 = 6_378_137.0;
const E2_WGS84 = 0.006_694_379_990_14; // primera excentricidad al cuadrado
const K0 = 0.9996; // factor de escala UTM
const FALSE_EASTING = 500_000;
const FALSE_NORTHING = 10_000_000; // hemisferio sur
const LNG0_RAD = -57 * (Math.PI / 180); // meridiano central: −57°

export const wgs84ToUtm21s = (lng: number, lat: number): [number, number] => {
  const phi = lat * (Math.PI / 180);
  const lam = lng * (Math.PI / 180);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const e2 = E2_WGS84;
  const ep2 = e2 / (1 - e2); // segunda excentricidad al cuadrado
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  // Radio de curvatura en el plano vertical principal
  const bigN = A_WGS84 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const bigA = cosPhi * (lam - LNG0_RAD);

  // Arco meridiano desde el ecuador hasta phi
  const bigM = A_WGS84 * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi)
  );

  const a2 = bigA * bigA;
  const a3 = a2 * bigA;
  const a4 = a2 * a2;
  const a5 = a4 * bigA;
  const a6 = a4 * a2;

  const x = K0 * bigN * (
    bigA
    + ((1 - T + C) * a3) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * a5) / 120
  );

  const y = K0 * (
    bigM + bigN * tanPhi * (
      a2 / 2
      + ((5 - T + 9 * C + 4 * C * C) * a4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * a6) / 720
    )
  );

  return [FALSE_EASTING + x, FALSE_NORTHING + y];
};

// UTM inversa Zona 21S → WGS84. Devuelve [longitud, latitud] en grados decimales.
export const utm21sToWgs84 = (easting: number, northing: number): [number, number] => {
  const x = easting - FALSE_EASTING;
  const y = northing - FALSE_NORTHING;
  const e2 = E2_WGS84;
  const ep2 = e2 / (1 - e2);
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  // Latitud del pie vía series (USGS PP-1395 ec. 3-26)
  const M = y / K0;
  const mu = M / (A_WGS84 * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const e1s = e1 * e1;
  const e1c = e1s * e1;
  const e1q = e1s * e1s;

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1c / 32) * Math.sin(2 * mu)
    + (21 * e1s / 16 - 55 * e1q / 32) * Math.sin(4 * mu)
    + (151 * e1c / 96) * Math.sin(6 * mu)
    + (1097 * e1q / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = sinPhi1 / cosPhi1;

  const N1 = A_WGS84 / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = A_WGS84 * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * K0);
  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D2 * D2;
  const D5 = D4 * D;
  const D6 = D4 * D2;

  const phi = phi1 - (N1 * tanPhi1 / R1) * (
    D2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6 / 720
  );

  const lam = LNG0_RAD + (
    D
    - (1 + 2 * T1 + C1) * D3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5 / 120
  ) / cosPhi1;

  return [lam * (180 / Math.PI), phi * (180 / Math.PI)]; // [lng, lat]
};
