"use client";

/*
 * fusion-alias — el registro de neuronas FUSIONADAS de la cuenta (2026-10-09).
 * ═══════════════════════════════════════════════════════════════════════════
 * Al fusionar las neuronas repetidas de un mismo aparato, las filas absorbidas se borran. Pero
 * los medios que las usaban (la app nativa, otra pestaña, el móvil apagado) siguen guardando su
 * id viejo: en su próximo latido la volverían a crear y el duplicado reaparecería. Por eso la
 * fusión deja aquí `idViejo → idQueSeQueda`, en una clave que VIAJA con la cuenta: cada medio,
 * al arrancar y en cada latido, mira si su id fue fusionado y adopta el nuevo sin preguntar.
 *
 * También guarda el RESPALDO de cada fusión (las filas tal como estaban y los ajustes movidos),
 * para poder deshacerla. Se conservan las 10 últimas.
 *
 * Clave: `starseed.neuronas.fusiones.v1` (en SYNCED_KEYS de settings-sync). Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const CLAVE_FUSIONES = "starseed.neuronas.fusiones.v1";
export const EVENTO_FUSIONES = "starseed:neuronas-fusiones";
export const MAX_RESPALDOS = 10;

/** Una entrada movida de un id a otro dentro de un almacén sincronizado (para deshacer). */
export interface EntradaMovida {
  clave: string;
  ruta: string[];
  valor: unknown;
}

export interface RespaldoFusion {
  /** Epoch ms de la fusión (sirve de id). */
  ts: number;
  principal: string;
  absorbidas: string[];
  /** Filas de `neuron_devices` tal como estaban antes de borrarlas. */
  filas: Array<Record<string, unknown>>;
  /** Ajustes que estaban colgados de los ids absorbidos (para devolverlos al deshacer). */
  movidas: EntradaMovida[];
  deshecha?: boolean;
}

export interface RegistroFusiones {
  v: 1;
  /** id absorbido → id que se queda. */
  alias: Record<string, { a: string; ts: number }>;
  respaldos: RespaldoFusion[];
}

const VACIO: RegistroFusiones = { v: 1, alias: {}, respaldos: [] };

export function leerFusiones(): RegistroFusiones {
  try {
    const raw = safeGet(CLAVE_FUSIONES);
    if (!raw) return { ...VACIO, alias: {}, respaldos: [] };
    const j = JSON.parse(raw) as Partial<RegistroFusiones> | null;
    return {
      v: 1,
      alias: j?.alias && typeof j.alias === "object" ? (j.alias as RegistroFusiones["alias"]) : {},
      respaldos: Array.isArray(j?.respaldos) ? (j!.respaldos as RespaldoFusion[]) : [],
    };
  } catch {
    return { ...VACIO, alias: {}, respaldos: [] };
  }
}

export function escribirFusiones(r: RegistroFusiones): boolean {
  const limpio: RegistroFusiones = { v: 1, alias: r.alias, respaldos: r.respaldos.slice(-MAX_RESPALDOS) };
  // `localStorage.setItem` directo: el parche de realtime-sync lo empuja a la cuenta.
  let ok = false;
  try {
    window.localStorage.setItem(CLAVE_FUSIONES, JSON.stringify(limpio));
    ok = true;
  } catch {
    ok = safeSet(CLAVE_FUSIONES, JSON.stringify(limpio));
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_FUSIONES));
  } catch {
    /* sin window */
  }
  return ok;
}

/**
 * ¿En qué neurona acabó `id`? Sigue la cadena de alias (A→B→C) como mucho 6 saltos y sin
 * ciclos. Devuelve el mismo id si no fue fusionado. Puro.
 */
export function destinoDeAlias(id: string, alias: RegistroFusiones["alias"]): string {
  let actual = id;
  const vistos = new Set<string>([id]);
  for (let i = 0; i < 6; i++) {
    const sig = alias[actual]?.a;
    if (!sig || vistos.has(sig)) break;
    vistos.add(sig);
    actual = sig;
  }
  return actual;
}

/** Atajo: destino del id según lo guardado ahora. */
export function neuronaVigente(id: string): string {
  if (!id) return id;
  return destinoDeAlias(id, leerFusiones().alias);
}
