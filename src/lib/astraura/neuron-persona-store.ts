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
 *
 * Ampliación A149 · ola 2/3 (§2.1, §2.3, §2.10) — todo ADITIVO y puro:
 *  - `getRawDevice`/`replaceDeviceOverrides`/`clearDeviceOverrides`: trabajo por
 *    ÁMBITO de neurona completa (snapshot, «volver a auto» de toda la neurona,
 *    deshacer de una copia).
 *  - `diffOverrides`: función PURA que compara dos mapas crudos y devuelve el
 *    «qué cambia» legible (sistema · personalidad · antes → después).
 *  - `listConfiguredDevices`/`copyOverrides`: copiar la configuración de OTRA
 *    neurona (el store ya es `{[deviceId]:{[personaId]:overrides}}` y viaja con
 *    la cuenta, así que copiar es lectura + escritura pura con la misma poda).
 *  - `exportNeuronPersonaJson`/`importNeuronPersonaJson`: archivo portable.
 *
 * `security/scanner` es un módulo HOJA (cero imports) y por tanto NO puede
 * introducir ciclos: la garantía de la cabecera («leer overrides sin ciclos»)
 * se mantiene intacta.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { scanDeep, redactDeep, summarize } from "@/lib/security/scanner";

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

/* ═══════════════ Ámbito NEURONA COMPLETA (snapshot · reset · copia) ═══════════════ */

/** Sistemas editables (claves del override). */
type Sistema = keyof PersonaNeuronOverrides;

const SISTEMAS: Sistema[] = ["llm", "astraura", "voz", "cerebro", "senales"];

/** Mapa CRUDO de TODAS las personalidades configuradas en una neurona (copia). */
export function getRawDevice(deviceId: string): Record<string, PersonaNeuronOverrides> {
  if (!deviceId) return {};
  try {
    const dev = readAll()[deviceId];
    if (!dev) return {};
    return JSON.parse(JSON.stringify(dev)) as Record<string, PersonaNeuronOverrides>;
  } catch {
    return {};
  }
}

/**
 * Sustituye el mapa COMPLETO de una neurona (o lo borra si llega vacío/nulo).
 * Es la contrapartida de `getRawDevice`: con las dos se hace «deshacer» de una
 * copia o de una importación sin tocar el resto de neuronas de la cuenta.
 */
export function replaceDeviceOverrides(
  deviceId: string,
  next: Record<string, PersonaNeuronOverrides> | null | undefined,
): void {
  if (!deviceId) return;
  const map = readAll();
  const clean: Record<string, PersonaNeuronOverrides> = {};
  for (const [personaId, ov] of Object.entries(next ?? {})) {
    if (!personaId || isEmpty(ov)) continue;
    clean[personaId] = ov;
  }
  if (isEmpty(clean)) delete map[deviceId];
  else map[deviceId] = clean;
  writeAll(map);
}

/** Borra TODOS los ajustes propios de una neurona (todas sus personalidades). */
export function clearDeviceOverrides(deviceId: string): void {
  if (!deviceId) return;
  const map = readAll();
  if (!map[deviceId]) return;
  delete map[deviceId];
  writeAll(map);
}

/** Neuronas (deviceId) que tienen ALGÚN ajuste propio guardado en la cuenta. */
export function listConfiguredDevices(): string[] {
  try {
    return Object.entries(readAll())
      .filter(([id, dev]) => !!id && !isEmpty(dev))
      .map(([id]) => id);
  } catch {
    return [];
  }
}

/**
 * Copia los ajustes de una neurona a otra. `personaIds`/`systems` acotan qué se
 * copia; sin ellos, TODO. Los sistemas seleccionados quedan IGUALES al origen:
 * si el origen no define uno, se borra en el destino (copiar es espejar, no
 * acumular). Devuelve cuántos sistemas se escribieron o borraron.
 */
