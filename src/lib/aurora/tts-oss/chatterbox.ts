"use client";

/**
 * chatterbox.ts — CLIENTE DE CHATTERBOX (Resemble AI, MIT) para la voz de Astraura · VZR1011B.
 * ============================================================================
 * Contrato: `architecture/astraura-voces-y-robots.md` §1–§3 y `aurora-voz-motores.md`.
 * Motor `chatterbox` del registro (`engine-registry.ts`): en la cadena AUTO va
 * detrás del híbrido OmniVoice (y de OpenVoice V2, que va pegado a él) y antes
 * de Kokoro.
 *
 * Orden de intento en cada locución, sin silencios:
 *   1) SERVICIO LOCAL de esta neurona (VZR1011A, `native/astraura-voice/chatterbox/`):
 *      `GET /salud` y `POST /generar` en 127.0.0.1:4505. Si devuelve audio de
 *      verdad (no el modo simulado, que contesta sin audio), habla él.
 *   2) SPACES PÚBLICOS de Hugging Face, descubiertos con su API pública como hace
 *      `openvoice-discovery.ts`: se sondea el contrato REAL de cada Space
 *      (`/config` + `/gradio_api/info`) y los parámetros se mapean POR NOMBRE.
 *      Se llaman desde el NAVEGADOR de cada persona: la cuota (ZeroGPU) es la
 *      suya; aquí no hay ninguna clave.
 *   Salud por endpoint: el que falla se aparta 6 h (el servicio local, 10 min),
 *   el que funcionó en las últimas 24 h va delante y, entre ellos, manda la
 *   LATENCIA MEDIDA en esta neurona (también se anota en `medidas-voz.ts`).
 *
 * Contrato sondeado en vivo el 2026-10-24 con la API pública de HF:
 *   · ResembleAI/Chatterbox-Multilingual-TTS — Gradio 5.29, `/generate_tts_audio`
 *     [text_input, language_id (23 idiomas, «es» incluido), audio_prompt_path_input,
 *     exaggeration_input, temperature_input, seed_num_input, cfgw_input]; ≤ 300 caracteres.
 *   · ResembleAI/Chatterbox — Gradio 6.3, `/generate_tts_audio`, solo inglés
 *     [text_input, audio_prompt_path_input, exaggeration_input, temperature_input,
 *     seed_num_input, cfgw_input, vad_trim_input].
 *   Los dos corren en ZeroGPU: llamados desde un centro de datos devolvieron
 *   `event: error` (sin cuota anónima allí); desde el navegador de una persona
 *   gastan la cuota de esa persona. Por eso un fallo aparta, no rompe.
 *
 * Reglas: emociones por EXAGERACIÓN (el dial continuo de Chatterbox); la misma
 * semilla por personalidad (misma voz en todos los trozos de un mensaje); todo lo
 * que genera lleva la marca de agua Perth de Resemble AI (no se quita ni se
 * intenta); y aquí NO se clona a nadie: la referencia va siempre vacía (voz por
 * defecto del modelo). Clonar una voz solo entra por la puerta con
 * consentimiento explícito (`src/lib/voces/clonacion.ts`). Nunca descarga pesos.
 * Red, disco y reloj inyectables (`ChatterboxDeps`). Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";
import { spaceIdToHost } from "@/lib/aurora/tts-oss/openvoice-discovery";
import type { AuroraVoiceEmotion } from "@/lib/aurora/tts-oss/voice-config";

// ── Constantes ───────────────────────────────────────────────────────────────

/** Servicio local de VZR1011A (puerto libre del rango del demonio de voz). */
export const CHATTERBOX_LOCAL_BASE = "http://127.0.0.1:4505";
/** Límite de texto de los Spaces oficiales («max chars 300»). */
export const CHATTERBOX_MAX_TEXTO_SPACE = 300;
/** Tiempo que se aparta un Space que falla. */
export const CHATTERBOX_APARTAR_MS = 6 * 60 * 60_000;
const LOCAL_APARTAR_MS = 10 * 60_000;
const SNAPSHOT_TTL_MS = 12 * 60 * 60_000;
const RECIENTE_MS = 24 * 60 * 60_000;
const SONDA_MS = 9_000;
const SALUD_LOCAL_MS = 2_500;
const SALUD_LOCAL_CACHE_MS = 60_000;
const MAX_SONDEOS = 8;
const MAX_INTENTOS_SPACE = 3;
const PRESUPUESTO_MS = 60_000;
const GANADOR_MS = 3 * 60_000;
const LS_SNAPSHOT = "starseed.aurora.chatterbox.discovery.v1";
const LS_SALUD = "starseed.aurora.chatterbox.health.v1";
/** Id del servicio local dentro de la memoria de salud. */
export const CHATTERBOX_ID_LOCAL = "local";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ChatterboxFamilia = "multilingue" | "ingles";
type ValorFijo = string | number | boolean | null;

