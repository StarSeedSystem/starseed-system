"use client";

/**
 * StarSeed OS — Motores de VOZ NEURAL por ENDPOINT (Bark · GPT-SoVITS · OmniVoice).
 * ============================================================================
 * Los tres son SERVIDORES Python (corren en una neurona propia/CasaOS o en un
 * host remoto), NUNCA en el navegador. Este módulo es el cliente HTTP GENÉRICO
 * y TOLERANTE que los tres comparten: una llamada POST JSON que devuelve audio,
 * con detección de disponibilidad (ping con caché de 60 s) y reproducción por
 * <audio> (mismo patrón que kokoro.ts). SSR-safe, defensivo, NUNCA lanza.
 *
 * ── CONTRATO HTTP ESPERADO (tolerante: probamos las formas comunes) ─────────
 *
 * PETICIÓN — POST {endpoint}{ruta} con JSON. Si el endpoint configurado ya
 * incluye una ruta (p.ej. http://neurona:9880/tts), se usa TAL CUAL; si es solo
 * origen (http://neurona:9880), se prueban las rutas típicas de cada motor
 * dentro de un presupuesto TOTAL de 20 s:
 *
 *   · bark        → /generate · /tts · /api/tts
 *       body: { text, prompt, voice, speaker, voice_preset, history_prompt,
 *               language, speed } — cubre los servidores HTTP comunitarios de
 *       suno-ai/bark (el campo de voz típico es un preset "v2/es_speaker_1").
 *       La expresividad va EN EL TEXTO con etiquetas [laughs]/[sighs]
 *       (voice-style.ts las añade con moderación).
 *   · gpt-sovits  → /tts (api_v2.py) · / (api.py clásico) · /api/tts
 *       body v2: { text, text_lang, ref_audio_path, prompt_text, prompt_lang,
 *                  speed_factor }  ·  body v1: { text, text_language,
 *                  refer_wav_path, prompt_text, prompt_language, speed }.
 *       Enviamos AMBOS juegos de alias en el mismo JSON (los servidores ignoran
 *       campos desconocidos). refAudio/refText = la muestra de clonación (~5 s).
 *   · omnivoice   → /tts · /generate · /api/tts   (ecosistema k2-fsa /
 *       sherpa: { text, sid, speed }) + alias { voice, lang }.
 *
 * RESPUESTA — cualquiera de estas formas se acepta:
 *   · bytes de audio (Content-Type audio/* o cuerpo que empieza por "RIFF"
 *     WAV / "ID3"/0xFFEx MP3 / "OggS") → se reproduce como Blob;
 *   · JSON con audio en base64: { audio | audio_base64 | audio_data | data |
 *     wav | b64 } (acepta data-URLs "data:audio/...;base64,...");
 *   · JSON con URL del archivo: { audio_url | url | file | path } (se resuelve
 *     relativa al endpoint y se descarga);
 *   · estilo Gradio: { data: [ { name | url | data } , ... ] }.
 *
 * TIMEOUT: 20 s TOTALES por locución (AbortController compartido entre rutas).
 * PING: GET {endpoint} (y /health · /docs) con 5 s; CUALQUIER respuesta HTTP
 * (aunque sea 404) = servidor vivo. Si el fetch CORS falla, se reintenta en
 * modo no-cors (respuesta opaca = alcanzable). Resultado cacheado 60 s por
 * (motor, endpoint) para no martillar la neurona.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  getEngineSettings,
  type NeuralEngineSettings,
  type NeuralVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import {
  decorateTextForBark,
  engineStyleOverrides,
  passthroughParams,
  resolveVoiceParams,
  type ResolvedVoiceParams,
} from "@/lib/aurora/tts-oss/voice-style";

// ── Constantes ───────────────────────────────────────────────────────────────

/** Presupuesto total por locución (petición + descarga), en ms. */
export const NEURAL_TTS_TIMEOUT_MS = 20_000;
/** TTL de la caché de disponibilidad (ping), en ms. */
export const NEURAL_PING_TTL_MS = 60_000;

