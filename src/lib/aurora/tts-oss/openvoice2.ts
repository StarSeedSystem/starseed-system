"use client";

/**
 * StarSeed OS — CLIENTE OPENVOICE V2 (web, SIN instalar nada) — V2-VOZ.
 * ============================================================================
 * Habla por el Space público de MyShell **OpenVoiceV2** (Gradio 3.48.0 con COLA):
 *   host directo  →  https://myshell-ai-openvoicev2.hf.space
 *
 * Sin daemon, sin endpoint, sin descargas: es una voz de NUBE gratis que funciona
 * en cualquier navegador. Se integra en la cadena de motores JUSTO detrás del
 * híbrido OmniVoice: [omnivoice-híbrido → openvoice2 → kokoro → navegador]. Como
 * todo eslabón, es una MEJORA: si el Space falla, devolvemos null y la cadena
 * sigue — **Aurora SIEMPRE habla**. NUNCA lanza.
 *
 * ── CONTRATO (sondeado EN VIVO, 2026-07-20) ─────────────────────────────────
 * GET /info → unnamed_endpoints["1"] (fn_index=1):
 *   inputs  = [0 Text Prompt (str), 1 Style (str, enum), 2 Reference Audio
 *              (Audio, str|null), 3 Agree (bool)]
 *   outputs = [0 Info (str), 1 Synthesised Audio (Audio), 2 Reference Audio Used]
 * Estilos EXACTOS: en_default · en_us · en_br · en_au · en_in · es_default ·
 *   fr_default · jp_default · zh_default · kr_default.
 * Protocolo de cola (Gradio 3.x) por WebSocket wss://…/queue/join:
 *   {send_hash} → enviamos {fn_index,session_hash}
 *   {estimation}/{process_starts}
 *   {send_data} → enviamos {data:[texto,estilo,referencia,true],fn_index,session_hash}
 *   {process_completed, output:{data:[info, audio, ...]}, success}
 * Audio de salida = archivo del servidor → GET …/file=<name> (encodeURI).
 * SUBIR referencia = POST /upload (multipart "files") → ["/tmp/…wav"]; se pasa
 *   como {name:"<ruta>", data:null, is_file:true}.
 *
 * ── LA REFERENCIA ES OBLIGATORIA ────────────────────────────────────────────
 * Verificado en vivo: con referencia null el Space responde success=false. Por
 * eso, para las voces insignia generamos una SEMILLA SINTÉTICA de identidad (una
 * vez, cacheada) con el Space de OmniVoice ya integrado — timbre INSPIRADO en el
 * arquetipo (edad/energía/acento/carácter), NUNCA audio real de nadie — y la
 * subimos aquí por sesión. La clonación con audio REAL queda solo para muestras
 * que suba el propio usuario (`refBlob`). Sin semilla ni referencia, este motor
 * declina y la cadena sigue.
 *
 * SSR-safe: importarlo es barato (cero red al importar). Autoactualización: re-
 * sondea GET /info cada 7 días; si el contrato cambia, degrada con aviso por
 * consola y la cadena continúa.
 */