export function copyOverrides(
  fromDevice: string,
  toDevice: string,
  personaIds?: string[],
  systems?: Sistema[],
): number {
  if (!fromDevice || !toDevice || fromDevice === toDevice) return 0;
  const map = readAll();
  const src = map[fromDevice] ?? {};
  const dst = { ...(map[toDevice] ?? {}) };
  const sistemas = (systems && systems.length ? systems : SISTEMAS).filter((s) => SISTEMAS.includes(s));
  if (!sistemas.length) return 0;

  const personas = personaIds && personaIds.length
    ? personaIds
    : Array.from(new Set([...Object.keys(src), ...Object.keys(dst)]));

  let touched = 0;
  for (const personaId of personas) {
    if (!personaId) continue;
    const from = src[personaId];
    const next: PersonaNeuronOverrides = { ...(dst[personaId] ?? {}) };
    for (const s of sistemas) {
      const val = from?.[s];
      const had = next[s] !== undefined;
      if (val === undefined || isEmpty(val)) {
        if (had) { delete next[s]; touched++; }
        continue;
      }
      (next as Record<string, unknown>)[s] = JSON.parse(JSON.stringify(val)) as unknown;
      touched++;
    }
    if (isEmpty(next)) delete dst[personaId];
    else dst[personaId] = next;
  }

  if (isEmpty(dst)) delete map[toDevice];
  else map[toDevice] = dst;
  writeAll(map);
  return touched;
}

/* ═══════════════ Diff legible «qué cambia» (función PURA) ═══════════════ */

/** Una diferencia entre dos snapshots del mismo device, ya en español. */
export interface OverrideDiff {
  personaId: string;
  system: Sistema;
  /** Valor legible ANTES ("automático" si no había ajuste propio). */
  antes: string;
  /** Valor legible DESPUÉS. */
  despues: string;
}

const SI_NO = (v: boolean | undefined, si: string, no: string): string | null =>
  v === undefined ? null : v ? si : no;

/** Describe un sistema con una frase corta (sin ajuste propio ⇒ «automático»). */
function describeSystem(system: Sistema, value: unknown): string {
  if (value === undefined || value === null || isEmpty(value)) return "automático";
  const v = value as Record<string, unknown>;
  const parts: string[] = [];
  try {
    if (system === "llm") {
      if (typeof v.fuente === "string" && v.fuente) parts.push(`fuente ${v.fuente}`);
      if (typeof v.modelo === "string" && v.modelo) parts.push(`modelo ${v.modelo}`);
    } else if (system === "astraura") {
      if (typeof v.modo === "string") parts.push(`modo ${v.modo}`);
      const pago = SI_NO(v.permitirPago as boolean | undefined, "permite pago", "sin pago");
      if (pago) parts.push(pago);
    } else if (system === "voz") {
      if (typeof v.motor === "string" && v.motor) parts.push(`motor ${v.motor}`);
      if (typeof v.modo === "string" && v.modo) parts.push(`vía ${v.modo}`);
    } else if (system === "cerebro") {
      const mem = SI_NO(v.usarMemorias as boolean | undefined, "con memorias", "sin memorias");
      if (mem) parts.push(mem);
      if (typeof v.nivelContexto === "string") parts.push(`contexto ${v.nivelContexto}`);
      const cer = v.cerebrosPermitidos;
      if (cer === "todos") parts.push("todos los cerebros");
      else if (Array.isArray(cer)) parts.push(`${cer.length} cerebro(s)`);
      if (typeof v.almacen === "string") parts.push(`almacén ${v.almacen}`);
    } else {
      const porAntena = (v.porAntena ?? {}) as Record<string, AntennaRule>;
      const ids = Object.keys(porAntena);
      if (!ids.length) return "automático";
      const cerradas = ids.filter((id) => porAntena[id]?.enabled === false);
      parts.push(`${ids.length} antena(s) con regla propia`);
      if (cerradas.length) parts.push(`${cerradas.length} apagada(s)`);
    }
  } catch { /* nunca lanza */ }
  return parts.length ? parts.join(" · ") : "ajuste propio";
}

/**
 * Compara dos snapshots CRUDOS del mismo device (`getRawDevice`) y devuelve las
 * diferencias en español. Pura: no lee ni escribe almacenamiento.
 */
export function diffOverrides(
  before: Record<string, PersonaNeuronOverrides> | null | undefined,
  after: Record<string, PersonaNeuronOverrides> | null | undefined,
): OverrideDiff[] {
  const out: OverrideDiff[] = [];
  const a = before ?? {};
  const b = after ?? {};
  const personas = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  for (const personaId of personas) {
    for (const system of SISTEMAS) {
      const prev = a[personaId]?.[system];
      const next = b[personaId]?.[system];
      let igual = false;
      try { igual = JSON.stringify(prev ?? null) === JSON.stringify(next ?? null); } catch { igual = prev === next; }
      if (igual) continue;
      out.push({
        personaId,
        system,
        antes: describeSystem(system, prev),
        despues: describeSystem(system, next),
      });
    }
  }
  return out;
}