export interface ChatterboxSpace {
  /** «owner/space» de Hugging Face. */
  id: string;
  /** https://<sub>.hf.space, sin barra final. */
  base: string;
  familia: ChatterboxFamilia;
  /** Versión mayor de Gradio (≥ 5: `/gradio_api/call`). */
  gradio: number;
  /** api_name sin barra («generate_tts_audio»). */
  fn: string;
  /** `parameter_name` en el ORDEN real del contrato. */
  parametros: string[];
  /** Valores por defecto primitivos de los parámetros que no decidimos aquí. */
  fijos: Record<string, ValorFijo>;
  /** Códigos de idioma que acepta («es», «en»…). */
  idiomas: string[];
  origen: "integrado" | "descubierto";
  likes?: number;
}

export interface ChatterboxSnapshot {
  at: number;
  spaces: ChatterboxSpace[];
}

interface SaludEntrada {
  badUntil?: number;
  lastOkAt?: number;
  /** Latencia del primer audio medida aquí (media móvil, ms). */
  latenciaMs?: number;
}
type SaludMapa = Record<string, SaludEntrada>;

export interface ChatterboxDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  ahora: () => number;
  leer: (clave: string) => string | null;
  escribir: (clave: string, valor: string) => void;
  /** Gradio 5/6 en dos pasos (por defecto `callGradioSpace`). */
  llamarGradio: (
    base: string,
    fn: string,
    data: unknown[],
    opts: { signal?: AbortSignal; budgetMs?: number },
  ) => Promise<unknown[] | null>;
  /** Primer audio de la salida de un Space (por defecto `firstAudioFromGradio`). */
  audioDeSalida: (out: unknown[] | null, base: string, signal: AbortSignal) => Promise<Blob | null>;
  /** Anota la medida en las medidas de voz de la neurona (por defecto `medidas-voz.ts`). */
  anotar: (tipo: "primer-sonido" | "tiempo-real-voz", valor: number) => void;
}

export interface PeticionChatterbox {
  texto: string;
  idioma: string;
  exageracion: number;
  cfg: number;
  semilla: number;
}

export interface OpcionesChatterbox {
  /** Idioma del texto («es», «es-ES», «en»…). */
  idioma?: string;
  /** Emoción efectiva de la voz (catálogo de `voice-style.ts`). */
  emocion?: string;
  /** Energía 0..100 del estilo. */
  energia?: number;
  /** Personalidad que habla (fija la semilla: misma voz en cada trozo). */
  personalityId?: string;
  signal?: AbortSignal;
  /** Tope total de la locución, en ms. */
  presupuestoMs?: number;
}

export interface ResultadoChatterbox {
  blob: Blob | null;
  via: "local" | "space" | null;
  endpoint?: string;
  latenciaMs?: number;
  factorTiempoReal?: number;
  motivo?: "texto-vacio" | "texto-largo" | "sin-spaces" | "fallo" | "cancelado";
}

export type EstadoChatterbox = "listo" | "nuevo" | "dormido" | "fuera";

// ── Spaces integrados (contrato sondeado el 2026-10-24) ─────────────────────

const IDIOMAS_MTL = [
  "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja",
  "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
];

