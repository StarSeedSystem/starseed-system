/**
 * discovery-scan.ts — Acotar el barrido de `/api/discovery/scan` (Ola Dream
 * 2026-10-05). Medido en vivo: 48 s y ~8,6 MB de respuesta porque el backend
 * recorre el dispositivo entero sin límite. Aquí vive lo PURO: construir la
 * ruta con `limite` (el backend la honra; si es viejo, la ignora sin romperse,
 * Los parámetros de query desconocidos no invalidan el endpoint) y recortar la
 * respuesta en cliente de forma defensiva para que la UI nunca retenga MB de
 * dispositivos que no va a mostrar.
 */

/** Tope por defecto de dispositivos por barrido. */
export const DISCOVERY_SCAN_LIMITE_DEFECTO = 25;

/** Ruta del barrido acotado; sin límite válido se devuelve la ruta pelada. */
export function discoveryScanPath(limite?: number): string {
  const n = typeof limite === "number" && Number.isFinite(limite) ? Math.floor(limite) : 0;
  return n > 0 ? `/api/discovery/scan?limite=${n}` : "/api/discovery/scan";
}

export function recortarDiscoveryScan<T extends object>(data: T, limite = DISCOVERY_SCAN_LIMITE_DEFECTO): T {
  const n = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : DISCOVERY_SCAN_LIMITE_DEFECTO;
  const devices = (data as { devices?: unknown }).devices;
  if (!Array.isArray(devices) || devices.length <= n) return data;
  return { ...data, devices: devices.slice(0, n) };
}