import {
  buildDesignData,
  callGradioSpace,
  mapLangToSpace,
  OMNI_DESIGN_FN,
  OMNI_SPACE_BASE,
} from "@/lib/aurora/tts-oss/omnivoice-hybrid";
import {
  DEFAULT_ASTRAURA_VOICE,
  type AstrauraDesignAttributes,
  type AstrauraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";
import {
  ensureDiscoveryFresh,
  getOpenVoiceDiscoveryInfo,
  isOpenVoiceEndpointBad,
  markOpenVoiceEndpointResult,
  orderedOpenVoiceEndpoints,
  OPENVOICE_V1_EMOTIONS,
  type OpenVoiceEndpoint,
} from "@/lib/aurora/tts-oss/openvoice-discovery";
import { getLastUserVoiceEmotion } from "@/lib/aurora/audio-emotion";

// ── Constantes del Space ─────────────────────────────────────────────────────

/** Host directo del Space OpenVoiceV2 (para la UI y las peticiones). */
export const OPENVOICE2_SPACE = "https://myshell-ai-openvoicev2.hf.space";
/** URL del WebSocket de la cola (Gradio 3.x). */
const OPENVOICE2_WS = "wss://myshell-ai-openvoicev2.hf.space/queue/join";
/** Índice de función del contrato (fn_index=1). */
export const OPENVOICE2_FN_INDEX = 1;

/** Estilos EXACTOS que acepta el Style (dropdown) del Space. */
export const OPENVOICE2_STYLES = [
  "en_default",
  "en_us",
  "en_br",
  "en_au",
  "en_in",
  "es_default",
  "fr_default",
  "jp_default",
  "zh_default",
  "kr_default",
] as const;
export type OpenVoice2Style = (typeof OPENVOICE2_STYLES)[number];

/** Etiquetas legibles (español) para el selector de la UI. */
export const OPENVOICE2_STYLE_LABELS: Record<OpenVoice2Style, string> = {
  en_default: "Inglés · base",
  en_us: "Inglés · EE. UU.",
  en_br: "Inglés · británico",
  en_au: "Inglés · australiano",
  en_in: "Inglés · indio",
  es_default: "Español",
  fr_default: "Francés",
  jp_default: "Japonés",
  zh_default: "Chino",
  kr_default: "Coreano",
};

// ── Presupuestos de tiempo ───────────────────────────────────────────────────

const JOIN_TIMEOUT_MS = 10_000;
const QUEUE_TIMEOUT_FIRST_MS = 120_000; // 1ª vez (cold start del Space)
const QUEUE_TIMEOUT_WARM_MS = 60_000; // ya calentito
const UPLOAD_TIMEOUT_MS = 20_000;
const INFO_TIMEOUT_MS = 8_000;

// ── Caché del contrato (autoactualización cada 7 días) ───────────────────────

const CONTRACT_KEY = "starseed.openvoice2.contract.v1";
const CONTRACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Versión de NUESTRAS expectativas (súbela si cambiamos el contrato esperado). */
const CONTRACT_VERSION = 1;

// ── Semillas sintéticas de identidad ─────────────────────────────────────────

const SEED_KEY_PREFIX = "starseed.openvoice2.seed.";
/** Versión de las semillas (súbela para regenerar todas). */
export const OPENVOICE2_SEED_VERSION = 1;
/** Frase por defecto para diseñar una semilla (timbre, no contenido). */
const DEFAULT_SEED_TEXT =
  "Hello, this is my voice. I am here with you, ready to help, calm and clear.";

/** Id de personaje de una semilla. */
export type OpenVoice2SeedKind = "aurora" | "hermione" | string;

/** Atributos de una semilla (INSPIRADOS en el arquetipo, 100% sintéticos). */
export interface OpenVoice2SeedSpec {
  attrs: AstrauraDesignAttributes;
  instruct: string;
  lang: string;
  text: string;
}

/**
 * Semillas curadas de las voces insignia. Timbres INSPIRADOS en el arquetipo del
 * personaje (edad/energía/acento/carácter), generados por nuestros propios
 * motores — jamás audio real de ninguna actriz.
 *   · Hermione (arquetipo brillante/rápida/precisa, acento británico): mujer
 *     joven, tono agudo, dicción rápida y articulada con calidez juguetona.
 *   · Aurora (arquetipo juvenil/cálida/sincera/determinada, US neutro): mujer
 *     joven, tono medio, voz suave pero decidida.
 */
export const OPENVOICE2_SEED_SPECS: Record<"aurora" | "hermione", OpenVoice2SeedSpec> = {
  hermione: {
    attrs: {
      gender: "Female / 女",
      age: "Young Adult / 青年",
      pitch: "High Pitch / 高音调",
      style: "Auto",
      accent: "British Accent / 英国口音",
    },
    instruct:
      "voz femenina joven, dicción rápida, precisa y muy articulada, con calidez mandona y juguetona",
    lang: "en",
    text: "Right then — let us think clearly and move quickly. I am absolutely certain we can do this.",
  },
  aurora: {
    attrs: {
      gender: "Female / 女",
      age: "Young Adult / 青年",
      pitch: "Moderate Pitch / 中音调",
      style: "Auto",
      accent: "American Accent / 美式口音",
    },
    instruct:
      "voz femenina joven, cálida, sincera y determinada, suave pero decidida, con brillo cercano",
    lang: "en",
    text: "Hi, I am Aurora. I am right here with you — warm, steady, and ready whenever you are.",
  },
};

// ── Estado para la UI ────────────────────────────────────────────────────────

/** Estado del motor OpenVoice V2 para pintar chips honestos. */
export type OpenVoice2State = "listo" | "dormido" | "fuera";
let lastState: OpenVoice2State = "dormido";
/** Última expedición de resurrección con todos los endpoints apartados. */
let lastResurrectionAt = 0;
const RESURRECTION_EVERY_MS = 10 * 60_000;
/** Última vez que el Space respondió algo (para saber si está "calentito"). */
let warmedUp = false;

/** Estado actual del motor ('listo' | 'dormido' | 'fuera'). Para la UI. */
export function getOpenVoice2State(): OpenVoice2State {
  // La MEMORIA DE SALUD del descubrimiento manda: si algún endpoint OpenVoice
  // sintetizó con éxito en las últimas 24 h (aunque esta pestaña sea nueva),
  // el motor está LISTO — así la cadena lo antepone y la voz nueva SUENA.
  try {
    const info = getOpenVoiceDiscoveryInfo();
    if (info.endpoints.some((e) => !isOpenVoiceEndpointBad(e.id) && endpointKnownGood(e.id))) {
      return "listo";
    }
    if (info.healthy === 0) return "fuera";
  } catch {
    /* caemos al estado vivo */
  }
  return lastState;
}

/** ¿Este endpoint tuvo un éxito real reciente (<24 h)? Sin red. */
function endpointKnownGood(id: string): boolean {
  try {
    const raw = safeLS()?.getItem("starseed.aurora.openvoice.health.v1");
    if (!raw) return false;
    const h = JSON.parse(raw) as Record<string, { lastOkAt?: number }>;
    const ok = h?.[id]?.lastOkAt;
    return !!(ok && Date.now() - ok < 24 * 60 * 60_000);
  } catch {
    return false;
  }
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────

function safeLS(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function randHash(): string {
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  );
}

/** ¿Estos bytes parecen audio (WAV/MP3/OGG/FLAC)? */
function looksLikeAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const s = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (s === "RIFF" || s === "OggS" || s === "fLaC" || s.startsWith("ID3")) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // frame MP3/AAC
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((ab) => {
    const buf = new Uint8Array(ab);
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...Array.from(buf.subarray(i, i + CHUNK)));
    }
    return btoa(bin);
  });
}

function base64ToBlob(b64: string, type = "audio/wav"): Blob | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

// ── Mapeo de estilo (PURO — testeable sin red) ───────────────────────────────

/** Estilo base por idioma. Nunca lanza. */
export function styleForLang(lang: string | undefined): OpenVoice2Style {
  const base = (lang || "es").trim().toLowerCase().slice(0, 2);
  switch (base) {
    case "es":
      return "es_default";
    case "en":
      return "en_us";
    case "fr":
      return "fr_default";
    case "ja":
    case "jp":
      return "jp_default";
    case "zh":
      return "zh_default";
    case "ko":
    case "kr":
      return "kr_default";
    default:
      return "en_default";
  }
}

/** Estilos por personalidad conocida (arquetipo → acento base). */
const KNOWN_PERSONALITY_STYLE: Record<string, OpenVoice2Style> = {
  // Hermione (arquetipo británico) → inglés británico.
  "c9fe7030-fc68-49c6-a705-58f7900887f9": "en_br",
  "preset-hermione": "en_br",
};

