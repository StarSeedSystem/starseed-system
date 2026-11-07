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

/* ───────────── Filas conservadas al fusionar (NEU1107B · architecture/neurona-bienvenida.md §3) ───────────── */

/**
 * Marca que deja una fusión «sin borrar» en `capabilities` de cada fila absorbida (jsonb que ya
 * existe: sin migración). La fila se queda como historial; las listas la saltan.
 */
export const MARCA_FUSIONADA = "fusionada";

export interface MarcaFusionada {
  /** Id de la neurona que se quedó. */
  en: string;
  /** Epoch ms de la fusión (el id del respaldo para deshacer). */
  ts: number;
  /** Desde dónde se fusionó («bienvenida», «panel»…). */
  por?: string;
}

/** Si la fila se fusionó en otra, el id de esa otra; si no, null. Pura. */
export function fusionadaEn(capabilities: unknown): string | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  const m = (capabilities as Record<string, unknown>)[MARCA_FUSIONADA] as { en?: unknown } | undefined;
  return m && typeof m === "object" && typeof m.en === "string" && m.en ? m.en : null;
}

/**
 * Ids que la app nativa debe reconocer en el faro (`antenas.json` → `conocidas`): los vigentes y,
 * además, los absorbidos que apuntan a uno vigente. Un medio que aún no adoptó el id que se quedó
 * (app cerrada, sin internet) sigue anunciándose con el viejo: así las demás lo siguen reconociendo
 * como neurona de la cuenta hasta que lo adopte. Sin repetidos y ordenados. Pura.
 */
export function idsConocidasConAlias(vigentes: readonly string[], alias: RegistroFusiones["alias"]): string[] {
  const out = new Set(vigentes.filter((i) => typeof i === "string" && i));
  for (const viejo of Object.keys(alias ?? {})) {
    if (viejo && out.has(destinoDeAlias(viejo, alias)) && !out.has(viejo)) out.add(viejo);
  }
  return [...out].sort();
}
