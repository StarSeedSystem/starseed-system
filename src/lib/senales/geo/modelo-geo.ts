/**
 * modelo-geo — la posición de una neurona, EXACTA (MAP1114C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Corrección de Alex (14-11-2026, tarde): lo que el mapa enseña es exacto. No hay celdas de ≈1 km, ni
 * redondeo, ni «zona»: una neurona o está en su punto o su posición es «desconocida» (con el motivo).
 * Esta fase solo cubre las neuronas de la propia cuenta. Las de otras personas son una fase posterior y
 * NO tienen aquí ningún valor por defecto.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

export function coordenadaValida(lat: unknown, lon: unknown): lat is number {
  return typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Lo que el aparato midió de su sitio (nunca se redondea). */
export interface PosicionCruda {
  lat: number;
  lon: number;
  /** Precisión en metros que informa el propio aparato; null si no la informa. */
  precisionM: number | null;
  /** Hora de la medida (epoch ms). */
  t: number;
}

/**
 * Lo que una neurona anuncia a las de su cuenta: el punto tal cual lo midió.
 * Opcional en la presencia (`PresenciaMedio.g`); retrocompatible: sin él, la posición es desconocida.
 */
export interface AnuncioPosicion {
  lat: number;
  lon: number;
  precisionM?: number;
  t: number;
}

/**
 * ¿Se puede mandar la posición exacta por el canal de presencia de la cuenta?
 * Respuesta de MAP1114C tras leer el código: NO está confirmado. El canal (`neur:<token>`, `lib/neurons/presencia.ts`)
 * es un canal Realtime PÚBLICO de Supabase (sin `private: true` ni política en `realtime.messages`): solo lo protege
 * que el token es secreto. Hasta que Alex decida cómo protegerlo (canal privado con política, o enviar por el canal
 * P2P de la ficha), este aparato NO envía su posición y las demás neuronas figuran «desconocida» con este motivo.
 */
export const POSICION_POR_PRESENCIA_CONFIRMADA: boolean = false;

export const MOTIVO_ENVIO_EN_PAUSA = "no anuncia su posición: el canal de presencia de la cuenta no está confirmado como privado y el envío está en pausa";

/** Lee un anuncio llegado de fuera (presencia) sin fiarse de su forma. */
export function leerAnuncio(x: unknown): AnuncioPosicion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.t !== "number" || !Number.isFinite(o.t)) return null;
  if (!coordenadaValida(o.lat, o.lon)) return null;
  const p = o.precisionM;
  return { lat: o.lat as number, lon: o.lon as number, ...(typeof p === "number" && Number.isFinite(p) && p >= 0 ? { precisionM: p } : {}), t: o.t };
}

/** Lo que fabrica un aparato para anunciar: el mismo punto, sin tocarlo. `null` = no sale nada. */
export function anuncioDesdeCruda(c: PosicionCruda | null | undefined): AnuncioPosicion | null {
  if (!c || !coordenadaValida(c.lat, c.lon) || !Number.isFinite(c.t)) return null;
  return { lat: c.lat, lon: c.lon, ...(typeof c.precisionM === "number" && Number.isFinite(c.precisionM) && c.precisionM >= 0 ? { precisionM: c.precisionM } : {}), t: c.t };
}

/** Lo que la vista dibuja de una neurona: nunca un punto inventado. */
export type PosicionVista =
  | { tipo: "exacta"; lat: number; lon: number; precisionM?: number; t: number }
  | { tipo: "desconocida"; motivo: string };

export function posicionVistaDeAnuncio(a: AnuncioPosicion | null, motivo: string): PosicionVista {
  if (!a) return { tipo: "desconocida", motivo };
  return { tipo: "exacta", lat: a.lat, lon: a.lon, ...(a.precisionM !== undefined ? { precisionM: a.precisionM } : {}), t: a.t };
}

export function coordenadasDeVista(p: PosicionVista): { lat: number; lon: number } | null {
  return p.tipo === "exacta" ? { lat: p.lat, lon: p.lon } : null;
}

/** Una posición medida hace más que esto ya no es «en vivo»: se enseña como última conocida, con su hora. */
export const POSICION_VIVA_MS = 3 * 60_000;

export function posicionEsViva(t: number, ahora: number): boolean {
  return Number.isFinite(t) && Number.isFinite(ahora) && ahora - t <= POSICION_VIVA_MS;
}

/** «hace 2 h 5 min» / «hace 40 s». Vacío si la hora no es válida. */
export function haceCuanto(t: number | null | undefined, ahora: number): string {
  if (typeof t !== "number" || !Number.isFinite(t) || !Number.isFinite(ahora)) return "";
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return rm ? `hace ${h} h ${rm} min` : `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