/**
 * Resuelve el Style EXACTO del Space a partir de una pista, el idioma y/o la
 * personalidad. `styleHint` gana si es un estilo válido; luego la personalidad
 * (Hermione → en_br); si no, el idioma. Nunca lanza. PURO (testeable).
 */
export function resolveOpenVoice2Style(opts: {
  styleHint?: string;
  lang?: string;
  personalityId?: string;
}): OpenVoice2Style {
  const hint = (opts.styleHint || "").trim();
  if ((OPENVOICE2_STYLES as readonly string[]).includes(hint)) return hint as OpenVoice2Style;
  const pid = (opts.personalityId || "").toLowerCase();
  if (pid) {
    if (KNOWN_PERSONALITY_STYLE[pid]) return KNOWN_PERSONALITY_STYLE[pid];
    if (pid.includes("hermione") || pid.includes("hermayone")) return "en_br";
  }
  return styleForLang(opts.lang);
}

/** ¿Qué semilla curada corresponde a esta personalidad? (o custom / null). */
export function seedKindFor(personalityId: string | undefined): OpenVoice2SeedKind | null {
  const pid = (personalityId || "").toLowerCase();
  if (!pid) return null;
  if (
    pid.includes("hermione") ||
    pid.includes("hermayone") ||
    pid === "c9fe7030-fc68-49c6-a705-58f7900887f9"
  ) {
    return "hermione";
  }
  if (pid.includes("aurora")) return "aurora";
  return null;
}

// ── Parser de mensajes de la cola (PURO — testeable con fixtures) ────────────

export type QueueMessage =
  | { kind: "send_hash" }
  | { kind: "send_data" }
  | { kind: "estimation"; rank: number | null; eta: number | null }
  | { kind: "process_starts" }
  | { kind: "process_completed"; success: boolean; output: unknown }
  | { kind: "progress" }
  | { kind: "heartbeat" }
  | { kind: "queue_full" }
  | { kind: "unknown"; msg: string };

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Parsea un mensaje del WebSocket de la cola a una forma tipada. Acepta string
 * (JSON) u objeto. Nunca lanza. PURO — se testea con fixtures sin red.
 */
export function parseQueueMessage(raw: unknown): QueueMessage {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { kind: "unknown", msg: "" };
    }
  }
  if (!obj || typeof obj !== "object") return { kind: "unknown", msg: "" };
  const o = obj as Record<string, unknown>;
  const msg = typeof o.msg === "string" ? o.msg : "";
  switch (msg) {
    case "send_hash":
      return { kind: "send_hash" };
    case "send_data":
      return { kind: "send_data" };
    case "estimation":
      return { kind: "estimation", rank: numOrNull(o.rank), eta: numOrNull(o.rank_eta) };
    case "process_starts":
      return { kind: "process_starts" };
    case "process_completed":
      return { kind: "process_completed", success: o.success === true, output: o.output ?? null };
    case "progress":
      return { kind: "progress" };
    case "heartbeat":
      return { kind: "heartbeat" };
    case "queue_full":
      return { kind: "queue_full" };
    default:
      return { kind: "unknown", msg };
  }
}

// ── Validación del contrato (PURO — testeable con fixtures) ──────────────────

/**
 * ¿El contrato del Space sigue siendo el que esperamos? Espera fn_index=1 con 4
 * parámetros cuyas etiquetas encajan (Text/Style/Reference/Agree). Ante forma
 * desconocida NO rechaza (optimista: no queremos degradar por un /info raro).
 * Devuelve false SOLO si detecta positivamente un contrato DISTINTO. Nunca lanza.
 */
export function validateOpenVoice2Contract(info: unknown): boolean {
  try {
    if (!info || typeof info !== "object") return true;
    const root = info as Record<string, unknown>;
    const unnamed = root.unnamed_endpoints as Record<string, unknown> | undefined;
    const named = root.named_endpoints as Record<string, unknown> | undefined;
    const ep =
      (unnamed && (unnamed[String(OPENVOICE2_FN_INDEX)] as Record<string, unknown>)) ||
      (named && (named["/predict"] as Record<string, unknown>)) ||
      null;
    if (!ep) return true; // no vemos el endpoint → no rechazamos
    const params = ep.parameters;
    if (!Array.isArray(params)) return true;
    if (params.length !== 4) return false; // nº de inputs distinto = contrato cambió
    const labels = params.map((p) =>
      String((p as Record<string, unknown>)?.label || "").toLowerCase(),
    );
    const has = (i: number, ...needles: string[]) =>
      needles.some((n) => labels[i]?.includes(n));
    // Orden esperado: [Text Prompt, Style, Reference Audio, Agree].
    const okStyle = has(1, "style");
    const okRef = has(2, "reference", "audio");
    const okAgree = has(3, "agree");
    return okStyle && okRef && okAgree;
  } catch {
    return true;
  }
}

interface ContractCache {
  version: number;
  at: number;
  ok: boolean;
}

function readContractCache(): ContractCache | null {
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CONTRACT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ContractCache;
    if (typeof p?.at === "number" && typeof p?.version === "number") return p;
    return null;
  } catch {
    return null;
  }
}

function persistContract(c: ContractCache): void {
  const ls = safeLS();
  if (!ls) return;
  try {
    ls.setItem(CONTRACT_KEY, JSON.stringify(c));
  } catch {
    /* cuota / modo privado → seguimos */
  }
}

/**
 * Asegura que el contrato está fresco (< 7 días). Re-sondea GET /info si toca.
 * Devuelve `true` si el contrato es válido (o desconocido/inalcanzable →
 * optimista) y `false` SOLO si detectó un contrato CAMBIADO. Nunca lanza.
 */
