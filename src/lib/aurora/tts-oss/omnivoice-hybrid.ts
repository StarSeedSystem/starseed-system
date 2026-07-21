"use client";

/**
 * StarSeed OS — MOTOR DE VOZ HÍBRIDO OMNIVOICE (Adenda 77-voz).
 * ============================================================================
 * OmniVoice (k2-fsa) es la voz por DEFECTO de Aurora, con CERO configuración.
 * Habla por uno de dos caminos, eligiendo SOLO el mejor disponible:
 *
 *   1. DAEMON LOCAL — `http://127.0.0.1:4444` (motor `omnivoice.cpp`, corre en el
 *      Mac del usuario, ver `native/astraura-voice`). Handshake `GET /status`
 *      (cacheado 30 s); si `ready` → `POST /tts` (WAV 24 kHz). Baja latencia y
 *      100% privado.
 *   2. NUBE GRATIS — HF Space `k2-fsa/OmniVoice` (Gradio 5). Diseño de voz
 *      (`/_design_fn`, el modo por defecto) o clonación (`/_clone_fn`). Protocolo
 *      de 2 pasos: POST `…/gradio_api/call/{fn}` → {event_id} → GET SSE → FileData.
 *      Los Spaces despiertan lento: la 1ª llamada puede tardar (onStatus avisa).
 *
 * `synthesizeOmniVoiceHybrid(text, opts)` enruta según `privacy_mode`:
 *   · "hybrid_allow_cloud" (defecto): local si está vivo, si no nube.
 *   · "local_only": solo daemon local (sin daemon → null → la cadena sigue).
 *   · "cloud_only": solo nube.
 * Devuelve `Blob|null`. NULL ⇒ la cadena de voz sigue (Kokoro/navegador): Aurora
 * SIEMPRE habla. NUNCA lanza.
 *
 * La config viaja en `AuroraVoiceConfig.omni` (cuenta) y puede ser afinada por la
 * PERSONALIDAD activa (`voiceStyle.omni`) — resolución por-turno en `resolveActiveOmni`.
 *
 * SSR-safe, defensivo. Importarlo es barato (nada de red al importar).
 */

import {
  DEFAULT_ASTRAURA_VOICE,
  getOmniConfig,
  mapDesignAttrsToSpace,
  mergeAstrauraVoice,
  sanitizeAstrauraVoice,
  sanitizeAstrauraVoicePartial,
  type AstrauraVoiceConfig,
} from "@/lib/aurora/tts-oss/voice-config";

// ── Constantes ───────────────────────────────────────────────────────────────

/** Origen del daemon local (motor `omnivoice.cpp`). */
export const OMNI_LOCAL_BASE = "http://127.0.0.1:4444";
/** Base del Space gratis (HF, Gradio 5). */
export const OMNI_SPACE_BASE = "https://k2-fsa-omnivoice.hf.space";
/** Función de DISEÑO de voz del Space. */
export const OMNI_DESIGN_FN = "_design_fn";
/** Función de CLONACIÓN de voz del Space. */
export const OMNI_CLONE_FN = "_clone_fn";

/** TTL del handshake al daemon local (no martillear 127.0.0.1). */
const HANDSHAKE_TTL_MS = 30_000;
/** Timeout del handshake `GET /status` (rápido: si no hay daemon, falla ya). */
const HANDSHAKE_TIMEOUT_MS = 2_500;
/** Presupuesto de la síntesis LOCAL (`POST /tts`) con el daemon CALIENTE. */
const LOCAL_TTS_TIMEOUT_MS = 30_000;
/**
 * Presupuesto MÁXIMO de la síntesis LOCAL cuando la neurona ELIGIÓ local (Adenda
 * 88). NO es una espera fija: el `POST /tts` devuelve en cuanto el daemon responde
 * (~22–40 s caliente). Es solo el TECHO antes de rendirse: el CLI tarda ~
 * proporcional al texto (una frase larga en un M1/8 GB pasa de 60 s, y en frío
 * suma la recarga del modelo), así que lo ponemos GENEROSO —justo por debajo del
 * watchdog interno del daemon (180 s)— para NO cortar nunca antes de tiempo y caer
 * a la nube robótica. El keep-alive hace que en la práctica casi siempre sea rápido.
 */