/** Rutas candidatas por motor cuando el endpoint es solo origen. */
const ENGINE_PATHS: Record<NeuralVoiceEngine, string[]> = {
  bark: ["/generate", "/tts", "/api/tts"],
  "gpt-sovits": ["/tts", "/", "/api/tts"],
  omnivoice: ["/tts", "/generate", "/api/tts"],
};

/** Metadatos de presentación por motor (etiquetas para UI y herramientas). */
export const NEURAL_ENGINE_META: Record<
  NeuralVoiceEngine,
  { label: string; hint: string; voicePlaceholder: string; repo: string }
> = {
  bark: {
    label: "Bark (generativa)",
    hint: "TTS expresivo de Suno: entona, ríe y suspira",
    voicePlaceholder: "v2/es_speaker_1",
    repo: "https://github.com/suno-ai/bark",
  },
  "gpt-sovits": {
    label: "GPT-SoVITS (clonación)",
    hint: "Clona una voz con ~5 s de muestra (refAudio)",
    voicePlaceholder: "id de voz (opcional)",
    repo: "https://github.com/RVC-Boss/GPT-SoVITS",
  },
  omnivoice: {
    label: "OmniVoice (multilingüe)",
    hint: "Voz neural k2-fsa · Next-gen Kaldi",
    voicePlaceholder: "sid o nombre de voz",
    repo: "https://github.com/k2-fsa/OmniVoice",
  },
};

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Normaliza el endpoint (añade http:// si falta; quita barra final). "" si inválido. */
export function normalizeEndpoint(raw: string | undefined | null): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const withProto = /^https?:\/\//i.test(s) ? s : `http://${s}`;
  try {
    const u = new URL(withProto);
    return u.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** ¿El endpoint incluye ya una ruta concreta (más allá de "/")? */
function hasExplicitPath(endpoint: string): boolean {
  try {
    return new URL(endpoint).pathname.replace(/\/+$/, "") !== "";
  } catch {
    return false;
  }
}

/** URLs candidatas a las que POSTear para este motor. */
function candidateUrls(engine: NeuralVoiceEngine, endpoint: string): string[] {
  if (hasExplicitPath(endpoint)) return [endpoint];
  const base = endpoint.replace(/\/+$/, "");
  return ENGINE_PATHS[engine].map((p) => (p === "/" ? `${base}/` : `${base}${p}`));
}

/** base64 (o data-URL) → Blob de audio. null si no parsea. Nunca lanza. */
function base64ToBlob(b64: string): Blob | null {
  try {
    let data = b64.trim();
    let mime = "audio/wav";
    // [\s\S] en vez del flag /s (dotAll): el target del proyecto es ES2017.
    const m = data.match(/^data:([^;,]+);base64,([\s\S]*)$/);
    if (m) {
      mime = m[1] || mime;
      data = m[2];
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length < 64) return null;
    const bin = atob(data.replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** ¿Estos bytes parecen audio (WAV/MP3/OGG/FLAC)? */
function looksLikeAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const s = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (s === "RIFF" || s === "OggS" || s === "fLaC" || s.startsWith("ID3")) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // frame MP3/AAC
}

/** Resuelve una URL (posiblemente relativa) contra el endpoint. "" si no se puede. */
function resolveUrl(maybe: string, endpoint: string): string {
  try {
    return new URL(maybe, `${endpoint.replace(/\/+$/, "")}/`).href;
  } catch {
    return "";
  }
}

/** Busca audio dentro de un JSON tolerantemente (base64, URL, Gradio). */
async function audioFromJson(
  json: any,
  endpoint: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (!json || typeof json !== "object") return null;

  // 1) base64 directo bajo claves comunes.
  const B64_KEYS = ["audio", "audio_base64", "audio_data", "wav", "b64", "data"];
  for (const k of B64_KEYS) {
    const v = (json as any)[k];
    if (typeof v === "string" && v.length > 256) {
      const blob = base64ToBlob(v);
      if (blob) return blob;
    }
  }
  // 2) URL del archivo bajo claves comunes.
  const URL_KEYS = ["audio_url", "url", "file", "path", "audio_path", "output"];
  for (const k of URL_KEYS) {
    const v = (json as any)[k];
    if (typeof v === "string" && v && v.length < 2048) {
      const abs = /^https?:\/\//i.test(v) ? v : resolveUrl(v, endpoint);
      if (abs) {
        const blob = await fetchAudioUrl(abs, signal);
        if (blob) return blob;
      }
    }
  }
  // 3) Estilo Gradio: { data: [ ... ] }.
  const arr = Array.isArray((json as any).data) ? (json as any).data : null;
  if (arr) {
    for (const item of arr) {
      if (typeof item === "string" && item.length > 256) {
        const blob = base64ToBlob(item);
        if (blob) return blob;
      }
      if (item && typeof item === "object") {
        const inner = await audioFromJson(item, endpoint, signal);
        if (inner) return inner;
        const name = (item as any).name;
        if (typeof name === "string" && name) {
          const abs = resolveUrl(`file=${name}`, endpoint) || resolveUrl(name, endpoint);
          if (abs) {
            const blob = await fetchAudioUrl(abs, signal);
            if (blob) return blob;
          }
        }
      }
    }
  }
  return null;
}

/** Descarga una URL de audio → Blob (o null). Nunca lanza. */
async function fetchAudioUrl(url: string, signal: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch(url, { method: "GET", signal });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!looksLikeAudio(buf)) return null;
    const type = res.headers.get("content-type") || "audio/wav";
    return new Blob([buf], { type: type.split(";")[0] });
  } catch {
    return null;
  }
}

// ── Cuerpo de la petición por motor ──────────────────────────────────────────

/**
 * Construye el JSON tolerante para el motor: incluye TODOS los alias comunes
 * del contrato de ese servidor (los campos desconocidos se ignoran al otro
 * lado). `params` ya trae la modulación emocional resuelta.
 */
function buildBody(
  engine: NeuralVoiceEngine,
  text: string,
  s: NeuralEngineSettings,
  params: ResolvedVoiceParams,
): Record<string, unknown> {
  const lang = (s.lang || "es").trim();
  const body: Record<string, unknown> = {
    text,
    ...passthroughParams(engine, params),
  };
  if (engine === "bark") {
    // Servidores comunitarios de Bark: preset de voz bajo varios nombres.
    body.prompt = text;
    if (s.voice) {
      body.voice = s.voice;
      body.speaker = s.voice;
      body.voice_preset = s.voice;
      body.history_prompt = s.voice;
    }
    body.language = lang;
  } else if (engine === "gpt-sovits") {
    // api_v2.py + api.py clásico (ambos juegos de alias a la vez).
    body.text_lang = lang;
    body.text_language = lang;
    if (s.refAudio) {
      body.ref_audio_path = s.refAudio;
      body.refer_wav_path = s.refAudio;
    }
    if (s.refText) {
      body.prompt_text = s.refText;
    }
    body.prompt_lang = lang;
    body.prompt_language = lang;
    if (s.voice) body.voice = s.voice;
  } else {
    // omnivoice (k2-fsa / estilo sherpa): sid numérico o nombre de voz.
    if (s.voice) {
      const sid = parseInt(s.voice, 10);
      if (Number.isFinite(sid)) body.sid = sid;
      body.voice = s.voice;
    }
    body.lang = lang;
    body.language = lang;
  }
  return body;
}

// ── Síntesis (POST → Blob) ───────────────────────────────────────────────────

/**
 * Sintetiza `text` en el endpoint del motor y devuelve el Blob de audio, o
 * null (sin endpoint, servidor caído, respuesta sin audio, timeout…).
 * NUNCA lanza. No reproduce nada: eso lo hace neuralSpeak().
 */
export async function neuralSynthesize(
  engine: NeuralVoiceEngine,
  text: string,
  opts: { settings?: NeuralEngineSettings; onError?: (message: string) => void } = {},
): Promise<Blob | null> {
  const clean = (text || "").trim();
  if (clean.length === 0) return null;
  const s = opts.settings ?? getEngineSettings(engine);
  const endpoint = normalizeEndpoint(s.endpoint);
  if (!endpoint) {
    try {
      opts.onError?.(`El motor ${NEURAL_ENGINE_META[engine].label} no tiene endpoint configurado.`);
    } catch { /* */ }
    return null;
  }

  // Modulación emocional resuelta (estilo persistido + overrides del motor).
  const params = resolveVoiceParams({ engineOverrides: engineStyleOverrides(engine) });
  // Bark: la emoción también viaja como etiqueta EN el texto (con moderación).
  const finalText = engine === "bark" ? decorateTextForBark(clean, params.emotion) : clean;
  const body = buildBody(engine, finalText, s, params);

  const controller = new AbortController();
  const deadline = Date.now() + NEURAL_TTS_TIMEOUT_MS;
  const killer = setTimeout(() => {
    try { controller.abort(); } catch { /* */ }
  }, NEURAL_TTS_TIMEOUT_MS);

  try {
    for (const url of candidateUrls(engine, endpoint)) {
      if (Date.now() >= deadline) break;
      // Cada intento envuelto: un fallo de ruta NUNCA tumba la cadena.
      const blob = await Promise.resolve()
        .then(async () => {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!res.ok) return null;
          const ctype = (res.headers.get("content-type") || "").toLowerCase();
          if (ctype.includes("application/json") || ctype.includes("text/json")) {
            const json = await res.json().catch(() => null);
            return await audioFromJson(json, endpoint, controller.signal);
          }
          const buf = new Uint8Array(await res.arrayBuffer());
          if (looksLikeAudio(buf)) {
            return new Blob([buf], { type: ctype.split(";")[0] || "audio/wav" });
          }
          // Algunos servidores devuelven JSON sin cabecera correcta.
          try {
            const asText = new TextDecoder().decode(buf);
            const json = JSON.parse(asText);
            return await audioFromJson(json, endpoint, controller.signal);
          } catch {
            return null;
          }
        })
        .catch(() => null);
      if (blob) return blob;
    }
    try {
      opts.onError?.(
        `${NEURAL_ENGINE_META[engine].label} no devolvió audio (¿servidor apagado o ruta distinta?).`,
      );
    } catch { /* */ }
    return null;
  } finally {
    clearTimeout(killer);
  }
}

// ── Reproducción por <audio> (una a la vez, patrón kokoro.ts) ────────────────

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export interface NeuralSpeakOptions {
  /** Config del motor (por defecto, la persistida en la clave unificada). */
  settings?: NeuralEngineSettings;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * neuralSpeak — Sintetiza en el endpoint y REPRODUCE el audio, resolviendo al
 * terminar. Devuelve el HTMLAudioElement o null si no se pudo (el llamador cae
 * al siguiente eslabón de la cadena). NUNCA lanza.
 */
export async function neuralSpeak(
  engine: NeuralVoiceEngine,
  text: string,
  opts: NeuralSpeakOptions = {},
): Promise<HTMLAudioElement | null> {
  const fireEnd = () => {
    try { opts.onEnd?.(); } catch { /* */ }
  };
  const fail = (message: string): null => {
    try { opts.onError?.(message); } catch { /* */ }
    fireEnd();
    return null;
  };

  if (typeof window === "undefined") return null;
  const blob = await neuralSynthesize(engine, text, {
    settings: opts.settings,
    onError: opts.onError,
  });
  if (!blob) {
    fireEnd();
    return null;
  }

  stopNeural(); // una voz a la vez

  return await new Promise<HTMLAudioElement | null>((resolve) => {
    let settled = false;
    let url: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const cleanup = () => {
      if (url) {
        try { URL.revokeObjectURL(url); } catch { /* */ }
      }
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
    };
    const settle = (val: HTMLAudioElement | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    try {
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentAudio = audio;
      currentUrl = url;

      audio.onended = () => {
        cleanup();
        fireEnd();
        settle(audio);
      };
      audio.onerror = () => {
        cleanup();
        fail("Fallo al reproducir el audio del motor neural.");
        settle(null);
      };

      try { opts.onStart?.(); } catch { /* */ }

      const p = audio.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {
          cleanup();
          fail("El navegador bloqueó la reproducción (requiere gesto).");
          settle(null);
        });
      }
    } catch {
      cleanup();
      fail("No se pudo reproducir el audio del motor neural.");
      settle(null);
    }
  });
}

/** Detiene la reproducción neural en curso (si la hay). Idempotente. Nunca lanza. */
export function stopNeural(): void {
  try {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.onended = null;
        currentAudio.onerror = null;
        currentAudio.src = "";
      } catch { /* */ }
    }
    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch { /* */ }
    }
  } catch { /* */ } finally {
    currentAudio = null;
    currentUrl = null;
  }
}

