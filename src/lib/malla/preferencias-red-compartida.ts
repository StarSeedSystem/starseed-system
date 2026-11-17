/**
 * preferencias-red-compartida — preferencias por aparato de compartir internet por la
 * malla: el interruptor del aparato, el tope de «con quién», los topes de subida y
 * batería, y el modo automático. Es una decisión local de la neurona, no un dato de la
 * cuenta: vive en localStorage, se sanea al leer (un valor viejo o a mano nunca rompe la
 * red) y todo acceso al almacenamiento va en try/catch (modo privado, almacenamiento
 * bloqueado o SSR ⇒ se usan los valores por defecto, todo apagado).
 */

import type { PreferenciasRedCompartida } from "./auto-compartir";
import { COMPARTIR, type Compartir } from "./cristal/puertas-internet";

export const CLAVE_PREFERENCIAS_RED = "starseed.red-compartida.v1";

/** Límites de los topes numéricos: cualquier valor fuera vuelve al borde cercano. */
export const TOPE_SUBIDA_KBPS_MIN = 64;
export const TOPE_SUBIDA_KBPS_MAX = 102400;
export const RESERVA_BATERIA_PCT_MAX = 90;

export interface PreferenciasRedAparato {
  /** Interruptor por aparato: apagado, este aparato nunca ofrece internet. */
  compartir: boolean;
  /** Tope de «con quién»: nivel máximo de apertura que el dueño permite. */
  maximoCon: Compartir;
  /** Solo ofrecer si el aparato está en Wi-Fi. */
  soloWifi: boolean;
  /** Tope de subida compartible, en kbps. */
  kbpsSubidaMax: number;
  /** Reserva mínima de batería para compartir, en %, salvo que esté cargando. */
  reservaBateriaPct: number;
  /** Modo automático: las puertas se ajustan solas con estos topes. */
  automatico: boolean;
  /** Permitir compartir en conexiones con datos medidos. */
  compartirMedidas: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasRedAparato = {
  compartir: false,
  maximoCon: "nadie",
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

function numeroAcotado(v: unknown, porDefecto: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Convierte lo que haya guardado (cualquier cosa) en preferencias válidas. */
export function sanearPreferenciasRed(crudo: unknown): PreferenciasRedAparato {
  const base = PREFERENCIAS_POR_DEFECTO;
  if (typeof crudo !== "object" || crudo === null) return { ...base };
  const o = crudo as Record<string, unknown>;
  return {
    compartir: o.compartir === true,
    maximoCon: COMPARTIR.includes(o.maximoCon as Compartir)
      ? (o.maximoCon as Compartir)
      : base.maximoCon,
    soloWifi: o.soloWifi !== false,
    kbpsSubidaMax: numeroAcotado(
      o.kbpsSubidaMax, base.kbpsSubidaMax, TOPE_SUBIDA_KBPS_MIN, TOPE_SUBIDA_KBPS_MAX,
    ),
    reservaBateriaPct: numeroAcotado(o.reservaBateriaPct, base.reservaBateriaPct, 0, RESERVA_BATERIA_PCT_MAX),
    automatico: o.automatico === true,
    compartirMedidas: o.compartirMedidas === true,
  };
}

/**
 * ¿Este cambio de preferencias sube el nivel de apertura (nadie → público)?
 * Sí ⇒ `{ aviso: true }`: la interfaz debe pedir confirmación antes de aplicar.
 * Bajar o no moverse no avisa. Sin valor previo, se compara contra los defectos.
 */
export function cambioDeAperturaRed(
  anterior: PreferenciasRedAparato | null,
  nueva: PreferenciasRedAparato,
): { aviso: boolean } {
  const de = (anterior ?? PREFERENCIAS_POR_DEFECTO).maximoCon;
  return { aviso: COMPARTIR.indexOf(nueva.maximoCon) > COMPARTIR.indexOf(de) };
}

/** Topes del aparato en la forma que consume el motor de sugerencias (auto-compartir). */
export function aPreferenciasCompartida(p: PreferenciasRedAparato): PreferenciasRedCompartida {
  return {
    compartirMaximo: p.maximoCon,
    soloWifi: p.soloWifi,
    kbpsSubidaMax: p.kbpsSubidaMax,
    permitirMedida: p.compartirMedidas,
    reservaBateriaMinPct: p.reservaBateriaPct,
  };
}

export function leerPreferenciasRed(): PreferenciasRedAparato {
  try {
    if (typeof window === "undefined") return sanearPreferenciasRed(null);
    const txt = window.localStorage.getItem(CLAVE_PREFERENCIAS_RED);
    return sanearPreferenciasRed(txt ? JSON.parse(txt) : null);
  } catch {
    return sanearPreferenciasRed(null);
  }
}

export function guardarPreferenciasRed(p: PreferenciasRedAparato): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAVE_PREFERENCIAS_RED, JSON.stringify(sanearPreferenciasRed(p)));
  } catch {
    /* almacenamiento no disponible: la red funciona igual, solo no se recuerda la elección */
  }
}