const LOCAL_PREFER_MAX_MS = 150_000;
/** Cada cuánto se vuelve a precalentar el daemon (antes de dormirse a los 10 min). */
const KEEP_WARM_EVERY_MS = 7 * 60_000;
/**
 * CORTACIRCUITO ADAPTATIVO (equipos modestos): si una síntesis local agota su
 * presupuesto, durante un rato preferimos la nube y a lo local solo le damos
 * una sonda BREVE (los aciertos de caché del daemon responden en <1s). El
 * daemon TERMINA la síntesis abortada en segundo plano y la cachea, así que
 * las frases repetidas vuelven a ser locales e instantáneas — lo local se
 * recupera solo, sin configuración.
 */
const LOCAL_PROBE_TIMEOUT_MS = 3_000;
const LOCAL_SLOW_COOLDOWN_MS = 10 * 60_000;
let localSlowUntil = 0;
/** Presupuesto GENEROSO de la nube (los Spaces despiertan lento). */
const CLOUD_TIMEOUT_MS = 60_000;
/** Sub-timeout del PASO 1 (enviar la petición y recibir el event_id): rápido. */
const CLOUD_KICKOFF_TIMEOUT_MS = 15_000;

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Camino por el que salió (o saldría) la voz. */
export type OmniRoute = "local" | "cloud" | "off";

/** Estado del daemon local (parseado de `GET /status`). */
export interface OmniDaemonStatus {
  ok: boolean;
  ready: boolean;
  engine: string;
  model: string | null;
  tier: string | null;
  backend: string | null;
  warm: boolean;
  sampleRate: number;
  reasons: string[];
}

export interface OmniSynthOptions {
  /** Override de la config (fusiona sobre cuenta+personalidad). */
  omni?: Partial<AstrauraVoiceConfig>;
  /** Idioma ("es", "en", "es-ES"…). Por defecto español. */
  lang?: string;
  /** Estado legible en vivo ("Voz local activa ⚡", "despertando la voz en la nube…"). */
  onStatus?: (message: string) => void;
  /** Señal externa de aborto. */
  signal?: AbortSignal;
}

// ── Idioma → nombre del Space ────────────────────────────────────────────────

/** Nombres de idioma en inglés que el Space acepta (subconjunto útil). */
const LANG_NAME_BY_CODE: Record<string, string> = {
  es: "Spanish",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
};

/** Mapea un código/etiqueta de idioma al nombre EXACTO del Space (o "Spanish"). */
export function mapLangToSpace(lang: string | undefined): string {
  const raw = (lang || "es").trim();
  if (!raw) return "Spanish";
  // Ya es un nombre válido en inglés (p.ej. "Spanish")? Respétalo.
  const asName = Object.values(LANG_NAME_BY_CODE).find(
    (n) => n.toLowerCase() === raw.toLowerCase(),
  );
  if (asName) return asName;
  const base = raw.toLowerCase().slice(0, 2);
  return LANG_NAME_BY_CODE[base] || "Spanish";
}

// ── Utilidades de audio ──────────────────────────────────────────────────────

function clampNum(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** ¿Estos bytes parecen audio (WAV/MP3/OGG/FLAC)? */
function looksLikeAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const s = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (s === "RIFF" || s === "OggS" || s === "fLaC" || s.startsWith("ID3")) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // frame MP3/AAC
}

/**
 * Estima la DURACIÓN objetivo (segundos) que exige `/_design_fn`: a partir de las
 * palabras del texto, `du = clamp(palabras*0.42 + 1, 2, 30)`. Redondeada a 0.1 s.
 */
export function estimateDuration(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const du = clampNum(words * 0.42 + 1, 2, 30);
  return Math.round(du * 10) / 10;
}

/**
 * Quita los símbolos NO VERBALES ([risas], [suspiro]…) del texto cuando el
 * usuario los desactivó. Si están permitidos, el texto pasa TAL CUAL (passthrough).
 */
function applyNonVerbalPolicy(text: string, allow: boolean): string {
  if (allow) return text;
  return text.replace(/\[[^\]]{0,40}\]/g, "").replace(/\s{2,}/g, " ").trim();
}

// ── Payloads posicionales del Space (contrato EXACTO) ─────────────────────────

