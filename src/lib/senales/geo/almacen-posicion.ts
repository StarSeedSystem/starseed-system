/**
 * almacen-posicion — dónde guarda ESTE aparato su última posición medida y su interruptor (MAP1114C).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * La posición viene de la vigilancia (`watchPosition`) que ya hace `MapView`; aquí solo se guarda la última
 * en este navegador (`localStorage`, por aparato) para anunciarla a la cuenta por el canal privado de posición
 * (`canal-posicion.ts`). Un solo interruptor por aparato: «Compartir la ubicación de este
 * aparato con mi cuenta», activado de fábrica (solo tiene efecto si el aparato ya dio su ubicación).
 * Nunca lanza.
 */

import { safeGet, safeSet, safeRemove } from "@/lib/safe-storage";
import { coordenadaValida, type PosicionCruda } from "./modelo-geo";

export const CLAVE_POSICION = "starseed.mapa.posicion.v2";
export const CLAVE_COMPARTIR_POSICION = "starseed.mapa.posicion.compartir.v1";
export const EVENTO_POSICION = "starseed:mapa-posicion";

function avisar(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_POSICION));
  } catch {
    /* */
  }
}

/** ¿Está activado el interruptor? De fábrica, sí. */
export function leerCompartirPosicion(): boolean {
  try {
    return safeGet(CLAVE_COMPARTIR_POSICION) !== "0";
  } catch {
    return true;
  }
}

export function fijarCompartirPosicion(on: boolean): void {
  safeSet(CLAVE_COMPARTIR_POSICION, on ? "1" : "0");
  avisar();
}

export function leerPosicionCruda(): PosicionCruda | null {
  try {
    const raw = safeGet(CLAVE_POSICION);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<PosicionCruda>;
    if (!coordenadaValida(j.lat, j.lon) || typeof j.t !== "number" || !Number.isFinite(j.t)) return null;
    return { lat: j.lat as number, lon: j.lon as number, precisionM: typeof j.precisionM === "number" ? j.precisionM : null, t: j.t };
  } catch {
    return null;
  }
}

export function guardarPosicionCruda(p: PosicionCruda): void {
  safeSet(CLAVE_POSICION, JSON.stringify(p));
  avisar();
}

export function olvidarPosicionCruda(): void {
  safeRemove(CLAVE_POSICION);
  avisar();
}