export const CHATTERBOX_SPACES_INTEGRADOS: ChatterboxSpace[] = [
  {
    id: "ResembleAI/Chatterbox-Multilingual-TTS",
    base: "https://resembleai-chatterbox-multilingual-tts.hf.space",
    familia: "multilingue",
    gradio: 5,
    fn: "generate_tts_audio",
    parametros: [
      "text_input", "language_id", "audio_prompt_path_input", "exaggeration_input",
      "temperature_input", "seed_num_input", "cfgw_input",
    ],
    fijos: { temperature_input: 0.8 },
    idiomas: IDIOMAS_MTL,
    origen: "integrado",
  },
  {
    id: "ResembleAI/Chatterbox",
    base: "https://resembleai-chatterbox.hf.space",
    familia: "ingles",
    gradio: 6,
    fn: "generate_tts_audio",
    parametros: [
      "text_input", "audio_prompt_path_input", "exaggeration_input", "temperature_input",
      "seed_num_input", "cfgw_input", "vad_trim_input",
    ],
    fijos: { temperature_input: 0.8, vad_trim_input: false },
    idiomas: ["en"],
    origen: "integrado",
  },
];

// ── Dependencias por defecto (navegador real) ───────────────────────────────

function depsPorDefecto(): ChatterboxDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    ahora: () => Date.now(),
    leer: (k) => safeGet(k),
    escribir: (k, v) => {
      safeSet(k, v);
    },
    llamarGradio: async (base, fn, data, opts) => {
      const { callGradioSpace } = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
      return callGradioSpace(base, fn, data, opts);
    },
    audioDeSalida: async (out, base, signal) => {
      const { firstAudioFromGradio } = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
      return firstAudioFromGradio(out, base, signal);
    },
    anotar: (tipo, valor) => {
      void import("@/lib/aurora/medidas-voz")
        .then((m) => m.anotarMedida({ motor: "chatterbox", tipo, valor }))
        .catch(() => null);
    },
  };
}

function conDeps(p?: Partial<ChatterboxDeps>): ChatterboxDeps {
  return { ...depsPorDefecto(), ...(p || {}) };
}

// ── Piezas puras ─────────────────────────────────────────────────────────────

type Rol = "texto" | "idioma" | "referencia" | "exageracion" | "cfg" | "semilla" | "otro";

/** Papel de un parámetro del contrato según su nombre real. */
export function rolParametro(nombre: string): Rol {
  const n = nombre.toLowerCase();
  if (n.includes("exaggeration")) return "exageracion";
  if (/^cfg/.test(n)) return "cfg";
  if (n.includes("seed")) return "semilla";
  if (/^lang|language/.test(n)) return "idioma";
  if (/audio_prompt|reference|ref_audio/.test(n)) return "referencia";
  if (n.includes("text")) return "texto";
  return "otro";
}

/** «es-ES» → «es». Sin idioma, español. */
export function idiomaChatterbox(lang?: string): string {
  const base = String(lang ?? "").toLowerCase().split(/[-_]/)[0].trim();
  return base || "es";
}

const EXAGERACION_POR_EMOCION: Record<AuroraVoiceEmotion, number> = {
  serena: 0.35,
  seria: 0.4,
  dulce: 0.45,
  misteriosa: 0.45,
  empatica: 0.5,
  alegre: 0.65,
  juguetona: 0.7,
  entusiasta: 0.8,
};

/**
 * Emoción → dial de EXAGERACIÓN de Chatterbox (0,5 = neutra). La energía del
 * estilo lo mueve ±0,1. Se acota a [0,25, 0,9]: el propio Space avisa de que los
 * extremos son inestables. Con exageración alta baja el CFG a 0,3 (consejo del
 * README de Chatterbox: compensa la prisa que trae la exageración).
 */
export function exageracionPara(emocion?: string, energia?: number): { exageracion: number; cfg: number } {
  let x = 0.5;
  if (emocion && Object.prototype.hasOwnProperty.call(EXAGERACION_POR_EMOCION, emocion)) {
    x = EXAGERACION_POR_EMOCION[emocion as AuroraVoiceEmotion];
  }
  if (typeof energia === "number" && Number.isFinite(energia)) {
    x += ((Math.max(0, Math.min(100, energia)) - 50) / 50) * 0.1;
  }
  x = Math.round(Math.max(0.25, Math.min(0.9, x)) * 100) / 100;
  return { exageracion: x, cfg: x >= 0.65 ? 0.3 : 0.5 };
}

