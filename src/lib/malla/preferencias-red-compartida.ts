/**
 * preferencias-red-compartida — configuración de red compartida por aparato.
 * Vive en localStorage, se sanea al leer (un valor viejo o a mano nunca rompe
 * la interfaz) y todo acceso al almacenamiento va en try/catch (modo privado,
 * almacenamiento bloqueado o SSR ⇒ se usan los valores por defecto).
 */

import type { Compartir } from './cristal/puertas-internet';
import { PreferenciasRedCompartida } from './auto-compartir';

export const CLAVE_PREFERENCIAS_RED = 'starseed.red-compartida.v1';

export interface PreferenciasRedCompartidaLocal {
  /** Interruptor por aparato: si está apagado, nunca se comparte. */
  interruptor: boolean;
  /** Máximo nivel de compartir permitido. */
  maximoCon: Compartir;
  /** Solo compartir cuando haya Wi-Fi. */
  soloWifi: boolean;
  /** Tope de subida en kbps. */
  kbpsSubidaMax: number;
  /** Reserva mínima de batería en % para compartir. */
  reservaBateriaPct: number;
  /** Modo automático: decidir solo según estado del dispositivo. */
  automatico: boolean;
  /** Permitir compartir en conexiones con datos medidos. */
  compartirMedidas: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: PreferenciasRedCompartidaLocal = {
  interruptor: false,
  maximoCon: 'nadie',
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

const NIVELES_COMPARTIR: Compartir[] = ['nadie', 'mi-cuenta', 'vinculos', 'grupo', 'publico'];

function esCompartirValido(v: unknown): v is Compartir {
  return typeof v === 'string' && NIVELES_COMPARTIR.includes(v as Compartir);
}

function nivelIndice(n: Compartir): number {
  return NIVELES_COMPARTIR.indexOf(n);
}

/** Convierte lo que haya guardado (cualquier cosa) en preferencias válidas. */
export function sanearPreferenciasRed(crudo: unknown): PreferenciasRedCompartidaLocal {
  const base = PREFERENCIAS_POR_DEFECTO;
  if (typeof crudo !== 'object' || crudo === null) return { ...base };
  const o = crudo as Record<string, unknown>;

  const interruptor = typeof o.interruptor === 'boolean' ? o.interruptor : base.interruptor;
  const maximoCon = esCompartirValido(o.maximoCon) ? o.maximoCon : base.maximoCon;
  const soloWifi = typeof o.soloWifi === 'boolean' ? o.soloWifi : base.soloWifi;
  const kbpsSubidaMax = typeof o.kbpsSubidaMax === 'number'
    ? Math.max(0, Math.min(100000, Math.floor(o.kbpsSubidaMax)))
    : base.kbpsSubidaMax;
  const reservaBateriaPct = typeof o.reservaBateriaPct === 'number'
    ? Math.max(0, Math.min(100, Math.floor(o.reservaBateriaPct)))
    : base.reservaBateriaPct;
  const automatico = typeof o.automatico === 'boolean' ? o.automatico : base.automatico;
  const compartirMedidas = typeof o.compartirMedidas === 'boolean' ? o.compartirMedidas : base.compartirMedidas;

  return {
    interruptor,
    maximoCon,
    soloWifi,
    kbpsSubidaMax,
    reservaBateriaPct,
    automatico,
    compartirMedidas,
  };
}

export function leerPreferenciasRed(): PreferenciasRedCompartidaLocal {
  try {
    if (typeof window === 'undefined') return sanearPreferenciasRed(null);
    const txt = window.localStorage.getItem(CLAVE_PREFERENCIAS_RED);
    return sanearPreferenciasRed(txt ? JSON.parse(txt) : null);
  } catch {
    return sanearPreferenciasRed(null);
  }
}

export interface ResultadoGuardar {
  aviso: boolean;
}

/**
 * Guarda las preferencias. Devuelve { aviso: true } si el cambio sube el
 * nivel de apertura (p. ej. «nadie» → «publico») para que la interfaz pida
 * confirmación. Bajar el nivel no avisa.
 */
export function guardarPreferenciasRed(nuevas: PreferenciasRedCompartidaLocal): ResultadoGuardar {
  const anteriores = leerPreferenciasRed();
  const subeNivel = nivelIndice(nuevas.maximoCon) > nivelIndice(anteriores.maximoCon);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CLAVE_PREFERENCIAS_RED, JSON.stringify(nuevas));
    }
  } catch {
    /* almacenamiento no disponible: la vista sigue funcionando, solo no se recuerda */
  }
  return { aviso: subeNivel };
}