/* ═══════════════ Export / Import en JSON (§2.3) ═══════════════ */

export const NEURON_PERSONA_FILE_TYPE = "starseed.neuron-persona-systems";

/** Serializa TODA la configuración de sistemas de una neurona (archivo portable). */
export function exportNeuronPersonaJson(deviceId: string): string {
  const personas = getRawDevice(deviceId);
  return JSON.stringify(
    {
      $tipo: NEURON_PERSONA_FILE_TYPE,
      $version: 1,
      deviceId,
      exportadoEn: new Date().toISOString(),
      personas,
    },
    null,
    2,
  );
}

export interface NeuronPersonaImportResult {
  ok: boolean;
  error?: string;
  /** Personalidades importadas. */
  personas?: number;
  /** Sistemas importados (suma de claves de todas las personalidades). */
  sistemas?: number;
  /** Hallazgos de seguridad detectados en el archivo (informativo). */
  hallazgos?: number;
  /** Datos críticos redactados antes de guardar. */
  redactados?: number;
  /** Aviso en español si hubo hallazgos. */
  aviso?: string;
}

const MODO_ASTRAURA = new Set(["auto", "fija"]);
const MODO_VOZ = new Set(["cloud", "local", "fastweb"]);
const ALMACEN = new Set(["auto", "local", "servidor"]);
const NIVEL = new Set(["breve", "completo"]);
const RUTAS = new Set<AntennaRouteMode>(["auto", "privada", "mesh", "servidor"]);

/** Id/valor de texto aceptable: corto y sin caracteres de control. */
function safeId(v: unknown, max = 120): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > max) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(s)) return undefined;
  return s;
}

/** VALIDACIÓN ESTRICTA: solo sobrevive lo que el modelo de datos admite. */
function sanitizeOverrides(input: unknown): PersonaNeuronOverrides {
  const out: PersonaNeuronOverrides = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  const o = input as Record<string, unknown>;

  const llm = o.llm as Record<string, unknown> | undefined;
  if (llm && typeof llm === "object") {
    const fuente = safeId(llm.fuente);
    const modelo = safeId(llm.modelo, 200);
    const v: NonNullable<PersonaNeuronOverrides["llm"]> = {};
    if (fuente) v.fuente = fuente;
    if (modelo) v.modelo = modelo;
    if (!isEmpty(v)) out.llm = v;
  }

  const ast = o.astraura as Record<string, unknown> | undefined;
  if (ast && typeof ast === "object") {
    const v: NonNullable<PersonaNeuronOverrides["astraura"]> = {};
    if (typeof ast.modo === "string" && MODO_ASTRAURA.has(ast.modo)) v.modo = ast.modo as "auto" | "fija";
    if (typeof ast.permitirPago === "boolean") v.permitirPago = ast.permitirPago;
    if (!isEmpty(v)) out.astraura = v;
  }

  const voz = o.voz as Record<string, unknown> | undefined;
  if (voz && typeof voz === "object") {
    const v: NonNullable<PersonaNeuronOverrides["voz"]> = {};
    const motor = safeId(voz.motor, 60);
    if (motor) v.motor = motor;
    if (typeof voz.modo === "string" && MODO_VOZ.has(voz.modo)) v.modo = voz.modo as "cloud" | "local" | "fastweb";
    if (!isEmpty(v)) out.voz = v;
  }

  const cer = o.cerebro as Record<string, unknown> | undefined;
  if (cer && typeof cer === "object") {
    const v: NonNullable<PersonaNeuronOverrides["cerebro"]> = {};
    if (typeof cer.almacen === "string" && ALMACEN.has(cer.almacen)) v.almacen = cer.almacen as "auto" | "local" | "servidor";
    if (typeof cer.usarMemorias === "boolean") v.usarMemorias = cer.usarMemorias;
    if (typeof cer.nivelContexto === "string" && NIVEL.has(cer.nivelContexto)) v.nivelContexto = cer.nivelContexto as "breve" | "completo";
    const cp = cer.cerebrosPermitidos;
    if (cp === "todos") v.cerebrosPermitidos = "todos";
    else if (Array.isArray(cp)) {
      const ids = cp.map((x) => safeId(x)).filter((x): x is string => !!x).slice(0, 200);
      if (ids.length) v.cerebrosPermitidos = ids;
    }
    if (!isEmpty(v)) out.cerebro = v;
  }

  const sen = o.senales as Record<string, unknown> | undefined;
  const porAntenaIn = sen && typeof sen === "object" ? (sen.porAntena as Record<string, unknown> | undefined) : undefined;
  if (porAntenaIn && typeof porAntenaIn === "object" && !Array.isArray(porAntenaIn)) {
    const porAntena: Record<string, AntennaRule> = {};
    for (const [rawId, rawRule] of Object.entries(porAntenaIn).slice(0, 50)) {
      const id = safeId(rawId, 40);
      if (!id || !rawRule || typeof rawRule !== "object") continue;
      const r = rawRule as Record<string, unknown>;
      const rule: AntennaRule = {};
      if (typeof r.enabled === "boolean") rule.enabled = r.enabled;
      if (typeof r.entrada === "boolean") rule.entrada = r.entrada;
      if (typeof r.salida === "boolean") rule.salida = r.salida;
      if (typeof r.ruta === "string" && RUTAS.has(r.ruta as AntennaRouteMode)) rule.ruta = r.ruta as AntennaRouteMode;
      if (!isEmpty(rule)) porAntena[id] = rule;
    }
    if (!isEmpty(porAntena)) out.senales = { porAntena };
  }

  return out;
}