/** ¿Está sonando un motor neural ahora mismo? */
export function isNeuralSpeaking(): boolean {
  return !!currentAudio && !currentAudio.paused;
}

// ── Disponibilidad (ping con caché 60 s) ─────────────────────────────────────

export type NeuralPingState = "ok" | "unreachable" | "no-endpoint";

interface PingCacheEntry {
  state: NeuralPingState;
  at: number;
}

const pingCache = new Map<string, PingCacheEntry>();

/**
 * ¿El servidor del motor responde? CUALQUIER respuesta HTTP (aunque sea 404)
 * cuenta como VIVO; si el fetch CORS revienta, se prueba en no-cors (una
 * respuesta opaca también prueba que hay servidor). Cache 60 s por
 * (motor, endpoint). `force` ignora la caché. NUNCA lanza.
 */
export async function pingNeuralEngine(
  engine: NeuralVoiceEngine,
  opts: { settings?: NeuralEngineSettings; force?: boolean } = {},
): Promise<NeuralPingState> {
  if (typeof window === "undefined") return "no-endpoint";
  const s = opts.settings ?? getEngineSettings(engine);
  const endpoint = normalizeEndpoint(s.endpoint);
  if (!endpoint) return "no-endpoint";

  const key = `${engine}::${endpoint}`;
  const hit = pingCache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < NEURAL_PING_TTL_MS) return hit.state;

  const state = await Promise.resolve()
    .then(async (): Promise<NeuralPingState> => {
      const controller = new AbortController();
      const killer = setTimeout(() => {
        try { controller.abort(); } catch { /* */ }
      }, 5_000);
      try {
        const base = endpoint.replace(/\/+$/, "");
        const probes = hasExplicitPath(endpoint)
          ? [endpoint]
          : [`${base}/`, `${base}/health`, `${base}/docs`];
        for (const url of probes) {
          // CORS normal primero (nos deja leer el estado)…
          const ok = await fetch(url, { method: "GET", signal: controller.signal })
            .then(() => true)
            .catch(async () => {
              // …y si el navegador lo bloquea, probamos opaco: si RESUELVE,
              // hay un servidor escuchando aunque no podamos leerlo.
              return fetch(url, { method: "GET", mode: "no-cors", signal: controller.signal })
                .then(() => true)
                .catch(() => false);
            });
          if (ok) return "ok";
        }
        return "unreachable";
      } finally {
        clearTimeout(killer);
      }
    })
    .catch((): NeuralPingState => "unreachable");

  pingCache.set(key, { state, at: Date.now() });
  return state;
}

/** ¿Motor configurado (tiene endpoint), sin mirar la red? Nunca lanza. */
export function neuralEngineConfigured(engine: NeuralVoiceEngine): boolean {
  try {
    return !!normalizeEndpoint(getEngineSettings(engine).endpoint);
  } catch {
    return false;
  }
}
