/**
 * preferencias-red-compartida — cómo decide cada aparato si comparte su internet con
 * la malla: interruptor por aparato, con quién como máximo, topes y modo automático.
 * Es una preferencia local del aparato, no de la cuenta: vive en localStorage, se
 * sanea al leer (un valor viejo o tocado a mano nunca rompe nada) y todo acceso al
 * almacenamiento va en try/catch (modo privado, almacenamiento bloqueado o SSR).
 */

import type { PreferenciasRedCompartida } from './auto-compartir';
import { COMPARTIR, type Compartir } from './cristal/puertas-internet';

export const CLAVE_PREFERENCIAS_RED = 'starseed.malla-red-compartida.v1';

export interface PreferenciasRed {
  /** Interruptor general de este aparato; apagado, nunca comparte. */
  encendido: boolean;
  /** Con quién se comparte como máximo. */
  maximoCon: Compartir;
  soloWifi: boolean;
  kbpsSubidaMax: number;
  reservaBateriaPct: number;
  automatico: boolean;
  compartirMedidas: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasRed = {
  encendido: false,
  maximoCon: 'nadie',
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

const KBP_MIN = 8;
const KBP_MAX = 1_000_000;

function enteroAcotado(valor: unknown, defecto: number, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return defecto;
  return Math.min(max, Math.max(min, Math.round(valor)));
}

/** Convierte lo que haya guardado (cualquier cosa) en preferencias válidas y seguras. */
export function sanearPreferenciasRed(crudo: unknown): PreferenciasRed {
  const base = PREFERENCIAS_POR_DEFECTO;
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    return { ...base };
  }
  const o = crudo as Record<string, unknown>;
  return {
    encendido: o.encendido === true,
    maximoCon: COMPARTIR.includes(o.maximoCon as Compartir)
      ? (o.maximoCon as Compartir)
      : base.maximoCon,
    soloWifi: o.soloWifi !== false,
    kbpsSubidaMax: enteroAcotado(o.kbpsSubidaMax, base.kbpsSubidaMax, KBP_MIN, KBP_MAX),
    reservaBateriaPct: enteroAcotado(o.reservaBateriaPct, base.reservaBateriaPct, 0, 100),
    automatico: o.automatico === true,
    compartirMedidas: o.compartirMedidas === true,
  };
}

/** Nivel efectivo de apertura: 0 con el interruptor apagado; si no, el índice de COMPARTIR. */
export function nivelApertura(p: PreferenciasRed): number {
  if (!p.encendido) return 0;
  const indice = COMPARTIR.indexOf(p.maximoCon);
  return indice < 0 ? 0 : indice;
}

/** ¿El cambio abre más que antes? Subir de «nadie» a «público» pide confirmación. */
export function subeApertura(antes: PreferenciasRed, despues: PreferenciasRed): boolean {
  return nivelApertura(despues) > nivelApertura(antes);
}

/** Preferencias locales traducidas al contrato puro del motor de auto-compartir. */
export function paraMotorRed(p: PreferenciasRed): PreferenciasRedCompartida {
  return {
    compartirMaximo: p.encendido ? p.maximoCon : 'nadie',
    soloWifi: p.soloWifi,
    kbpsSubidaMax: p.kbpsSubidaMax,
    permitirMedida: p.compartirMedidas,
    reservaBateriaMinPct: p.reservaBateriaPct,
  };
}

export function leerPreferenciasRed(): PreferenciasRed {
  try {
    if (typeof window === 'undefined') return { ...PREFERENCIAS_POR_DEFECTO };
    const txt = window.localStorage.getItem(CLAVE_PREFERENCIAS_RED);
    return sanearPreferenciasRed(txt ? JSON.parse(txt) : null);
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/**
 * Guarda las preferencias y avisa si el cambio abre la red más que antes
 * (`{aviso: true}`): la interfaz lo usa para pedir confirmación a la persona.
 */
export function guardarPreferenciasRed(p: PreferenciasRed): { aviso: boolean } {
  const saneadas = sanearPreferenciasRed(p);
  const antes = leerPreferenciasRed();
  const aviso = subeApertura(antes, saneadas);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CLAVE_PREFERENCIAS_RED, JSON.stringify(saneadas));
    }
  } catch {
    /* almacenamiento no disponible: el ajuste vale para esta sesión, solo no se recuerda */
  }
  return { aviso };
}
