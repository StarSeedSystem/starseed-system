/**
 * zona — la «zona aproximada» (MAP1114B): una celda de rejilla de ≈1 km que sustituye al punto exacto.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * La capa pública y todo ámbito que no tenga permiso de punto exacto ve SOLO esto: la celda y su centro,
 * nunca la coordenada que la originó. Decisión de Alex (14-11): ≈1 km por defecto.
 *
 * Rejilla: bandas de 0,009° de latitud (≈1 km); dentro de cada banda, el paso de longitud se ensancha
 * con 1/cos(lat) para que la celda siga midiendo ≈1 km también lejos del ecuador. La celda se nombra
 * por sus índices enteros (`z1:<banda>:<columna>`), como un geohash truncado.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

export const PASO_LAT_GRADOS = 0.009;
/** Radio del halo que se dibuja (mitad de la diagonal de una celda de 1 km). */
export const RADIO_ZONA_M = 710;

export interface ZonaAprox {
  /** Identificador estable de la celda. */
  celda: string;
  /** Centro de la celda (lo único que se dibuja como «posición»). */
  lat: number;
  lon: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  radioM: number;
}

export function coordenadaValida(lat: unknown, lon: unknown): lat is number {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function redondear(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Punto → celda de ≈1 km. `null` si la coordenada no es válida. Nunca devuelve el punto de entrada. */
export function zonaAproximada(lat: number, lon: number): ZonaAprox | null {
  if (!coordenadaValida(lat, lon)) return null;
  const latAcot = Math.max(-89.99, Math.min(89.99, lat));
  const banda = Math.floor(latAcot / PASO_LAT_GRADOS);
  const latMin = banda * PASO_LAT_GRADOS;
  const latCentro = latMin + PASO_LAT_GRADOS / 2;
  const pasoLon = PASO_LAT_GRADOS / Math.max(0.01, Math.cos((latCentro * Math.PI) / 180));
  const columna = Math.floor((lon + 180) / pasoLon);
  const lonMin = columna * pasoLon - 180;
  let cLat = latCentro;
  let cLon = lonMin + pasoLon / 2;
  // Caso de medida cero: el punto cae justo en el centro. Se enseña la esquina suroeste (sigue dentro de la zona).
  if (Math.abs(cLat - lat) < 1e-6 && Math.abs(cLon - lon) < 1e-6) {
    cLat = latMin;
    cLon = lonMin;
  }
  return {
    celda: `z1:${banda}:${columna}`,
    lat: redondear(cLat),
    lon: redondear(cLon),
    latMin: redondear(latMin),
    latMax: redondear(latMin + PASO_LAT_GRADOS),
    lonMin: redondear(lonMin),
    lonMax: redondear(lonMin + pasoLon),
    radioM: RADIO_ZONA_M,
  };
}