async function ensureContractFresh(signal?: AbortSignal): Promise<boolean> {
  const now = Date.now();
  const cached = readContractCache();
  if (cached && cached.version === CONTRACT_VERSION && now - cached.at < CONTRACT_TTL_MS) {
    return cached.ok !== false;
  }
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return true;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, INFO_TIMEOUT_MS);
  try {
    const r = await fetch(`${OPENVOICE2_SPACE}/info`, { method: "GET", signal: ctrl.signal });
    if (!r.ok) return true; // /info caído → no bloqueamos la síntesis por eso
    const info = await r.json().catch(() => null);
    if (!info) return true;
    const ok = validateOpenVoice2Contract(info);
    persistContract({ version: CONTRACT_VERSION, at: now, ok });
    if (!ok) {
      try {
        // eslint-disable-next-line no-console
        console.warn(
          "[openvoice2] El contrato del Space OpenVoiceV2 cambió; degradando este motor. La cadena de voz sigue (Aurora nunca calla).",
        );
      } catch {
        /* */
      }
    }
    return ok;
  } catch {
    return true; // inalcanzable → optimista
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ── Subida de la referencia + caché por sesión ───────────────────────────────

/** FileData que el Space entiende para un archivo ya subido a su /tmp. */
interface GradioFileRef {
  name: string;
  data: null;
  is_file: true;
}

/** Rutas /tmp ya subidas en ESTA sesión (el Space borra /tmp al reiniciar). */
const sessionRefPaths = new Map<string, string>();

/** Sube un Blob de audio a /upload del Space indicado y devuelve su ruta /tmp (o null). */
async function uploadReference(blob: Blob, base: string, signal?: AbortSignal): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, UPLOAD_TIMEOUT_MS);
  try {
    const fd = new FormData();
    fd.append("files", blob, "reference.wav");
    const res = await fetch(`${base}/upload`, {
      method: "POST",
      body: fd,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const arr = await res.json().catch(() => null);
    return Array.isArray(arr) && typeof arr[0] === "string" ? arr[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ── Generación / caché de semillas ───────────────────────────────────────────

function seedCacheKey(cacheId: string, version: number): string {
  return `${SEED_KEY_PREFIX}${cacheId}.v${version}`;
}

function readSeedBlob(cacheId: string, version: number): Blob | null {
  const ls = safeLS();
  if (!ls) return null;
  try {
    const b64 = ls.getItem(seedCacheKey(cacheId, version));
    return b64 ? base64ToBlob(b64) : null;
  } catch {
    return null;
  }
}

async function writeSeedBlob(cacheId: string, version: number, blob: Blob): Promise<void> {
  const ls = safeLS();
  if (!ls) return;
  try {
    const b64 = await blobToBase64(blob);
    ls.setItem(seedCacheKey(cacheId, version), b64);
  } catch {
    /* cuota / modo privado → la semilla vivirá solo en memoria de sesión */
  }
}

/**
 * Diseña una SEMILLA de voz sintética con el Space de OmniVoice (reutiliza el
 * helper Gradio 5 ya integrado) a partir de atributos INSPIRADOS en el arquetipo.
 * Devuelve un Blob WAV o null. Nunca lanza.
 */
async function designSeedBlob(
  spec: OpenVoice2SeedSpec,
  signal?: AbortSignal,
  onStatus?: (m: string) => void,
): Promise<Blob | null> {
  try {
    const cfg: AstrauraVoiceConfig = {
      ...DEFAULT_ASTRAURA_VOICE,
      generation_mode: "voice_design",
      voice_design_attributes: spec.attrs,
      instruct: spec.instruct,
    };
    const langName = mapLangToSpace(spec.lang);
    const data = buildDesignData(spec.text || DEFAULT_SEED_TEXT, cfg, langName);
    try {
      onStatus?.("creando la semilla de identidad de la voz…");
    } catch {
      /* */
    }
    // CARRERA local ↔ nube (Adenda 79-bis): el daemon nativo (si está vivo en
    // 127.0.0.1:4444) y el Space de OmniVoice diseñan la semilla EN PARALELO y
    // gana la primera que llegue — en un equipo con motor local la identidad
    // nace en segundos aunque la nube esté degradada, y sin motor local la
    // nube sigue cubriendo. Ambas son 100 % sintéticas.
    const cloud = (async (): Promise<Blob | null> => {
      const out = await callGradioSpace(OMNI_SPACE_BASE, OMNI_DESIGN_FN, data, {
        signal,
        budgetMs: QUEUE_TIMEOUT_FIRST_MS,
        onStatus,
      });
      if (!out) return null;
      for (const item of out) {
        const blob = await gradioItemToBlob(item, OMNI_SPACE_BASE, signal);
        if (blob) return blob;
      }
      return null;
    })().catch(() => null);
    const local = designSeedViaLocalDaemon(spec, signal, onStatus).catch(() => null);

    const first = await Promise.race([
      local.then((b) => (b ? { who: "local" as const, b } : null)),
      cloud.then((b) => (b ? { who: "nube" as const, b } : null)),
    ]).catch(() => null);
    if (first?.b) return first.b;
    // La ganadora de la carrera fue null → espera a la otra (sin perder nada).
    const [l, c] = await Promise.all([local, cloud]);
    return l || c || null;
  } catch {
    return null;
  }
}

/** Semilla vía daemon nativo local (POST /tts). Nunca lanza; null si no hay daemon. */
async function designSeedViaLocalDaemon(
  spec: OpenVoice2SeedSpec,
  signal?: AbortSignal,
  onStatus?: (m: string) => void,
): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, 45_000);
  try {
    try {
      onStatus?.("creando la semilla con el motor local…");
    } catch {
      /* */
    }
    const res = await fetch("http://127.0.0.1:4444/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spec.text || DEFAULT_SEED_TEXT, lang: spec.lang || "es" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!looksLikeAudio(buf)) return null;
    return new Blob([buf], { type: "audio/wav" });
  } catch {
    return null;
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** Resuelve un FileData de Gradio (url/path/name) a un Blob de audio. */
async function gradioItemToBlob(
  item: unknown,
  base: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  if (!item || typeof item !== "object") return null;
  const it = item as { url?: unknown; path?: unknown; name?: unknown; data?: unknown };
  const b = base.replace(/\/+$/, "");
  const candidates: string[] = [];
  const url = typeof it.url === "string" ? it.url : "";
  const path = typeof it.path === "string" ? it.path : "";
  const name = typeof it.name === "string" ? it.name : "";
  if (typeof it.data === "string" && it.data.length > 128) {
    const viaB64 = base64ToBlob(it.data.replace(/^data:[^;]+;base64,/, ""));
    if (viaB64) return viaB64;
  }
  if (url) candidates.push(/^https?:\/\//i.test(url) ? url : `${b}${url.startsWith("/") ? "" : "/"}${url}`);
  for (const p of [path, name]) {
    if (!p) continue;
    if (/^https?:\/\//i.test(p)) {
      candidates.push(p);
      continue;
    }
    candidates.push(`${b}/gradio_api/file=${encodeURI(p)}`);
    candidates.push(`${b}/file=${encodeURI(p)}`);
  }
  for (const c of candidates) {
    const blob = await fetchAudioBlob(c, signal);
    if (blob) return blob;
  }
  return null;
}

async function fetchAudioBlob(url: string, signal?: AbortSignal): Promise<Blob | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { method: "GET", signal });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!looksLikeAudio(buf)) return null;
    const type = (res.headers.get("content-type") || "audio/wav").split(";")[0];
    return new Blob([buf], { type });
  } catch {
    return null;
  }
}

// ── Resolución de la referencia (semilla / subida del usuario) ───────────────

interface ReferenceOptions {
  personalityId?: string;
  refBlob?: Blob | null;
  refPathCache?: string;
  useSeed?: boolean;
  seedVersion?: number;
  seedAttrs?: OpenVoice2SeedSpec;
  lang?: string;
  signal?: AbortSignal;
  onStatus?: (m: string) => void;
  forceReupload?: boolean;
  /** Base del Space DESTINO (cada endpoint tiene su /tmp propio). */
  base?: string;
}

function seedSpecFor(
  kind: OpenVoice2SeedKind | null,
  opts: ReferenceOptions,
): { spec: OpenVoice2SeedSpec; cacheId: string } | null {
  if (kind === "hermione" || kind === "aurora") {
    return { spec: OPENVOICE2_SEED_SPECS[kind], cacheId: kind };
  }
  // Cualquier otra personalidad con atributos de semilla explícitos → custom.
  if (opts.seedAttrs) {
    const pid = (opts.personalityId || "custom").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
    return {
      spec: {
        attrs: opts.seedAttrs.attrs,
        instruct: opts.seedAttrs.instruct || "",
        lang: opts.seedAttrs.lang || opts.lang || "es",
        text: opts.seedAttrs.text || DEFAULT_SEED_TEXT,
      },
      cacheId: `custom_${pid}`,
    };
  }
  return null;
}

/**
 * Obtiene (o crea y cachea) la SEMILLA de una personalidad y devuelve su ruta
 * /tmp ya subida al Space (cacheada por sesión). Nunca lanza; null si no se pudo.
 */
async function getOrCreateSeedRefPath(
  kind: OpenVoice2SeedKind | null,
  opts: ReferenceOptions,
): Promise<string | null> {
  const resolved = seedSpecFor(kind, opts);
  if (!resolved) return null;
  const version = opts.seedVersion ?? OPENVOICE2_SEED_VERSION;
  const base = opts.base || OPENVOICE2_SPACE;
  const sessionKey = `${base}::seed:${resolved.cacheId}:v${version}`;

  if (!opts.forceReupload) {
    const cachedPath = sessionRefPaths.get(sessionKey);
    if (cachedPath) return cachedPath;
  }

  // Blob de la semilla: caché (base64) → si no, diseñar con OmniVoice.
  let seed = readSeedBlob(resolved.cacheId, version);
  if (!seed) {
    seed = await designSeedBlob(resolved.spec, opts.signal, opts.onStatus);
    if (seed) await writeSeedBlob(resolved.cacheId, version, seed);
  }
  if (!seed) return null;

  const path = await uploadReference(seed, base, opts.signal);
  if (path) sessionRefPaths.set(sessionKey, path);
  return path;
}

/** Resuelve la referencia a pasar al Space (o null si no hay ninguna usable). */
async function resolveReference(opts: ReferenceOptions): Promise<GradioFileRef | null> {
  // 1) Ruta ya subida (reutilización best-effort entre llamadas).
  if (!opts.forceReupload && opts.refPathCache) {
    return { name: opts.refPathCache, data: null, is_file: true };
  }
  // 2) Muestra REAL subida por el usuario (clonación permitida solo aquí).
  if (opts.refBlob) {
    const key = `${opts.base || OPENVOICE2_SPACE}::user:current`;
    if (!opts.forceReupload) {
      const cached = sessionRefPaths.get(key);
      if (cached) return { name: cached, data: null, is_file: true };
    }
    const path = await uploadReference(opts.refBlob, opts.base || OPENVOICE2_SPACE, opts.signal);
    if (path) {
      sessionRefPaths.set(key, path);
      return { name: path, data: null, is_file: true };
    }
    return null;
  }
  // 3) Semilla sintética de identidad (por defecto para las voces insignia).
  if (opts.useSeed !== false) {
    const kind = seedKindFor(opts.personalityId);
    const path = await getOrCreateSeedRefPath(kind, opts);
    if (path) return { name: path, data: null, is_file: true };
  }
  // 4) Sin referencia usable → el motor declinará (la cadena sigue).
  return null;
}

/** Invalida las rutas subidas (el Space limpió /tmp) para forzar re-subida. */
function invalidateSessionRefs(): void {
  sessionRefPaths.clear();
}

// ── Protocolo de cola por WebSocket (a mano, sin dependencias) ────────────────

type QueueReason = "ok" | "space-error" | "timeout" | "ws" | "no-audio";
interface QueueResult {
  ok: boolean;
  blob?: Blob | null;
  reason: QueueReason;
  completed: boolean;
}

function runQueue(
  text: string,
  style: OpenVoice2Style,
  reference: GradioFileRef | null,
  opts: {
    signal?: AbortSignal;
    onStatus?: (m: string) => void;
    budgetMs: number;
    /** Endpoint destino (base + fn_index). Por defecto, el Space oficial. */
    base?: string;
    fnIndex?: number;
  },
): Promise<QueueResult> {
  return new Promise<QueueResult>((resolve) => {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") {
      resolve({ ok: false, reason: "ws", completed: false });
      return;
    }
    const session_hash = randHash();
    let ws: WebSocket | null = null;
    let settled = false;
    let joined = false;
    let completed = false;

    const cleanup = () => {
      clearTimeout(joinKiller);
      clearTimeout(totalKiller);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      try {
        ws && ws.close();
      } catch {
        /* */
      }
    };
    const done = (r: QueueResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };
    const onAbort = () => done({ ok: false, reason: "ws", completed });

    const joinKiller = setTimeout(() => {
      if (!joined) done({ ok: false, reason: "timeout", completed });
    }, JOIN_TIMEOUT_MS);
    const totalKiller = setTimeout(() => done({ ok: false, reason: "timeout", completed }), opts.budgetMs);

    if (opts.signal) {
      if (opts.signal.aborted) {
        done({ ok: false, reason: "ws", completed });
        return;
      }
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    const wsBase = (opts.base || OPENVOICE2_SPACE).replace(/^http/i, "ws");
    const fnIndex = opts.fnIndex ?? OPENVOICE2_FN_INDEX;
    try {
      ws = new WebSocket(`${wsBase}/queue/join`);
    } catch {
      done({ ok: false, reason: "ws", completed });
      return;
    }

    ws.onopen = () => {
      joined = true;
      clearTimeout(joinKiller);
    };
    ws.onerror = () => done({ ok: false, reason: "ws", completed });
    ws.onclose = () => {
      if (!settled) done({ ok: false, reason: "ws", completed });
    };
    ws.onmessage = (ev: MessageEvent) => {
      const data = typeof ev.data === "string" ? ev.data : String(ev.data);
      const m = parseQueueMessage(data);
      const socket = ws;
      if (!socket) return;
      switch (m.kind) {
        case "send_hash":
          try {
            socket.send(JSON.stringify({ fn_index: fnIndex, session_hash }));
          } catch {
            /* */
          }
          break;
        case "estimation":
          try {
            opts.onStatus?.("en cola, despertando la voz web…");
          } catch {
            /* */
          }
          break;
        case "process_starts":
          try {
            opts.onStatus?.("dando voz a la respuesta…");
          } catch {
            /* */
          }
          break;
        case "send_data":
          try {
            socket.send(
              JSON.stringify({
                data: [text, style, reference ?? null, true],
                fn_index: fnIndex,
                session_hash,
              }),
            );
          } catch {
            /* */
          }
          break;
        case "queue_full":
          done({ ok: false, reason: "timeout", completed });
          break;
        case "process_completed": {
          completed = true;
          if (!m.success) {
            done({ ok: false, reason: "space-error", completed });
            break;
          }
          void resolveAudioBlob(m.output, opts.signal, opts.base)
            .then((blob) => {
              if (blob) done({ ok: true, blob, reason: "ok", completed });
              else done({ ok: false, reason: "no-audio", completed });
            })
            .catch(() => done({ ok: false, reason: "no-audio", completed }));
          break;
        }
        default:
          break;
      }
    };
  });
}

/** Extrae el Blob de audio del `output.data` del process_completed. Nunca lanza. */
async function resolveAudioBlob(
  output: unknown,
  signal?: AbortSignal,
  base: string = OPENVOICE2_SPACE,
): Promise<Blob | null> {
  try {
    if (!output || typeof output !== "object") return null;
    const data = (output as { data?: unknown }).data;
    if (!Array.isArray(data)) return null;
    // "Synthesised Audio" está en el índice 1; probamos ese primero, luego el resto.
    const order = [1, 2, 0, 3, 4].filter((i) => i < data.length);
    for (const i of order) {
      const d = data[i];
      if (!d) continue;
      if (typeof d === "string" && d) {
        if (/^https?:\/\//i.test(d)) {
          const viaUrl = await fetchAudioBlob(d, signal);
          if (viaUrl) return viaUrl;
        }
        const viaFile = await fetchAudioBlob(`${base}/file=${encodeURI(d)}`, signal);
        if (viaFile) return viaFile;
        continue;
      }
      if (typeof d === "object") {
        const viaItem = await gradioItemToBlob(d, base, signal);
        if (viaItem) return viaItem;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Adaptador V1-PREDICT (Gradio 4 · cola por SSE) — el que HOY funciona ─────

/**
 * Emoción del contrato v1 para esta locución: parte del CARÁCTER de la
 * personalidad (Aurora→friendly, Hermione→cheerful) y la emoción VIVA percibida
 * del usuario la matiza (alegre→cheerful, triste→sad, …). Pura y testeable.
 */
export function emotionStyleFor(opts: {
  personalityId?: string;
  mood?: string;
  styleHint?: string;
  available?: string[];
}): string {
  const avail = opts.available?.length ? opts.available : [...OPENVOICE_V1_EMOTIONS];
  const pick = (want: string, fallback = "default"): string =>
    avail.includes(want) ? want : avail.includes(fallback) ? fallback : avail[0];
  // Una pista explícita del editor manda (si es una emoción del contrato v1).
  if (opts.styleHint && avail.includes(opts.styleHint)) return opts.styleHint;
  const mood = (opts.mood || "").toLowerCase();
  if (mood === "alegre" || mood === "enérgico" || mood === "energico") return pick("cheerful");
  if (mood === "triste") return pick("sad");
  if (mood === "sereno") return pick("default");
  // Tenso → tono empático y calmado (jamás "angry" de vuelta al usuario).
  if (mood === "tenso") return pick("friendly");
  const kind = seedKindFor(opts.personalityId);
  if (kind === "hermione") return pick("cheerful", "friendly");
  if (kind === "aurora") return pick("friendly");
  return pick("default");
}

/** Emoción percibida AHORA del oído emocional (si el sentido está activo). */
function liveUserMood(): string | undefined {
  try {
    const e = getLastUserVoiceEmotion();
    if (e && (e.confidence ?? 0) >= 0.35) return e.mood;
  } catch {
    /* sin oído emocional */
  }
  return undefined;
}

/**
 * Corre la cola de Gradio 4 (POST /queue/join → SSE /queue/data) del contrato
 * v1-predict: data = [texto, emoción, FileData(path), tau]. Nunca lanza.
 */
async function runQueueSSE(
  text: string,
  emotion: string,
  refPath: string,
  endpoint: OpenVoiceEndpoint,
  opts: { signal?: AbortSignal; onStatus?: (m: string) => void; budgetMs: number },
): Promise<QueueResult> {
  if (typeof window === "undefined") return { ok: false, reason: "ws", completed: false };
  const session_hash = randHash();
  const ctrl = new AbortController();
  const onAbort = () => {
    try {
      ctrl.abort();
    } catch {
      /* */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) return { ok: false, reason: "ws", completed: false };
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, opts.budgetMs);
  try {
    const fileData = {
      path: refPath,
      url: `${endpoint.base}/file=${encodeURI(refPath)}`,
      orig_name: "reference.wav",
      meta: { _type: "gradio.FileData" },
    };
    const join = (await fetch(`${endpoint.base}/queue/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [text, emotion, fileData, 0.7],
        fn_index: endpoint.fnIndex,
        session_hash,
        event_data: null,
        trigger_id: null,
      }),
      signal: ctrl.signal,
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { event_id?: string } | null;
    if (!join?.event_id) return { ok: false, reason: "ws", completed: false };

    try {
      opts.onStatus?.("en cola, dando voz a la respuesta…");
    } catch {
      /* */
    }

    const res = await fetch(`${endpoint.base}/queue/data?session_hash=${session_hash}`, {
      signal: ctrl.signal,
    }).catch(() => null);
    if (!res || !res.ok || !res.body) return { ok: false, reason: "ws", completed: false };

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    // Leemos el stream SSE línea a línea hasta process_completed.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        let msg: { msg?: string; success?: boolean; output?: unknown } | null = null;
        try {
          msg = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        if (!msg) continue;
        if (msg.msg === "process_completed") {
          if (!msg.success) return { ok: false, reason: "space-error", completed: true };
          const blob = await resolveAudioBlob(msg.output, opts.signal, endpoint.base);
          return blob
            ? { ok: true, blob, reason: "ok", completed: true }
            : { ok: false, reason: "no-audio", completed: true };
        }
        if (msg.msg === "queue_full") return { ok: false, reason: "timeout", completed: false };
      }
    }
    return { ok: false, reason: "timeout", completed: false };
  } catch {
    return { ok: false, reason: "ws", completed: false };
  } finally {
    clearTimeout(killer);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}

// ── API PRINCIPAL ────────────────────────────────────────────────────────────

export interface OpenVoice2Options {
  /** Pista de estilo (un id de OPENVOICE2_STYLES). Gana sobre idioma/personalidad. */
  styleHint?: string;
  /** Idioma ("es", "en", "es-ES"…). Por defecto español. */
  lang?: string;
  /** Id de la personalidad activa (para semilla/estilo/aprendizaje por voz). */
  personalityId?: string;
  /** Muestra REAL de audio del usuario para CLONAR (única vía de clonación real). */
  refBlob?: Blob | null;
  /** Ruta /tmp ya subida (reutilización best-effort; si 404, se resube). */
  refPathCache?: string;
  /** Usar la semilla sintética de identidad (por defecto true). */
  useSeed?: boolean;
  /** Versión de semilla a usar (por defecto OPENVOICE2_SEED_VERSION). */
  seedVersion?: number;
  /** Atributos de semilla ad-hoc para personalidades sin semilla curada. */
  seedAttrs?: OpenVoice2SeedSpec;
  /**
   * Velocidad deseada (multiplicador). El Space V2 NO expone parámetro de
   * velocidad, así que hoy es informativo (la modulación fina de velocidad la
   * aplica el reproductor). Se mantiene por simetría de API. */
  speed?: number;
  signal?: AbortSignal;
  /** Estado legible en vivo para la UI. */
  onStatus?: (message: string) => void;
}

/**
 * synthesizeOpenVoice2 — sintetiza `text` por el Space OpenVoiceV2 y devuelve el
 * Blob de audio o null. Resuelve el Style, prepara la referencia (semilla
 * sintética o muestra del usuario), corre el protocolo de cola por WebSocket y,
 * ante fallo transitorio o /tmp caducado, reintenta UNA vez. NUNCA lanza.
 * null ⇒ la cadena de voz sigue (Kokoro/navegador): Aurora SIEMPRE habla.
 */
export async function synthesizeOpenVoice2(
  text: string,
  opts: OpenVoice2Options = {},
): Promise<Blob | null> {
  const clean = (text || "").trim();
  if (!clean || typeof window === "undefined") return null;

  // Autoactualización: refresco de DESCUBRIMIENTO en segundo plano (si caducó)
  // + contrato del Space oficial (best-effort; si cambió, ese endpoint degrada
  // pero el bucle multi-endpoint sigue con los demás).
  ensureDiscoveryFresh();
  await ensureContractFresh(opts.signal).catch(() => true);

  const style = resolveOpenVoice2Style({
    styleHint: opts.styleHint,
    lang: opts.lang,
    personalityId: opts.personalityId,
  });

  // BUCLE MULTI-ENDPOINT (Adenda 79): recorre los endpoints descubiertos por
  // salud/orden. Cada uno tiene su propio /tmp → la referencia se sube por
  // endpoint (cacheada por sesión). Un fallo de inferencia aparta el endpoint
  // 6 h y se pasa al siguiente AUTOMÁTICAMENTE. Aurora nunca calla: si todos
  // fallan, devolvemos null y la cadena sigue (Kokoro/navegador).
  let endpoints = orderedOpenVoiceEndpoints().slice(0, 3);
  // CORTAFUEGOS ANTI-ATASCO (Adenda 81): si TODOS los endpoints están apartados
  // por fallos recientes, no gastamos el turno de voz en ellos en cada frase —
  // declinamos AL INSTANTE (la cadena sigue con OmniVoice/Kokoro) y solo cada
  // 10 min dejamos pasar UNA expedición de resurrección para ver si sanaron.
  const allBenched = endpoints.length > 0 && endpoints.every((e) => isOpenVoiceEndpointBad(e.id));
  if (allBenched) {
    const now = Date.now();
    if (now - lastResurrectionAt < RESURRECTION_EVERY_MS) return null;
    lastResurrectionAt = now;
    endpoints = endpoints.slice(0, 1); // una sonda, no tres
  }
  const mood = liveUserMood();

  for (const ep of endpoints) {
    if (opts.signal?.aborted) return null;

    const refOpts: ReferenceOptions = {
      personalityId: opts.personalityId,
      refBlob: opts.refBlob,
      refPathCache: undefined, // la ruta cacheada externa solo vale para el oficial
      useSeed: opts.useSeed,
      seedVersion: opts.seedVersion,
      seedAttrs: opts.seedAttrs,
      lang: opts.lang,
      signal: opts.signal,
      onStatus: opts.onStatus,
      base: ep.base,
    };
    if (ep.base === OPENVOICE2_SPACE && opts.refPathCache) {
      refOpts.refPathCache = opts.refPathCache;
    }

    let reference = await resolveReference(refOpts).catch(() => null);
    if (!reference) continue; // sin referencia usable en este endpoint → siguiente

    let epFailedInference = false;
    let epTimedOut = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      if (opts.signal?.aborted) return null;
      if (!reference) break; // la resubida falló: siguiente endpoint
      const budget = warmedUp ? QUEUE_TIMEOUT_WARM_MS : QUEUE_TIMEOUT_FIRST_MS;

      let res: QueueResult;
      if (ep.kind === "v1-predict") {
        const emotion = emotionStyleFor({
          personalityId: opts.personalityId,
          mood,
          styleHint: opts.styleHint,
          available: ep.emotions,
        });
        res = await runQueueSSE(clean, emotion, reference.name, ep, {
          signal: opts.signal,
          onStatus: opts.onStatus,
          budgetMs: budget,
        }).catch((): QueueResult => ({ ok: false, reason: "ws", completed: false }));
      } else {
        res = await runQueue(clean, style, reference, {
          signal: opts.signal,
          onStatus: opts.onStatus,
          budgetMs: budget,
          base: ep.base,
          fnIndex: ep.fnIndex,
        }).catch((): QueueResult => ({ ok: false, reason: "ws", completed: false }));
      }

      if (res.completed) warmedUp = true;

      if (res.ok && res.blob) {
        lastState = "listo";
        try {
          markOpenVoiceEndpointResult(ep.id, true);
        } catch {
          /* */
        }
        return res.blob;
      }

      // Ruta /tmp caducada (Space reiniciado) → resube UNA vez en este endpoint.
      if (attempt === 0 && res.reason === "no-audio") {
        invalidateSessionRefs();
        reference = await resolveReference({ ...refOpts, forceReupload: true }).catch(() => null);
        if (reference) continue;
      }

      if (res.reason === "space-error") {
        // Inferencia rota en ESTE endpoint (p.ej. cpu-basic): apartarlo y seguir.
        epFailedInference = true;
        break;
      }
      if ((res.reason === "timeout" || res.reason === "ws") && attempt === 0) {
        lastState = "dormido";
        continue; // cold start → un reintento en el mismo endpoint
      }
      if (res.reason === "timeout" || res.reason === "ws") epTimedOut = true;
      break;
    }

    if (epFailedInference || epTimedOut) {
      try {
        // Inferencia rota → 6 h apartado. Solo timeout/red → bad SUAVE (15 min):
        // puede ser un Space dormido despertando; volveremos a darle su turno
        // pronto, pero mientras tanto la cadena no se atasca en él.
        markOpenVoiceEndpointResult(ep.id, false, epFailedInference ? undefined : 15);
      } catch {
        /* */
      }
      try {
        opts.onStatus?.(`«${ep.id}» no respondió; probando la siguiente fuente OpenVoice…`);
      } catch {
        /* */
      }
    }
  }

  if (lastState === "listo") lastState = "dormido";
  return null;
}

/**
 * Pre-calienta el motor (útil al abrir un panel): asegura el contrato y, si hay
 * personalidad con semilla, la prepara. No sintetiza. Devuelve el estado. Nunca
 * lanza.
 */
export async function warmOpenVoice2(personalityId?: string): Promise<OpenVoice2State> {
  try {
    if (typeof window === "undefined") return lastState;
    await ensureContractFresh().catch(() => true);
    const kind = seedKindFor(personalityId);
    if (kind) {
      // No forzamos el diseño aquí (puede ser lento); solo marcamos disponibilidad.
      const cached = readSeedBlob(kind, OPENVOICE2_SEED_VERSION);
      if (cached && lastState === "dormido") lastState = "dormido";
    }
    return lastState;
  } catch {
    return lastState;
  }
}