/**
 * Importa un archivo de configuración de sistemas a una neurona.
 * Por defecto REEMPLAZA la configuración de esa neurona (`merge:true` la
 * fusiona personalidad a personalidad). Valida estrictamente el esquema y
 * escanea el archivo (`scanDeep`/`redactDeep`) antes de guardar: un JSON
 * manipulado con secretos jamás llega a `localStorage`.
 */
export function importNeuronPersonaJson(
  json: string,
  deviceId: string,
  opts?: { merge?: boolean },
): NeuronPersonaImportResult {
  if (!deviceId) return { ok: false, error: "No hay neurona de destino." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "El archivo no es un JSON válido." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "El JSON no tiene forma de configuración de sistemas." };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.$tipo === "string" && o.$tipo !== NEURON_PERSONA_FILE_TYPE) {
    return { ok: false, error: "Ese archivo es de otro tipo (no es configuración de sistemas de una neurona)." };
  }
  const personasIn = o.personas ?? o.overrides;
  if (!personasIn || typeof personasIn !== "object" || Array.isArray(personasIn)) {
    return { ok: false, error: "Falta el bloque de personalidades («personas»)." };
  }

  // ── Escaneo de seguridad (nunca bloquea; los críticos se redactan) ──
  let payload: unknown = personasIn;
  let hallazgos = 0;
  let redactados = 0;
  let aviso: string | undefined;
  try {
    const findings = scanDeep(personasIn);
    hallazgos = findings.length;
    if (hallazgos) {
      const r = redactDeep(personasIn, { minSeverity: "critical" });
      redactados = r.redactedCount;
      payload = r.value;
      aviso = redactados > 0
        ? `Se redactaron ${redactados} dato(s) crítico(s) del archivo importado. ${summarize(findings).message}`
        : `El archivo contiene datos sensibles (no críticos): ${summarize(findings).message}`;
    }
  } catch { /* el escaneo jamás rompe la importación */ }

  const limpio: Record<string, PersonaNeuronOverrides> = {};
  let sistemas = 0;
  for (const [rawId, value] of Object.entries(payload as Record<string, unknown>).slice(0, 500)) {
    const personaId = safeId(rawId);
    if (!personaId) continue;
    const ov = sanitizeOverrides(value);
    if (isEmpty(ov)) continue;
    limpio[personaId] = ov;
    sistemas += Object.keys(ov).length;
  }
  const personas = Object.keys(limpio).length;
  if (!personas) return { ok: false, error: "El archivo no traía ningún ajuste válido.", hallazgos, redactados, aviso };

  if (opts?.merge) {
    for (const [personaId, ov] of Object.entries(limpio)) {
      saveOverrides(deviceId, personaId, ov);
    }
  } else {
    replaceDeviceOverrides(deviceId, limpio);
  }
  return { ok: true, personas, sistemas, hallazgos, redactados, aviso };
}
