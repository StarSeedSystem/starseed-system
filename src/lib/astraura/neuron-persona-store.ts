"use client";

/**
 * STORE de sistemas por neurona × personalidad (Adenda 149 · núcleo sin dependencias).
 * ============================================================================
 * SOP: `architecture/astraura-config-sistemas-neurona.md`.
 *
 * Módulo MÍNIMO (solo `safe-storage`) para que los CONSUMIDORES de runtime —
 * `personalities.ts::intelligencePinFor` (LLM), `engine-registry.ts` (voz),
 * el compilador de prompt (memoria) y el subsistema mesh (señales) — puedan
 * leer los overrides SIN ciclos de import. La capa alta (resolución con
 * procedencia, antenas, novedades) vive en `neuron-persona-systems.ts`, que
 * re-exporta todo lo de aquí.
 *
 * Reglas de fusión (revisión adversarial A149 · M2):
 *  - `getOverrides` fusiona `"*"` (Todas) con la personalidad CAMPO A CAMPO
 *    por sistema (y ANTENA a ANTENA en señales): un override parcial de la
 *    personalidad ya no tapa el resto de lo definido en «Todas».
 *  - `saveOverrides` PODA: un campo pasado explícitamente como `undefined` se
 *    BORRA; los objetos que quedan vacíos se eliminan (nunca persiste `{}`
 *    fantasma que enmascare la herencia).
 *
 * SSR-safe. Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const NEURON_PERSONA_KEY = "starseed.astraura.neuron-persona.v1";
export const NEURON_PERSONA_EVENT = "starseed:astraura-neuron-persona";
/** Clave especial: defaults de la neurona para «Todas las personalidades». */
export const ALL_PERSONAS = "*";

/** Ruta de salida preferida de una antena (política de la red sináptica, A99). */
export type AntennaRouteMode = "auto" | "privada" | "mesh" | "servidor";

/** Regla por antena. Campos ausentes ⇒ activada, entrada+salida, ruta auto. */
export interface AntennaRule {
  enabled?: boolean;
  entrada?: boolean;
  salida?: boolean;
  ruta?: AntennaRouteMode;
}

/** Overrides por sistema. TODOS opcionales = heredar/auto (capa transparente). */
export interface PersonaNeuronOverrides {
  llm?: { fuente?: string; modelo?: string };
  astraura?: { modo?: "auto" | "fija"; permitirPago?: boolean };
  voz?: { motor?: string; modo?: "cloud" | "local" | "fastweb" };
  cerebro?: {
    almacen?: "auto" | "local" | "servidor";
    usarMemorias?: boolean;
    nivelContexto?: "breve" | "completo";
    cerebrosPermitidos?: "todos" | string[];
  };
  senales?: { porAntena?: Record<string, AntennaRule> };
}

type DeviceMap = Record<string, Record<string, PersonaNeuronOverrides>>;

function readAll(): DeviceMap {
  try {
    const raw = safeGet(NEURON_PERSONA_KEY);
    const p = raw ? (JSON.parse(raw) as unknown) : null;
    return p && typeof p === "object" ? (p as DeviceMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: DeviceMap): void {
  try {
    safeSet(NEURON_PERSONA_KEY, JSON.stringify(map));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NEURON_PERSONA_EVENT));
  } catch { /* best-effort */ }
}