/**
 * Construye el array POSICIONAL de 15 elementos de `/_design_fn` (modo DISEÑO).
 * Orden verificado del contrato (Adenda 77-voz):
 *   [text, lang, ns, gs, dn, sp, du, pp, po, gender, age, pitch, style,
 *    english_accent, chinese_dialect]
 * Usa LITERALES EXACTOS de los enums vía `mapDesignAttrsToSpace`.
 */
export function buildDesignData(
  text: string,
  omni: AstrauraVoiceConfig,
  langName: string,
): unknown[] {
  const pb = omni.playback_parameters;
  const cleanText = applyNonVerbalPolicy(text, pb.allow_non_verbal_symbols);
  const m = mapDesignAttrsToSpace(omni.voice_design_attributes);
  const sp = clampNum(pb.speed, 0.5, 1.5);
  const du = estimateDuration(cleanText);
  return [
    cleanText, // [0]  text
    langName, // [1]  lang
    32, // [2]  ns (4-64)
    2.0, // [3]  gs (0-4)
    pb.normalize_text !== false, // [4]  dn
    sp, // [5]  sp (0.5-1.5)
    du, // [6]  du (segundos, requerido)
    true, // [7]  pp
    true, // [8]  po
    m.gender, // [9]  gender
    m.age, // [10] age
    m.pitch, // [11] pitch
    m.style, // [12] style
    m.english_accent, // [13] english_accent
    m.chinese_dialect, // [14] chinese_dialect
  ];
}

/**
 * Construye el array POSICIONAL de 12 elementos de `/_clone_fn` (modo CLONACIÓN).
 * Orden del contrato: [text, lang, ref_aud, ref_text, instruct, ns, gs, dn, sp,
 * du, pp, po]. `refAud` es un FileData de audio ya subido al Space (o null).
 */
export function buildCloneData(
  text: string,
  omni: AstrauraVoiceConfig,
  langName: string,
  refAud: unknown,
): unknown[] {
  const pb = omni.playback_parameters;
  const cleanText = applyNonVerbalPolicy(text, pb.allow_non_verbal_symbols);
  const sp = clampNum(pb.speed, 0.5, 1.5);
  const du = estimateDuration(cleanText);
  return [
    cleanText, // [0]  text
    langName, // [1]  lang
    refAud ?? null, // [2]  ref_aud (FileData)
    omni.voice_cloning.reference_transcript || "", // [3]  ref_text
    omni.instruct || "", // [4]  instruct
    32, // [5]  ns
    2.0, // [6]  gs
    pb.normalize_text !== false, // [7]  dn
    sp, // [8]  sp
    du, // [9]  du
    true, // [10] pp
    true, // [11] po
  ];
}

// ── Resolución de la config activa (cuenta + personalidad, por turno) ────────

function safeOmniConfig(): AstrauraVoiceConfig {
  try {
    return getOmniConfig();
  } catch {
    return { ...DEFAULT_ASTRAURA_VOICE };
  }
}

/**
 * Resuelve la config OmniVoice EFECTIVA de este turno:
 *   DEFAULT ← cuenta (`AuroraVoiceConfig.omni`) ← personalidad activa
 *   (`voiceStyle.omni`, Partial) ← override explícito de opts.
 * La personalidad se lee con import DINÁMICO (como el pin de voz) → per-turno,
 * per-personalidad. NUNCA lanza.
 */
export async function resolveActiveOmni(
  explicit?: Partial<AstrauraVoiceConfig>,
): Promise<AstrauraVoiceConfig> {
  let cfg = safeOmniConfig();
  try {
    const mod = await import("@/lib/aurora/personalities");
    const profile =
      (typeof mod.resolvePersonalityForContext === "function"
        ? mod.resolvePersonalityForContext({})
        : null) ??
      (typeof mod.getActivePersonality === "function" ? mod.getActivePersonality() : null);
    const over =
      typeof mod.personalityOmniOverride === "function"
        ? mod.personalityOmniOverride(profile)
        : sanitizeAstrauraVoicePartial(
            (profile as { voiceStyle?: { omni?: unknown } } | null)?.voiceStyle?.omni,
          );
    if (over) cfg = mergeAstrauraVoice(cfg, over);
  } catch {
    /* sin personalidades → cuenta manda */
  }
  if (explicit) cfg = mergeAstrauraVoice(cfg, sanitizeAstrauraVoicePartial(explicit));
  return cfg;
}

