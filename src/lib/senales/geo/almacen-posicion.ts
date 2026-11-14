/**
 * almacen-posicion — dónde guarda ESTE aparato su posición cruda y a quién se la deja ver (MAP1114B).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * El punto crudo y la preferencia viven solo en este navegador (`localStorage`, por aparato = por
 * neurona). Lo único que sale de aquí es lo que fabrica `anuncioParaAmbito`. La ubicación se pide SOLO
 * con un gesto de la persona (botón) o si el permiso ya estaba concedido; nada se deduce ni se rastrea.
 * Nunca lanza.
 */

import { safeGet, safeSet, safeRemove } from "@/lib/safe-storage";
import {
  anuncioParaAmbito, PREFERENCIA_POSICION_DEFECTO,
  type AnuncioPosicion, type NivelPosicion, type PosicionCruda, type PreferenciaPosicion,
} from "./modelo-geo";
import { coordenadaValida } from "./zona";

export const CLAVE_POSICION = "starseed.mapa.posicion.v1";
export const CLAVE_PREFERENCIA_POSICION = "starseed.mapa.posicion.pref.v1";
export const EVENTO_POSICION = "starseed:mapa-posicion";

const NIVELES: readonly NivelPosicion[] = ["no", "zona", "exacta"];

function avisar(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_POSICION));
  } catch {
    /* */
  }
}

export function leerPreferenciaPosicion(): PreferenciaPosicion {
  try {
    const raw = safeGet(CLAVE_PREFERENCIA_POSICION);
    if (!raw) return { ...PREFERENCIA_POSICION_DEFECTO };
    const j = JSON.parse(raw) as Partial<PreferenciaPosicion>;
    const nivel = (x: unknown, def: NivelPosicion): NivelPosicion => (NIVELES.includes(x as NivelPosicion) ? (x as NivelPosicion) : def);
    const aut: Record<string, "zona" | "exacta"> = {};
    if (j.autorizados && typeof j.autorizados === "object") {
      for (const [k, v] of Object.entries(j.autorizados)) if (v === "zona" || v === "exacta") aut[k] = v;
    }
    return { cuenta: nivel(j.cuenta, "no"), publica: nivel(j.publica, "no"), autorizados: aut };
  } catch {
    return { ...PREFERENCIA_POSICION_DEFECTO };
  }
}

export function fijarPreferenciaPosicion(parche: Partial<PreferenciaPosicion>): PreferenciaPosicion {
  const next: PreferenciaPosicion = { ...leerPreferenciaPosicion(), ...parche };
  safeSet(CLAVE_PREFERENCIA_POSICION, JSON.stringify(next));
  avisar();
  return next;
}

export function leerPosicionCruda(): PosicionCruda | null {
  try {
    const raw = safeGet(CLAVE_POSICION);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<PosicionCruda>;
    if (!coordenadaValida(j.lat, j.lon) || typeof j.t !== "number") return null;
    const fuente = j.fuente === "manual" || j.fuente === "lora" ? j.fuente : "gps";
    return { lat: j.lat as number, lon: j.lon as number, precisionM: typeof j.precisionM === "number" ? j.precisionM : null, t: j.t, fuente };
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

/** Lo que este aparato dice de su posición a las neuronas de su cuenta (null = nada, por defecto). */
export function anuncioParaMiCuenta(): AnuncioPosicion | null {
  return anuncioParaAmbito(leerPosicionCruda(), leerPreferenciaPosicion(), { tipo: "cuenta" });
}

export type ResultadoUbicacion = { ok: true; posicion: PosicionCruda } | { ok: false; motivo: string };

/** Pide la ubicación al navegador. Llamar SOLO desde un gesto de la persona. */
export function pedirUbicacion(): Promise<ResultadoUbicacion> {
  return new Promise((resolver) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolver({ ok: false, motivo: "este navegador no ofrece ubicación" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (g) => {
        const posicion: PosicionCruda = { lat: g.coords.latitude, lon: g.coords.longitude, precisionM: Number.isFinite(g.coords.accuracy) ? g.coords.accuracy : null, t: Date.now(), fuente: "gps" };
        guardarPosicionCruda(posicion);
        resolver({ ok: true, posicion });
      },
      (err) => resolver({ ok: false, motivo: err.code === 1 ? "no diste permiso de ubicación" : err.code === 2 ? "no se pudo determinar la ubicación" : "la ubicación tardó demasiado" }),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

/** Si el permiso YA estaba concedido, refresca la posición sin molestar. Nunca lo pide. */
export async function refrescarSiConcedido(): Promise<void> {
  try {
    const estado = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (estado?.state === "granted") await pedirUbicacion();
  } catch {
    /* */
  }
}