/** Copia superficial SIN claves de valor `undefined` (para fusionar/poda). */
function defined<T extends object>(obj: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function isEmpty(obj: unknown): boolean {
  return !obj || typeof obj !== "object" || Object.keys(obj as object).length === 0;
}

/** Fusión campo a campo: `own` gana solo en los campos que DEFINE. */
function mergeSystem<T extends object>(base?: T, own?: T): T | undefined {
  if (!base && !own) return undefined;
  return { ...(base ?? {}), ...defined(own) } as T;
}

/** Fusión de señales ANTENA a ANTENA (y campo a campo dentro de cada regla). */
function mergeSenales(
  base?: PersonaNeuronOverrides["senales"],
  own?: PersonaNeuronOverrides["senales"],
): PersonaNeuronOverrides["senales"] {
  if (!base && !own) return undefined;
  const out: Record<string, AntennaRule> = {};
  for (const [id, rule] of Object.entries(base?.porAntena ?? {})) out[id] = { ...rule };
  for (const [id, rule] of Object.entries(own?.porAntena ?? {})) {
    out[id] = { ...(out[id] ?? {}), ...defined(rule) };
  }
  return { porAntena: out };
}

/** Overrides guardados para una personalidad en una neurona (SIN mezclar `"*"`). */
export function getRawOverrides(deviceId: string, personaId: string): PersonaNeuronOverrides {
  const dev = readAll()[deviceId];
  return dev?.[personaId] ? { ...dev[personaId] } : {};
}

/**
 * Overrides EFECTIVOS de una personalidad en una neurona: defaults `"*"` de la
 * neurona fusionados CAMPO A CAMPO con los propios de la personalidad (estos
 * ganan solo en lo que definen).
 */
export function getOverrides(deviceId: string, personaId: string): PersonaNeuronOverrides {
  const dev = readAll()[deviceId] ?? {};
  const base = personaId === ALL_PERSONAS ? {} : dev[ALL_PERSONAS] ?? {};
  const own = dev[personaId] ?? {};
  const out: PersonaNeuronOverrides = {};
  const llm = mergeSystem(base.llm, own.llm);
  const astraura = mergeSystem(base.astraura, own.astraura);
  const voz = mergeSystem(base.voz, own.voz);
  const cerebro = mergeSystem(base.cerebro, own.cerebro);
  const senales = mergeSenales(base.senales, own.senales);
  if (!isEmpty(llm)) out.llm = llm;
  if (!isEmpty(astraura)) out.astraura = astraura;
  if (!isEmpty(voz)) out.voz = voz;
  if (!isEmpty(cerebro)) out.cerebro = cerebro;
  if (senales && !isEmpty(senales.porAntena)) out.senales = senales;
  return out;
}

/**
 * Mezcla y persiste un parche de overrides. Un campo pasado EXPLÍCITAMENTE como
 * `undefined` se borra del override guardado; los objetos vacíos se podan (la
 * personalidad vuelve a heredar de «Todas»/auto sin `{}` fantasma).
 */
export function saveOverrides(deviceId: string, personaId: string, patch: PersonaNeuronOverrides): void {
  if (!deviceId || !personaId) return;
  const map = readAll();
  const dev = (map[deviceId] = map[deviceId] ?? {});
  const cur = dev[personaId] ?? {};
  const next: PersonaNeuronOverrides = { ...cur };

  if ("llm" in patch) {
    const merged = defined({ ...(cur.llm ?? {}), ...(patch.llm ?? {}) });
    if (isEmpty(merged)) delete next.llm; else next.llm = merged;
  }
  if ("astraura" in patch) {
    const merged = defined({ ...(cur.astraura ?? {}), ...(patch.astraura ?? {}) });
    if (isEmpty(merged)) delete next.astraura; else next.astraura = merged;
  }
  if ("voz" in patch) {
    const merged = defined({ ...(cur.voz ?? {}), ...(patch.voz ?? {}) });
    if (isEmpty(merged)) delete next.voz; else next.voz = merged;
  }
  if ("cerebro" in patch) {
    const merged = defined({ ...(cur.cerebro ?? {}), ...(patch.cerebro ?? {}) });
    if (isEmpty(merged)) delete next.cerebro; else next.cerebro = merged;
  }
  if ("senales" in patch) {
    const porAntena: Record<string, AntennaRule> = { ...(cur.senales?.porAntena ?? {}) };
    for (const [id, rule] of Object.entries(patch.senales?.porAntena ?? {})) {
      const merged = defined({ ...(porAntena[id] ?? {}), ...rule }) as AntennaRule;
      if (isEmpty(merged)) delete porAntena[id]; else porAntena[id] = merged;
    }
    if (isEmpty(porAntena)) delete next.senales; else next.senales = { porAntena };
  }

  if (isEmpty(next)) delete dev[personaId];
  else dev[personaId] = next;
  if (isEmpty(dev)) delete map[deviceId];
  writeAll(map);
}

/** Quita un override (un sistema, o todos si no se indica) → vuelve a heredar/auto. */
export function clearOverrides(deviceId: string, personaId: string, system?: keyof PersonaNeuronOverrides): void {
  const map = readAll();
  const dev = map[deviceId];
  if (!dev?.[personaId]) return;
  if (system) delete dev[personaId][system];
  else delete dev[personaId];
  if (dev[personaId] && isEmpty(dev[personaId])) delete dev[personaId];
  if (isEmpty(dev)) delete map[deviceId];
  writeAll(map);
}

export function subscribeNeuronPersona(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(NEURON_PERSONA_EVENT, h);
  return () => window.removeEventListener(NEURON_PERSONA_EVENT, h);
}