// ── Handshake al daemon local (cacheado 30 s) ────────────────────────────────

let hsCache: { at: number; state: OmniDaemonStatus | null } | null = null;

/** Parsea el JSON de `GET /status` a un OmniDaemonStatus tolerante. Nunca lanza. */
export function parseDaemonStatus(raw: unknown): OmniDaemonStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // El daemon SIEMPRE responde con { ok, engine, ready, ... }.
  if (r.ok !== true && r.ready === undefined) return null;
  return {
    ok: r.ok === true,
    ready: r.ready === true,
    engine: typeof r.engine === "string" ? r.engine : "omnivoice.cpp",
    model: typeof r.model === "string" ? r.model : null,
    tier: typeof r.tier === "string" ? r.tier : null,
    backend: typeof r.backend === "string" ? r.backend : null,
    warm: r.warm === true,
    sampleRate: typeof r.sampleRate === "number" ? r.sampleRate : 24000,
    reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === "string") : [],
  };
}

async function probeDaemon(signal?: AbortSignal): Promise<OmniDaemonStatus | null> {
  if (typeof window === "undefined") return null;
  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(onAbort, HANDSHAKE_TIMEOUT_MS);
  try {
    const res = await fetch(`${OMNI_LOCAL_BASE}/status`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return parseDaemonStatus(json);
  } catch {
    return null; // sin daemon → connection refused → null (rápido)
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/** Handshake cacheado (TTL 30 s). NUNCA lanza. */
export async function omniHandshake(
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<OmniDaemonStatus | null> {
  const now = Date.now();
  if (!opts.force && hsCache && now - hsCache.at < HANDSHAKE_TTL_MS) return hsCache.state;
  const state = await probeDaemon(opts.signal);
  hsCache = { at: now, state };
  return state;
}

// ── Identidad local por personalidad (Adenda 87) ────────────────────────────

/** "aurora" · "hermione" · id saneado de la personalidad activa (o ""). */
function activePersonalityKind(): string {
  try {
    if (typeof window === "undefined") return "";
    // Import perezoso NO circular en runtime (personalities no importa este módulo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const cached = w.__astrauraActivePersonaKind;
    if (typeof cached === "string") return cached;
  } catch { /* */ }
  return "";
}

/**
 * Sube UNA vez (por versión de semilla) la identidad de la personalidad al
 * daemon local (POST /identity) para que TODAS las síntesis locales la clonen.
 * Fire-and-forget: nunca bloquea ni lanza. La semilla es 100 % sintética.
 */
export async function ensureLocalIdentity(personalityId?: string): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const mod = await import("@/lib/aurora/tts-oss/openvoice2");
    const kind = mod.seedKindFor(personalityId) || "";
    if (!kind) return;
    try {
      (window as unknown as { __astrauraActivePersonaKind?: string }).__astrauraActivePersonaKind = kind;
    } catch { /* */ }
    const flagKey = `starseed.omni.identity.${kind}.v${mod.OPENVOICE2_SEED_VERSION}`;
    try {
      if (window.localStorage.getItem(flagKey)) return; // ya subida
    } catch { /* */ }
    const blob = mod.readCachedSeedBlob(kind);
    if (!blob) return; // sin semilla aún: se subirá cuando exista
    const b64 = await blob.arrayBuffer().then((ab) => {
      const u = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...Array.from(u.subarray(i, i + 0x8000)));
      return btoa(bin);
    });
    const spec = mod.OPENVOICE2_SEED_SPECS[kind as "aurora" | "hermione"];
    const r = await fetch(`${OMNI_LOCAL_BASE}/identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personality: kind, wav_b64: b64, text: spec?.text || "" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      try { window.localStorage.setItem(flagKey, String(Date.now())); } catch { /* */ }
    }
  } catch { /* sin daemon o sin semilla: nada que hacer */ }
}

// ── Preferencia de la neurona + PRE-CALENTADO del daemon (Adenda 88) ────────

/**
 * ¿Esta neurona ELIGIÓ la voz local? (localStorage por dispositivo, escrito por
 * la ventana de voz de la neurona). Si eligió local, comprometemos la cadena con
 * el daemon (presupuesto en frío generoso) en vez de saltar a la nube robótica.
 * NUNCA lanza. Lee la clave directamente para no acoplar con engine-registry.
 */
export function neuronPrefersLocalLS(): boolean {
  try {
    if (typeof window === "undefined") return false;
    for (const k of ["starseed.voz.neurona.v2", "starseed.voz.neurona.v1"]) {
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const j = JSON.parse(raw) as { mode?: string };
      if (j?.mode === "local") return true;
      if (j?.mode === "cloud") return false; // eligió nube explícitamente
    }
  } catch {
    /* */
  }
  return false;
}

let lastWarmAt = 0;
/**
 * Precalienta el daemon local (POST /warm, fire-and-forget). El daemon responde
 * al instante y carga el modelo en segundo plano → los turnos siguientes son
 * rápidos (~22 s) en vez de fríos (~40 s). Anti-martilleo de 60 s. Un daemon
 * viejo (sin /warm) responde 404 y se ignora. NUNCA lanza ni bloquea.
 */
export function warmLocalDaemon(): void {
  try {
    if (typeof window === "undefined") return;
    const now = Date.now();
    if (now - lastWarmAt < 60_000) return;
    lastWarmAt = now;
    void fetch(`${OMNI_LOCAL_BASE}/warm`, {
      method: "POST",
      signal: AbortSignal.timeout(4_000),
    }).catch(() => {
      /* sin daemon o daemon viejo: nada que hacer */
    });
  } catch {
    /* */
  }
}

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
/**
 * Arranca (una vez) el keep-alive que mantiene el daemon caliente mientras la
 * pestaña esté visible y la neurona prefiera local: precalienta cada ~7 min
 * (antes de que el daemon se duerma a los 10 min). Idempotente. NUNCA lanza.
 */
export function ensureLocalKeepAlive(): void {
  try {
    if (typeof window === "undefined" || keepAliveTimer) return;
    if (neuronPrefersLocalLS()) warmLocalDaemon(); // calienta YA
    keepAliveTimer = setInterval(() => {
      try {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        if (neuronPrefersLocalLS()) warmLocalDaemon();
      } catch {
        /* */
      }
    }, KEEP_WARM_EVERY_MS);
  } catch {
    /* */
  }
}

// ── Síntesis LOCAL (POST /tts) ───────────────────────────────────────────────

async function synthLocal(
  text: string,
  omni: AstrauraVoiceConfig,
  langName: string,
  signal?: AbortSignal,
  timeoutMs: number = LOCAL_TTS_TIMEOUT_MS,
): Promise<{ blob: Blob | null; timedOut: boolean }> {
  if (typeof window === "undefined") return { blob: null, timedOut: false };
  const pb = omni.playback_parameters;
  const body: Record<string, unknown> = {
    text: applyNonVerbalPolicy(text, pb.allow_non_verbal_symbols),
    lang: langName,
    instruct: omni.instruct || undefined,
    voice_design: omni.voice_design_attributes,
    speed: clampNum(pb.speed, 0.5, 1.5),
    normalize: pb.normalize_text !== false,
    allow_non_verbal: pb.allow_non_verbal_symbols !== false,
    // IDENTIDAD (Adenda 87): el daemon clona refs/<personalidad>.wav si existe
    // (subida una vez vía ensureLocalIdentity) y, si no, fija --seed estable por
    // personalidad → voz FEMENINA consistente también en local.
    personality: activePersonalityKind(),
  };
  if (
    omni.generation_mode === "voice_cloning" &&
    omni.voice_cloning.enabled &&
    omni.voice_cloning.reference_prompt_path
  ) {
    body.ref_wav_path = omni.voice_cloning.reference_prompt_path;
    if (omni.voice_cloning.reference_transcript) body.ref_text = omni.voice_cloning.reference_transcript;
  }

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      /* */
    }
  };
  if (signal) {
    if (signal.aborted) return { blob: null, timedOut: false };
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const killer = setTimeout(() => {
    timedOut = true;
    onAbort();
  }, timeoutMs);
  try {
    const res = await fetch(`${OMNI_LOCAL_BASE}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return { blob: null, timedOut: false };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!looksLikeAudio(buf)) return { blob: null, timedOut: false };
    const type = (res.headers.get("content-type") || "audio/wav").split(";")[0];
    return { blob: new Blob([buf], { type }), timedOut: false };
  } catch {
    return { blob: null, timedOut };
  } finally {
    clearTimeout(killer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ── Nube: helper GRADIO 5 reutilizable (2 pasos) ─────────────────────────────

/** FileData de Gradio → Blob de audio. Prueba url absoluta y ruta del servidor. */
async function gradioFileToBlob(
  item: unknown,
  base: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (!item || typeof item !== "object") return null;
  const it = item as { url?: unknown; path?: unknown; name?: unknown };
  const b = base.replace(/\/+$/, "");
  const candidates: string[] = [];
  const url = typeof it.url === "string" ? it.url : "";
  const path = typeof it.path === "string" ? it.path : "";
  const name = typeof it.name === "string" ? it.name : "";
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
    if (!c) continue;
    try {
      const res = await fetch(c, { method: "GET", signal });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!looksLikeAudio(buf)) continue;
      const type = (res.headers.get("content-type") || "audio/wav").split(";")[0];
      return new Blob([buf], { type });
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

/**
 * callGradioSpace — invoca una función de un Space (Gradio 5), 2 pasos:
 *   POST `{base}/gradio_api/call/{fn}` {data} → {event_id}
 *   GET  `{base}/gradio_api/call/{fn}/{event_id}` (SSE) → última línea `data:`
 * Devuelve el ARRAY de salida (unknown[]) o null. Generaliza el patrón de
 * `neural-tts.ts::tryGradioVoxCPM` para reutilizarlo sin duplicar el parseo.
 * NUNCA lanza.
 */
export async function callGradioSpace(
  base: string,
  fn: string,
  data: unknown[],
  opts: { onStatus?: (m: string) => void; signal?: AbortSignal; budgetMs?: number } = {},
): Promise<unknown[] | null> {
  if (typeof window === "undefined") return null;
  const b = base.replace(/\/+$/, "");
  const budget = opts.budgetMs ?? CLOUD_TIMEOUT_MS;
  const deadline = Date.now() + budget;

  // PASO 1 — enviar la petición y obtener event_id (rápido, sub-timeout propio).
  let eventId: string | null = null;
  {
    const controller = new AbortController();
    const onAbort = () => {
      try {
        controller.abort();
      } catch {
        /* */
      }
    };
    if (opts.signal) {
      if (opts.signal.aborted) return null;
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    const killer = setTimeout(onAbort, CLOUD_KICKOFF_TIMEOUT_MS);
    try {
      const post = await fetch(`${b}/gradio_api/call/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
        signal: controller.signal,
      });
      if (post.ok) {
        const started = await post.json().catch(() => null);
        const id =
          started && typeof started === "object"
            ? (started as { event_id?: unknown; eventId?: unknown }).event_id ??
              (started as { eventId?: unknown }).eventId
            : null;
        if (typeof id === "string" && id) eventId = id;
      }
    } catch {
      eventId = null;
    } finally {
      clearTimeout(killer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    }
  }
  if (!eventId) return null;

  // PASO 2 — leer el SSE hasta el payload final (aquí ocurre la inferencia lenta).
  try {
    opts.onStatus?.("despertando la voz en la nube…");
  } catch {
    /* */
  }
  const controller2 = new AbortController();
  const onAbort2 = () => {
    try {
      controller2.abort();
    } catch {
      /* */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) return null;
    opts.signal.addEventListener("abort", onAbort2, { once: true });
  }
  const remaining = Math.max(1_000, deadline - Date.now());
  const killer2 = setTimeout(onAbort2, remaining);
  try {
    const sse = await fetch(`${b}/gradio_api/call/${fn}/${eventId}`, {
      method: "GET",
      signal: controller2.signal,
    });
    if (!sse.ok) return null;
    const raw = await sse.text();
    let last: unknown = null;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === "null") continue;
      try {
        last = JSON.parse(payload);
      } catch {
        /* línea parcial → siguiente */
      }
    }
    if (Array.isArray(last)) return last;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(killer2);
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort2);
  }
}

/** Primer Blob de audio dentro del array de salida de un Space. */
async function firstAudioFromGradio(
  out: unknown[] | null,
  base: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (!out) return null;
  for (const item of out) {
    const blob = await gradioFileToBlob(item, base, signal);
    if (blob) return blob;
  }
  return null;
}

/**
 * Sube un audio de referencia (desde una URL pública) al Space vía multipart a
 * `/gradio_api/upload` y devuelve un FileData usable en `/_clone_fn`. Best-effort:
 * si la referencia no es una URL http(s) o la subida falla, devuelve null y la
 * clonación en nube degrada a DISEÑO. La clonación LOCAL (daemon) sí acepta rutas.
 */
async function prepareCloudRef(
  base: string,
  ref: string | undefined,
  signal: AbortSignal,
): Promise<unknown | null> {
  if (!ref || !/^https?:\/\//i.test(ref)) return null; // nube: solo URLs públicas (BETA)
  const b = base.replace(/\/+$/, "");
  try {
    const audioRes = await fetch(ref, { method: "GET", signal });
    if (!audioRes.ok) return null;
    const audioBlob = await audioRes.blob();
    const fd = new FormData();
    const filename = ref.split("/").pop() || "reference.wav";
    fd.append("files", audioBlob, filename);
    const up = await fetch(`${b}/gradio_api/upload`, { method: "POST", body: fd, signal });
    if (!up.ok) return null;
    const paths = await up.json().catch(() => null);
    const path = Array.isArray(paths) && typeof paths[0] === "string" ? paths[0] : null;
    if (!path) return null;
    return {
      path,
      url: `${b}/gradio_api/file=${encodeURI(path)}`,
      orig_name: filename,
      meta: { _type: "gradio.FileData" },
    };
  } catch {
    return null;
  }
}

async function synthCloud(
  text: string,
  omni: AstrauraVoiceConfig,
  langName: string,
  opts: OmniSynthOptions,
): Promise<Blob | null> {
  const base = OMNI_SPACE_BASE;
  const controller = new AbortController();
  const onAbort = () => {
    try {
      controller.abort();
    } catch {
      /* */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) return null;
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    // CLONACIÓN en nube (BETA): requiere subir una referencia pública.
    if (omni.generation_mode === "voice_cloning" && omni.voice_cloning.enabled) {
      const refData = await prepareCloudRef(base, omni.voice_cloning.reference_prompt_path, controller.signal);
      if (refData) {
        const data = buildCloneData(text, omni, langName, refData);
        const out = await callGradioSpace(base, OMNI_CLONE_FN, data, {
          onStatus: opts.onStatus,
          signal: controller.signal,
        });
        const blob = await firstAudioFromGradio(out, base, controller.signal);
        if (blob) return blob;
      }
      // Degradación honesta: sin referencia usable → DISEÑO (Aurora igual habla).
    }
    const data = buildDesignData(text, omni, langName);
    const out = await callGradioSpace(base, OMNI_DESIGN_FN, data, {
      onStatus: opts.onStatus,
      signal: controller.signal,
    });
    return await firstAudioFromGradio(out, base, controller.signal);
  } catch {
    return null;
  } finally {
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
  }
}

// ── Estado de ruta (para la UI) ──────────────────────────────────────────────

let lastRoute: OmniRoute = "off";

/** Última ruta REAL por la que salió la voz ('local' | 'cloud' | 'off'). */
export function getOmniVoiceRouteState(): OmniRoute {
  return lastRoute;
}

/**
 * Predice la ruta SIN sintetizar (handshake + privacidad), y actualiza el estado
 * para la UI. Úsalo al abrir un panel para pintar el chip "Voz local activa ⚡" /
 * "Voz en la nube". NUNCA lanza.
 */
export async function refreshOmniRoute(signal?: AbortSignal): Promise<OmniRoute> {
  const omni = safeOmniConfig();
  if (omni.privacy_mode === "cloud_only") {
    lastRoute = "cloud";
    return lastRoute;
  }
  const hs = await omniHandshake({ signal });
  if (hs && hs.ready) {
    lastRoute = "local";
  } else if (omni.privacy_mode === "local_only") {
    lastRoute = "off";
  } else {
    lastRoute = "cloud";
  }
  return lastRoute;
}

// ── API PRINCIPAL ────────────────────────────────────────────────────────────

/**
 * synthesizeOmniVoiceHybrid — sintetiza `text` por el mejor camino OmniVoice
 * disponible según `privacy_mode`, y devuelve el Blob de audio o null.
 *   1. LOCAL (si privacy≠"cloud_only"): handshake cacheado; si ready → POST /tts.
 *   2. NUBE (si privacy≠"local_only"): Space (diseño por defecto o clonación).
 *   3. null si ambos fallan → la cadena de voz sigue (Kokoro/navegador).
 * NUNCA lanza.
 */
export async function synthesizeOmniVoiceHybrid(
  text: string,
  opts: OmniSynthOptions = {},
): Promise<Blob | null> {
  const clean = (text || "").trim();
  if (!clean || typeof window === "undefined") return null;

  const omni = await resolveActiveOmni(opts.omni);
  const langName = mapLangToSpace(opts.lang);
  const privacy = omni.privacy_mode;

  // 1) LOCAL — daemon en 127.0.0.1 (baja latencia, privado).
  if (privacy !== "cloud_only") {
    // ¿Esta neurona ELIGIÓ voz local? Entonces nos comprometemos con el daemon:
    // presupuesto en frío generoso y SIN castigo de "nube 10 min" (Adenda 88).
    const preferLocal = privacy === "local_only" || neuronPrefersLocalLS();
    // Mantén el daemon caliente para los turnos siguientes (no bloquea este).
    ensureLocalKeepAlive();
    const hs = await omniHandshake({ signal: opts.signal });
    if (hs && hs.ready) {
      // El modo lento (sonda de 3 s + nube primero) es SOLO para neuronas que NO
      // eligieron local; si eligió local nunca degradamos a la nube por rapidez.
      const slowMode = !preferLocal && Date.now() < localSlowUntil;
      try {
        opts.onStatus?.(slowMode ? "Sondeando la caché local…" : "Voz local activa ⚡");
      } catch {
        /* */
      }
      // Presupuesto: si la neurona ELIGIÓ local, esperamos a que el daemon responda
      // de verdad (techo generoso, no espera fija: vuelve en cuanto sintetiza) en
      // vez de cortar a los 30 s y saltar a la nube robótica. El CLI tarda ~ según
      // la longitud del texto (y en frío suma la recarga del modelo).
      let budget: number;
      if (slowMode) budget = LOCAL_PROBE_TIMEOUT_MS;
      else if (preferLocal) budget = LOCAL_PREFER_MAX_MS;
      else budget = LOCAL_TTS_TIMEOUT_MS;
      const local = await synthLocal(clean, omni, langName, opts.signal, budget).catch(
        () => ({ blob: null as Blob | null, timedOut: false }),
      );
      if (local.blob) {
        localSlowUntil = 0; // lo local respondió: se acabó el modo lento
        lastRoute = "local";
        return local.blob;
      }
      if (local.timedOut && !preferLocal) {
        // Equipo que no eligió local y va lento: nube-primero un rato; el daemon
        // termina en segundo plano y cachea, así que lo local vuelve solo.
        localSlowUntil = Date.now() + LOCAL_SLOW_COOLDOWN_MS;
        try {
          opts.onStatus?.("La voz local va lenta en este equipo; uso la nube mientras calienta su caché…");
        } catch {
          /* */
        }
      } else if (local.timedOut && preferLocal) {
        // La neurona quiere local: NO castigamos 10 min con nube. Precalienta ya
        // para que el próximo turno sea rápido; este turno sí degrada a la nube
        // (o a Kokoro/navegador si privacy=local_only) para no dejar a Aurora muda.
        warmLocalDaemon();
        try {
          opts.onStatus?.("La voz local está calentando el modelo; el próximo turno irá más rápido…");
        } catch {
          /* */
        }
      }
    } else if (hs && !hs.ready) {
      try {
        opts.onStatus?.("El motor local está instalado a medias; usando la nube…");
      } catch {
        /* */
      }
    }
    if (privacy === "local_only") {
      lastRoute = "off";
      return null; // sin nube: la cadena sigue → Kokoro/navegador
    }
  }

  // 2) NUBE — Space gratis (puede tardar en despertar). Aquí solo llegan los modos
  //    "hybrid_allow_cloud" (local falló) y "cloud_only"; "local_only" ya retornó.
  const cloud = await synthCloud(clean, omni, langName, opts).catch(() => null);
  if (cloud) {
    lastRoute = "cloud";
    return cloud;
  }

  lastRoute = "off";
  return null;
}