/** Semilla estable por personalidad (≠ 0: en los Spaces, 0 es «al azar»). */
export function semillaEstable(personalityId?: string): number {
  const s = personalityId || "astraura";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h % 2_000_000_000) + 1;
}

function idiomasDeLiteral(t: string): string[] {
  const out: string[] = [];
  const re = /'([a-z]{2,3})'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

interface ParamInfo {
  parameter_name?: string;
  component?: string;
  python_type?: { type?: string };
  parameter_default?: unknown;
}
interface InfoGradio {
  named_endpoints?: Record<string, { parameters?: ParamInfo[] }>;
}

/**
 * Clasifica el contrato de UN Space a partir de su `/config` (versión) y su
 * `/gradio_api/info`. Reconoce cualquier función con texto + exageración; si
 * además tiene parámetro de idioma es multilingüe, si no, inglés. Pura.
 */
export function clasificarContratoChatterbox(
  id: string,
  base: string,
  version: unknown,
  info: unknown,
): ChatterboxSpace | null {
  const major = Number(String(version ?? "").split(".")[0]);
  if (!Number.isFinite(major) || major < 5) return null; // `/gradio_api/call` nace en Gradio 5
  const named = (info as InfoGradio | null)?.named_endpoints;
  if (!named || typeof named !== "object") return null;
  const apis = Object.keys(named).sort(
    (a, b) => Number(b === "/generate_tts_audio") - Number(a === "/generate_tts_audio"),
  );
  for (const api of apis) {
    const ps = named[api]?.parameters;
    if (!Array.isArray(ps) || ps.length < 2) continue;
    const nombres = ps.map((p) => String(p?.parameter_name ?? ""));
    if (nombres.some((n) => !n)) continue;
    const hayTexto = ps.some(
      (p) => rolParametro(String(p.parameter_name)) === "texto" && /textbox/i.test(String(p.component ?? "")),
    );
    if (!hayTexto || !nombres.some((n) => rolParametro(n) === "exageracion")) continue;
    const pIdioma = ps.find((p) => rolParametro(String(p.parameter_name)) === "idioma");
    const idiomas = pIdioma ? idiomasDeLiteral(String(pIdioma.python_type?.type ?? "")) : ["en"];
    if (!idiomas.length) continue;
    const fijos: Record<string, ValorFijo> = {};
    for (const p of ps) {
      const n = String(p.parameter_name);
      if (rolParametro(n) !== "otro") continue;
      const d = p.parameter_default;
      fijos[n] = typeof d === "string" || typeof d === "number" || typeof d === "boolean" ? d : null;
    }
    return {
      id,
      base,
      familia: pIdioma ? "multilingue" : "ingles",
      gradio: major,
      fn: api.replace(/^\/+/, ""),
      parametros: nombres,
      fijos,
      idiomas,
      origen: "descubierto",
    };
  }
  return null;
}

/** Datos en el orden del contrato. La referencia de voz va SIEMPRE vacía. Pura. */
export function construirDatosChatterbox(space: ChatterboxSpace, p: PeticionChatterbox): unknown[] {
  return space.parametros.map((n) => {
    switch (rolParametro(n)) {
      case "texto":
        return p.texto;
      case "idioma":
        return p.idioma;
      case "referencia":
        return null; // voz por defecto del modelo: aquí no se clona a nadie
      case "exageracion":
        return p.exageracion;
      case "cfg":
        return p.cfg;
      case "semilla":
        return p.semilla;
      default:
        return Object.prototype.hasOwnProperty.call(space.fijos, n) ? space.fijos[n] : null;
    }
  });
}

// ── Memoria (snapshot + salud) ───────────────────────────────────────────────

function leerJson<T>(d: ChatterboxDeps, clave: string): T | null {
  try {
    const raw = d.leer(clave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function escribirJson(d: ChatterboxDeps, clave: string, valor: unknown): void {
  try {
    d.escribir(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: seguimos en memoria de la llamada */
  }
}

function leerSnapshot(d: ChatterboxDeps): ChatterboxSnapshot | null {
  const s = leerJson<ChatterboxSnapshot>(d, LS_SNAPSHOT);
  return s && Array.isArray(s.spaces) ? s : null;
}

function leerSalud(d: ChatterboxDeps): SaludMapa {
  const h = leerJson<SaludMapa>(d, LS_SALUD);
  return h && typeof h === "object" ? h : {};
}

/** Los integrados siempre, más lo descubierto (sin repetir). */
function spacesConocidos(d: ChatterboxDeps): ChatterboxSpace[] {
  const snap = leerSnapshot(d);
  const out = [...CHATTERBOX_SPACES_INTEGRADOS];
  for (const s of snap?.spaces ?? []) if (!out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

/** Anota el resultado REAL de una síntesis: un fallo aparta, un éxito rehabilita. */
export function marcarResultadoChatterbox(
  id: string,
  ok: boolean,
  latenciaMs?: number,
  deps?: Partial<ChatterboxDeps>,
): void {
  const d = conDeps(deps);
  const h = leerSalud(d);
  const t = d.ahora();
  if (ok) {
    const previa = h[id]?.latenciaMs;
    const medida = typeof latenciaMs === "number" && latenciaMs >= 0 ? latenciaMs : undefined;
    const lat =
      medida === undefined ? previa : typeof previa === "number" ? previa * 0.6 + medida * 0.4 : medida;
    h[id] = { lastOkAt: t, latenciaMs: typeof lat === "number" ? Math.round(lat) : undefined };
  } else {
    const ms = id === CHATTERBOX_ID_LOCAL ? LOCAL_APARTAR_MS : CHATTERBOX_APARTAR_MS;
    h[id] = { ...(h[id] || {}), badUntil: t + ms };
  }
  escribirJson(d, LS_SALUD, h);
}

/** ¿Está este endpoint apartado por un fallo reciente? */
export function chatterboxApartado(id: string, deps?: Partial<ChatterboxDeps>): boolean {
  const d = conDeps(deps);
  const e = leerSalud(d)[id];
  return !!(e?.badUntil && e.badUntil > d.ahora());
}

/**
 * Spaces a intentar AHORA para ese idioma (sin red): fuera los apartados; delante
 * los que funcionaron en las últimas 24 h; entre iguales, la latencia medida aquí,
 * luego el modelo propio del idioma, los integrados y los más valorados.
 */
export function ordenarSpacesChatterbox(idioma: string, deps?: Partial<ChatterboxDeps>): ChatterboxSpace[] {
  const d = conDeps(deps);
  const h = leerSalud(d);
  const t = d.ahora();
  const reciente = (s: ChatterboxSpace) => {
    const ok = h[s.id]?.lastOkAt;
    return typeof ok === "number" && t - ok < RECIENTE_MS ? 1 : 0;
  };
  const latencia = (s: ChatterboxSpace) => h[s.id]?.latenciaMs ?? Number.POSITIVE_INFINITY;
  const diferencia = (a: number, b: number) => (a === b ? 0 : a - b);
  // En inglés, el modelo original (familia «ingles») antes que el multilingüe.
  const afinidad = (s: ChatterboxSpace) => Number(idioma === "en" && s.familia === "ingles");
  return spacesConocidos(d)
    .filter((s) => s.idiomas.includes(idioma) && !((h[s.id]?.badUntil ?? 0) > t))
    .sort(
      (a, b) =>
        reciente(b) - reciente(a) ||
        diferencia(latencia(a), latencia(b)) ||
        afinidad(b) - afinidad(a) ||
        Number(b.origen === "integrado") - Number(a.origen === "integrado") ||
        (b.likes ?? 0) - (a.likes ?? 0),
    );
}

/**
 * Estado SÍNCRONO para la cadena de voz y la UI (solo memoria, sin red):
 *   listo   — algo habló de verdad en las últimas 24 h y no está apartado;
 *   nuevo   — nunca se probó en este navegador;
 *   fuera   — todo apartado (Spaces 6 h y el servicio local 10 min): la cadena
 *             lo salta sin gastar ni un milisegundo;
 *   dormido — el resto.
 */
export function estadoChatterbox(deps?: Partial<ChatterboxDeps>): EstadoChatterbox {
  const d = conDeps(deps);
  const h = leerSalud(d);
  const t = d.ahora();
  const ids = [CHATTERBOX_ID_LOCAL, ...spacesConocidos(d).map((s) => s.id)];
  const apartado = (id: string) => (h[id]?.badUntil ?? 0) > t;
  if (ids.some((id) => !apartado(id) && typeof h[id]?.lastOkAt === "number" && t - (h[id].lastOkAt as number) < RECIENTE_MS)) {
    return "listo";
  }
  if (!ids.some((id) => h[id])) return "nuevo";
  return ids.every(apartado) ? "fuera" : "dormido";
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** Latencia medida en ESTA neurona, legible («medida aquí: local 1,2 s · Space 6,8 s»). */
export function latenciaMedidaChatterbox(deps?: Partial<ChatterboxDeps>): string | null {
  const d = conDeps(deps);
  const h = leerSalud(d);
  const partes: string[] = [];
  const local = h[CHATTERBOX_ID_LOCAL]?.latenciaMs;
  if (typeof local === "number") partes.push(`local ${segundos(local)}`);
  const spaces = spacesConocidos(d)
    .map((s) => h[s.id]?.latenciaMs)
    .filter((v): v is number => typeof v === "number");
  if (spaces.length) partes.push(`Space ${segundos(Math.min(...spaces))}`);
  return partes.length ? `medida aquí: ${partes.join(" · ")}` : null;
}

// ── Red ──────────────────────────────────────────────────────────────────────

async function pedir(
  d: ChatterboxDeps,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const cortar = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal?.aborted) return null;
  signal?.addEventListener("abort", cortar, { once: true });
  const reloj = setTimeout(cortar, timeoutMs);
  try {
    return await d.fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
    signal?.removeEventListener("abort", cortar);
  }
}

async function pedirJson(d: ChatterboxDeps, url: string, signal?: AbortSignal, timeoutMs = SONDA_MS): Promise<unknown> {
  const r = await pedir(d, url, { method: "GET" }, timeoutMs, signal);
  if (!r || !r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Sondea UN Space (`/config` + `/gradio_api/info`) y lo clasifica. */
export async function sondearSpaceChatterbox(
  id: string,
  signal?: AbortSignal,
  deps?: Partial<ChatterboxDeps>,
): Promise<ChatterboxSpace | null> {
  const d = conDeps(deps);
  const base = `https://${spaceIdToHost(id)}.hf.space`;
  const cfg = (await pedirJson(d, `${base}/config`, signal)) as { version?: unknown } | null;
  if (!cfg?.version) return null;
  const info = await pedirJson(d, `${base}/gradio_api/info`, signal);
  return info ? clasificarContratoChatterbox(id, base, cfg.version, info) : null;
}

/**
 * Busca Spaces de Chatterbox con la API pública de HF y sondea su contrato real.
 * Caché de 12 h; sin respuesta de HF no guarda nada (se reintenta la próxima vez).
 */
export async function descubrirSpacesChatterbox(
  opts: { force?: boolean; signal?: AbortSignal } = {},
  deps?: Partial<ChatterboxDeps>,
): Promise<ChatterboxSnapshot> {
  const d = conDeps(deps);
  const cache = leerSnapshot(d);
  if (!opts.force && cache && d.ahora() - cache.at < SNAPSHOT_TTL_MS) return cache;
  const encontrados = new Map<string, number>();
  let respondio = false;
  for (const q of ["chatterbox", "Chatterbox-Multilingual-TTS"]) {
    const lista = await pedirJson(d, `https://huggingface.co/api/spaces?search=${encodeURIComponent(q)}&limit=60`, opts.signal);
    if (!Array.isArray(lista)) continue;
    respondio = true;
    for (const s of lista as { id?: unknown; likes?: unknown; sdk?: unknown; private?: unknown }[]) {
      if (typeof s?.id === "string" && s.sdk === "gradio" && s.private !== true) {
        encontrados.set(s.id, typeof s.likes === "number" ? s.likes : 0);
      }
    }
  }
  if (!respondio) return cache ?? { at: 0, spaces: [...CHATTERBOX_SPACES_INTEGRADOS] };
  const integrados = new Set(CHATTERBOX_SPACES_INTEGRADOS.map((s) => s.id));
  const aSondear = [...encontrados.entries()]
    .filter(([id]) => !integrados.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SONDEOS);
  const descubiertos: ChatterboxSpace[] = [];
  for (const [id, likes] of aSondear) {
    if (opts.signal?.aborted) break;
    const sp = await sondearSpaceChatterbox(id, opts.signal, d).catch(() => null);
    if (sp) descubiertos.push({ ...sp, likes });
  }
  const snap: ChatterboxSnapshot = { at: d.ahora(), spaces: [...CHATTERBOX_SPACES_INTEGRADOS, ...descubiertos] };
  escribirJson(d, LS_SNAPSHOT, snap);
  return snap;
}

let descubriendo = false;
function refrescarEnSegundoPlano(d: ChatterboxDeps): void {
  const snap = leerSnapshot(d);
  if (descubriendo || (snap && d.ahora() - snap.at < SNAPSHOT_TTL_MS)) return;
  descubriendo = true;
  void descubrirSpacesChatterbox({ force: true }, d)
    .catch(() => null)
    .finally(() => {
      descubriendo = false;
    });
}

// ── Servicio local (VZR1011A) ────────────────────────────────────────────────

let saludLocalMemo: { at: number; ok: boolean } | null = null;

/** ¿Responde el servicio local? Caché de 60 s; un fallo lo aparta 10 min. */
export async function saludLocalChatterbox(signal?: AbortSignal, deps?: Partial<ChatterboxDeps>): Promise<boolean> {
  const d = conDeps(deps);
  const t = d.ahora();
  if (chatterboxApartado(CHATTERBOX_ID_LOCAL, d)) return false;
  if (saludLocalMemo && t - saludLocalMemo.at < SALUD_LOCAL_CACHE_MS) return saludLocalMemo.ok;
  const j = (await pedirJson(d, `${CHATTERBOX_LOCAL_BASE}/salud`, signal, SALUD_LOCAL_MS)) as {
    dispositivo?: unknown;
  } | null;
  const ok = typeof j?.dispositivo === "string";
  saludLocalMemo = { at: t, ok };
  if (!ok && !signal?.aborted) marcarResultadoChatterbox(CHATTERBOX_ID_LOCAL, false, undefined, d);
  return ok;
}

function base64ABytes(b64: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** El servicio local devuelve WAV (RIFF) en base64; el simulado, sin audio. */
async function sintetizarLocal(
  d: ChatterboxDeps,
  p: PeticionChatterbox,
  presupuestoMs: number,
  signal?: AbortSignal,
): Promise<{ blob: Blob; rtf?: number } | null> {
  const r = await pedir(
    d,
    `${CHATTERBOX_LOCAL_BASE}/generar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: p.texto, idioma: p.idioma, exageracion: p.exageracion, cfg_weight: p.cfg }),
    },
    presupuestoMs,
    signal,
  );
  if (!r || !r.ok) return null;
  try {
    const j = (await r.json()) as { audio_base64?: unknown; factor_tiempo_real?: unknown } | null;
    if (!j || typeof j.audio_base64 !== "string" || !j.audio_base64) return null;
    const bytes = base64ABytes(j.audio_base64);
    if (!bytes || bytes.length < 44 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF") {
      return null;
    }
    const rtf = typeof j.factor_tiempo_real === "number" && j.factor_tiempo_real > 0 ? j.factor_tiempo_real : undefined;
    return { blob: new Blob([bytes], { type: "audio/wav" }), rtf };
  } catch {
    return null;
  }
}

// ── Síntesis ─────────────────────────────────────────────────────────────────

/** Último endpoint que habló: los trozos del mismo mensaje siguen por él. */
let ganador: { id: string; at: number } | null = null;

/**
 * Sintetiza con Chatterbox: servicio local primero y, si no hay, Spaces públicos.
 * Devuelve el audio y por dónde salió, o el motivo honesto si no hubo voz.
 */
export async function sintetizarChatterbox(
  texto: string,
  opts: OpcionesChatterbox = {},
  deps?: Partial<ChatterboxDeps>,
): Promise<ResultadoChatterbox> {
  const d = conDeps(deps);
  const cancelado: ResultadoChatterbox = { blob: null, via: null, motivo: "cancelado" };
  try {
    const limpio = (texto || "").trim();
    if (!limpio) return { blob: null, via: null, motivo: "texto-vacio" };
    const idioma = idiomaChatterbox(opts.idioma);
    const { exageracion, cfg } = exageracionPara(opts.emocion, opts.energia);
    const peticion: PeticionChatterbox = {
      texto: limpio,
      idioma,
      exageracion,
      cfg,
      semilla: semillaEstable(opts.personalityId),
    };
    const presupuesto = opts.presupuestoMs && opts.presupuestoMs > 0 ? opts.presupuestoMs : PRESUPUESTO_MS;
    const limite = d.ahora() + presupuesto;

    // 1) Servicio local de la neurona.
    const t0 = d.ahora();
    if (await saludLocalChatterbox(opts.signal, d)) {
      const r = await sintetizarLocal(d, peticion, presupuesto, opts.signal);
      if (r) {
        const lat = d.ahora() - t0;
        marcarResultadoChatterbox(CHATTERBOX_ID_LOCAL, true, lat, d);
        d.anotar("primer-sonido", lat);
        if (r.rtf) d.anotar("tiempo-real-voz", r.rtf);
        ganador = { id: CHATTERBOX_ID_LOCAL, at: d.ahora() };
        return { blob: r.blob, via: "local", endpoint: CHATTERBOX_ID_LOCAL, latenciaMs: lat, factorTiempoReal: r.rtf };
      }
      if (opts.signal?.aborted) return cancelado;
      marcarResultadoChatterbox(CHATTERBOX_ID_LOCAL, false, undefined, d);
      saludLocalMemo = null;
    }

    // 2) Spaces públicos, con la cuota del navegador de esta persona.
    if (limpio.length > CHATTERBOX_MAX_TEXTO_SPACE) return { blob: null, via: null, motivo: "texto-largo" };
    refrescarEnSegundoPlano(d);
    let orden = ordenarSpacesChatterbox(idioma, d);
    if (ganador && d.ahora() - ganador.at < GANADOR_MS) {
      const g = ganador.id;
      orden = [...orden.filter((s) => s.id === g), ...orden.filter((s) => s.id !== g)];
    }
    if (!orden.length) return { blob: null, via: null, motivo: "sin-spaces" };
    for (const sp of orden.slice(0, MAX_INTENTOS_SPACE)) {
      const restante = limite - d.ahora();
      if (restante < 1_500) break;
      if (opts.signal?.aborted) return cancelado;
      const t1 = d.ahora();
      const out = await d.llamarGradio(sp.base, sp.fn, construirDatosChatterbox(sp, peticion), {
        signal: opts.signal,
        budgetMs: restante,
      });
      const blob = out ? await d.audioDeSalida(out, sp.base, opts.signal ?? new AbortController().signal) : null;
      if (blob) {
        const lat = d.ahora() - t1;
        marcarResultadoChatterbox(sp.id, true, lat, d);
        d.anotar("primer-sonido", lat);
        ganador = { id: sp.id, at: d.ahora() };
        return { blob, via: "space", endpoint: sp.id, latenciaMs: lat };
      }
      if (opts.signal?.aborted) return cancelado;
      marcarResultadoChatterbox(sp.id, false, undefined, d);
    }
    return { blob: null, via: null, motivo: "fallo" };
  } catch {
    return { blob: null, via: null, motivo: "fallo" };
  }
}

/** Solo pruebas: olvida la memoria de proceso (salud local y ganador). */
export function _reiniciarChatterboxParaPruebas(): void {
  saludLocalMemo = null;
  ganador = null;
  descubriendo = false;
}
