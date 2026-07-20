"use client";

/**
 * StarSeed OS — Motores de VOZ NEURAL por ENDPOINT.
 * (VoxCPM · Voicebox · Bark · GPT-SoVITS · OmniVoice)
 * ============================================================================
 * Los cinco son SERVIDORES (Python/FastAPI) que corren en una neurona propia,
 * en CasaOS, en el propio ordenador del usuario o en un host remoto — NUNCA en
 * el navegador. Este módulo es el cliente HTTP GENÉRICO y TOLERANTE que todos
 * comparten: POST JSON que devuelve audio, detección de disponibilidad (ping con
 * caché de 60 s) y reproducción por <audio> (mismo patrón que kokoro.ts).
 * SSR-safe, defensivo, NUNCA lanza.
 *
 * ── CONTRATO HTTP ESPERADO (tolerante: probamos las formas comunes) ─────────
 *
 * PETICIÓN — POST {endpoint}{ruta} con JSON. Si el endpoint configurado ya
 * incluye una ruta (p.ej. http://neurona:9880/tts), se usa TAL CUAL; si es solo
 * origen (http://neurona:9880), se prueban las rutas típicas de cada motor
 * dentro del presupuesto de tiempo del motor (ENGINE_TIMEOUT_MS):
 *
 *   · voxcpm (PRINCIPAL) → /v1/audio/speech · /tts · /generate · /api/tts · /synthesize
 *       VoxCPM2 (OpenBMB, Apache-2.0) se sirve de tres formas y las cubrimos todas:
 *         a) **vLLM-Omni** → API OpenAI-compatible `POST /v1/audio/speech`
 *            body { model, input, voice, response_format:"wav", speed } → audio binario.
 *            (Verificado en el README oficial de VoxCPM con `curl`.)
 *         b) **Nano-vLLM-VoxCPM** (deployment/) → `POST /generate`
 *            body { target_text, prompt_wav_base64|prompt_latents_base64, prompt_text,
 *                   ref_audio_wav_base64 } → MP3 en streaming (audio/mpeg).
 *         c) servidores comunitarios / Gradio (`python app.py --port 8808`) →
 *            /tts · /api/tts · /run/predict · /gradio_api/call/{fn} (2 pasos).
 *       Enviamos TODOS los alias a la vez (los servidores ignoran lo que no
 *       conocen): { text, input, target_text, model, voice, language, speed,
 *                   cfg_value, inference_timesteps, reference_wav_path,
 *                   prompt_wav_path, prompt_text }.
 *       DISEÑO DE VOZ: VoxCPM no tiene campo "emoción" — la voz se describe EN
 *       LENGUAJE NATURAL entre paréntesis AL INICIO DEL TEXTO:
 *         "(Voz femenina joven, cálida y serena)Hola, soy Aurora."
 *       Lo hace `decorateTextForVoxCPM()` a partir del preset/emoción activos.
 *       CLONACIÓN: `refAudio` (+`refText` para clonación "definitiva").
 *   · voicebox → /generate/stream (ÚNICA ruta que devuelve audio al navegador)
 *       jamiepine/voicebox (MIT) es una APP DE ESCRITORIO (Tauri) con backend
 *       FastAPI en 127.0.0.1:17493. Su `POST /generate` y `POST /speak` son
 *       ASÍNCRONOS (devuelven una fila `Generation` y hay que sondear SSE; además
 *       /speak suena en los altavoces DEL PC, no en el navegador). La ruta útil
 *       para Aurora es `POST /generate/stream` → **audio/wav en streaming**.
 *       body { profile_id (OBLIGATORIO), text, language (2 letras del enum),
 *              engine, model_size, instruct, seed, normalize, max_chunk_chars,
 *              crossfade_ms }.
 *       ⚠️ DOS REQUISITOS REALES (no se pueden fingir):
 *         1) `profile_id` — un perfil de voz creado en la app (GET /profiles).
 *         2) CORS — su allowlist por defecto solo trae localhost/tauri. Para que
 *            el OS pueda llamarlo desde el navegador hay que arrancar Voicebox con
 *            `VOICEBOX_CORS_ORIGINS=https://starseed-os.vercel.app`.
 *       Sin esas dos cosas el motor DECLINA y la cadena sigue (Aurora nunca calla).
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
 *   · estilo Gradio: { data: [ { name | url | data } , ... ] }, tanto en el
 *     legado `/run/predict` como en el 2-pasos moderno `/gradio_api/call/{fn}`
 *     (POST → {event_id} → GET SSE → payload final).
 *
 * TIMEOUT: por motor (ENGINE_TIMEOUT_MS) — 45 s para VoxCPM/Voicebox (modelos
 * grandes que además pueden estar cargándose), 20 s para el resto.
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
import type { OpenVoice2SeedSpec } from "@/lib/aurora/tts-oss/openvoice2";
import {
  decorateTextForBark,
  decorateTextForVoxCPM,
  deliveryInstruction,
  engineStyleOverrides,
  passthroughParams,
  resolveVoiceParams,
  voiceDesignPrompt,
  type ResolvedVoiceParams,
} from "@/lib/aurora/tts-oss/voice-style";

// ── Constantes ───────────────────────────────────────────────────────────────

/** Presupuesto por defecto por locución (petición + descarga), en ms. */
export const NEURAL_TTS_TIMEOUT_MS = 20_000;

/**
 * Presupuesto por MOTOR. VoxCPM (2B, difusión) y Voicebox (carga el modelo en la
 * primera petición) necesitan más aire que un Bark ya calentito: si nos quedamos
 * cortos, abortaríamos una locución que iba a llegar y Aurora sonaría peor de lo
 * que puede. 45 s es el techo; el fallback sigue vivo si se agota.
 */
export const ENGINE_TIMEOUT_MS: Record<NeuralVoiceEngine, number> = {
  voxcpm: 45_000,
  voicebox: 45_000,
  bark: 20_000,
  "gpt-sovits": 20_000,
  omnivoice: 20_000,
  // OpenVoice V2 gestiona sus propios presupuestos dentro de su cliente (cola +
  // cold start del Space); este valor es un techo nominal (no se usa: se delega).
  openvoice2: 120_000,
};

/** TTL de la caché de disponibilidad (ping), en ms. */
export const NEURAL_PING_TTL_MS = 60_000;

/** Rutas candidatas por motor cuando el endpoint es solo origen. */
const ENGINE_PATHS: Record<NeuralVoiceEngine, string[]> = {
  // OpenAI-compatible primero (vLLM-Omni: la forma OFICIAL de servir VoxCPM2 en
  // producción), luego las rutas de los servidores comunitarios / nano-vLLM.
  voxcpm: ["/v1/audio/speech", "/tts", "/generate", "/api/tts", "/synthesize"],
  // Voicebox: /generate/stream es la ÚNICA que devuelve audio (las demás son
  // asíncronas y suenan en los altavoces del PC, no en el navegador).
  voicebox: ["/generate/stream"],
  bark: ["/generate", "/tts", "/api/tts"],
  "gpt-sovits": ["/tts", "/", "/api/tts"],
  omnivoice: ["/tts", "/generate", "/api/tts"],
  // OpenVoice V2 no usa POST JSON directo: habla por el protocolo de cola de su
  // Space (openvoice2.ts). Sin rutas → nunca entra en el bucle de candidateUrls.
  openvoice2: [],
};

/**
 * Funciones de Gradio a probar (2 pasos) cuando el POST JSON directo no cuela.
 * Solo para VoxCPM: su demo oficial (`python app.py --port 8808`) es un Gradio.
 * Es un intento BEST-EFFORT: si el nombre de la función no coincide, declina en
 * silencio y la cadena de fallback sigue.
 */
const GRADIO_FNS: Partial<Record<NeuralVoiceEngine, string[]>> = {
  voxcpm: ["generate", "predict", "tts"],
};

/** Metadatos de presentación por motor (etiquetas para UI y herramientas). */
export const NEURAL_ENGINE_META: Record<
  NeuralVoiceEngine,
  { label: string; hint: string; voicePlaceholder: string; defaultVoice: string; repo: string }
> = {
  voxcpm: {
    label: "VoxCPM (principal · realista)",
    hint: "Tokenizer-free de OpenBMB: 30 idiomas, 48 kHz, diseña la voz con palabras y clona",
    voicePlaceholder: "voz/preset del servidor (opcional)",
    // Sin preset: VoxCPM define la voz por DESCRIPCIÓN (voiceDesign) o por
    // audio de referencia (refAudio). Dejarlo vacío = voz por defecto del server.
    defaultVoice: "",
    repo: "https://github.com/OpenBMB/VoxCPM",
  },
  voicebox: {
    label: "Voicebox (estudio local)",
    hint: "App de escritorio con API REST: perfiles de voz clonados (necesita profile_id + CORS)",
    voicePlaceholder: "id del perfil de voz (profile_id)",
    defaultVoice: "",
    repo: "https://github.com/jamiepine/voicebox",
  },
  bark: {
    label: "Bark (generativa)",
    hint: "TTS expresivo de Suno: entona, ríe y suspira",
    voicePlaceholder: "v2/es_speaker_1",
    // Preset español CÁLIDO por defecto: al activar Bark de un toque ya suena
    // bien sin configurar (ajustable a otro speaker en Ajustes → Voz).
    defaultVoice: "v2/es_speaker_1",
    repo: "https://github.com/suno-ai/bark",
  },
  "gpt-sovits": {
    label: "GPT-SoVITS (clonación)",
    hint: "Clona una voz con ~5 s de muestra (refAudio)",
    voicePlaceholder: "id de voz (opcional)",
    defaultVoice: "", // clonación: la voz la define refAudio, no un preset
    repo: "https://github.com/RVC-Boss/GPT-SoVITS",
  },
  omnivoice: {
    label: "OmniVoice (multilingüe)",
    hint: "Voz neural k2-fsa · Next-gen Kaldi",
    voicePlaceholder: "sid o nombre de voz",
    defaultVoice: "", // el servidor elige su voz por defecto si no se indica
    repo: "https://github.com/k2-fsa/OmniVoice",
  },
  openvoice2: {
    label: "OpenVoice V2 (web, sin instalar)",
    hint: "Voz de nube gratis (Space de MyShell): clona timbre a partir de una semilla o de tu audio",
    voicePlaceholder: "estilo (en_br, es_default…)",
    defaultVoice: "", // el estilo/semilla los resuelve el cliente openvoice2.ts
    repo: "https://github.com/myshell-ai/OpenVoice",
  },
};

/** Puerto por defecto del backend de Voicebox (127.0.0.1:17493). */
export const VOICEBOX_DEFAULT_ENDPOINT = "http://127.0.0.1:17493";
/** Modelo por defecto de VoxCPM cuando se sirve por vLLM-Omni (`--omni`). */
export const VOXCPM_DEFAULT_MODEL = "openbmb/VoxCPM2";

/**
 * Idiomas que el backend de Voicebox ACEPTA (patrón estricto de su Pydantic: si
 * mandamos "es-ES" responde 422). Lista literal de su `GenerationRequest`.
 */
const VOICEBOX_LANGS = [
  "zh", "en", "ja", "ko", "de", "fr", "ru", "pt", "es", "it", "he", "ar",
  "da", "el", "fi", "hi", "ms", "nl", "no", "pl", "sv", "sw", "tr",
] as const;

/** Motores internos válidos de Voicebox (su patrón Pydantic los valida). */
const VOICEBOX_ENGINES = [
  "qwen", "qwen_custom_voice", "luxtts", "chatterbox", "chatterbox_turbo", "tada", "kokoro",
] as const;

/** Normaliza un idioma a las 2 letras que Voicebox acepta ("es-ES" → "es"). */
function voiceboxLang(lang: string | undefined): string {
  const base = (lang || "es").trim().toLowerCase().slice(0, 2);
  return (VOICEBOX_LANGS as readonly string[]).includes(base) ? base : "en";
}

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

  // ── Voicebox: cuerpo ESTRICTO (su Pydantic valida idioma y motor con regex;
  //    un valor fuera de patrón = 422 y ni siquiera intenta hablar). No metemos
  //    los alias genéricos aquí: `profile_id` manda y el resto son sus campos.
  if (engine === "voicebox") {
    const engineName =
      s.model && (VOICEBOX_ENGINES as readonly string[]).includes(s.model)
        ? s.model
        : undefined;
    const instruct = deliveryInstruction(s.instruct);
    const vb: Record<string, unknown> = {
      // El perfil de voz es OBLIGATORIO en Voicebox. `profileId` es lo canónico;
      // aceptamos también `voice` por si el usuario pegó el id ahí (mismo dato).
      profile_id: s.profileId || s.voice || "",
      text,
      language: voiceboxLang(s.lang),
      normalize: true,
    };
    if (engineName) vb.engine = engineName;
    if (instruct) vb.instruct = instruct.slice(0, 500);
    return vb;
  }

  const body: Record<string, unknown> = {
    text,
    ...passthroughParams(engine, params),
  };

  if (engine === "voxcpm") {
    // VoxCPM se sirve de tres formas distintas → mandamos los alias de las tres
    // en el MISMO JSON (cada servidor lee los suyos e ignora el resto):
    //   · vLLM-Omni (OpenAI):   { model, input, voice, response_format, speed }
    //   · nano-vLLM deployment: { target_text, prompt_text, ... }
    //   · comunitarios/Gradio:  { text, language, cfg_value, inference_timesteps }
    body.input = text; // OpenAI: el texto va en `input`
    body.target_text = text; // nano-vLLM
    body.model = s.model || VOXCPM_DEFAULT_MODEL;
    body.response_format = "wav";
    body.language = lang;
    body.lang = lang;
    // Voz/preset del servidor (opcional): en VoxCPM la voz se define por
    // DESCRIPCIÓN (ya inyectada en el texto) o por audio de referencia, pero la
    // API OpenAI exige el campo `voice` → mandamos "default" si no hay nada.
    body.voice = s.voice || "default";
    // Parámetros propios del modelo (valores del README oficial).
    body.cfg_value = 2.0;
    body.inference_timesteps = 10;
    // CLONACIÓN: referencia aislada (reference_wav_path) y/o continuación
    // (prompt_wav_path + prompt_text = "clonación definitiva").
    if (s.refAudio) {
      body.reference_wav_path = s.refAudio;
      body.prompt_wav_path = s.refAudio;
      body.ref_audio_path = s.refAudio; // alias tolerante
    }
    if (s.refText) body.prompt_text = s.refText;
    return body;
  }

  if (engine === "bark") {
    // Servidores comunitarios de Bark: preset de voz bajo varios nombres.
    // Si el usuario no fijó ninguno, usamos el preset español cálido por defecto
    // (NEURAL_ENGINE_META) para que "un toque" ya suene bien.
    body.prompt = text;
    const barkVoice = s.voice || NEURAL_ENGINE_META.bark.defaultVoice;
    if (barkVoice) {
      body.voice = barkVoice;
      body.speaker = barkVoice;
      body.voice_preset = barkVoice;
      body.history_prompt = barkVoice;
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

  // OpenVoice V2 (web, sin instalar): motor de NUBE integrado (como el híbrido
  // OmniVoice) — no es un endpoint del usuario. Se delega SIEMPRE a su cliente,
  // que gestiona la cola del Space, la semilla de identidad y el fallback honesto.
  if (engine === "openvoice2") {
    return await delegateOpenVoice2(clean, s, opts.onError);
  }

  const endpoint = normalizeEndpoint(s.endpoint);
  if (!endpoint) {
    // OmniVoice sin endpoint manual = MODO HÍBRIDO INTEGRADO (daemon local ↔ nube).
    if (engine === "omnivoice") {
      return await delegateOmniHybrid(clean, s);
    }
    try {
      opts.onError?.(`El motor ${NEURAL_ENGINE_META[engine].label} no tiene endpoint configurado.`);
    } catch { /* */ }
    return null;
  }

  // Voicebox EXIGE un perfil de voz: sin él, su backend responde 404 y no habría
  // audio. Mejor declinar aquí con un mensaje útil que gastar el presupuesto.
  if (engine === "voicebox" && !(s.profileId || s.voice)) {
    try {
      opts.onError?.(
        "Voicebox necesita un perfil de voz (profile_id). Crea uno en la app y elígelo en Ajustes → Voz.",
      );
    } catch { /* */ }
    return null;
  }

  // Modulación emocional resuelta (estilo persistido + overrides del motor).
  const params = resolveVoiceParams({ engineOverrides: engineStyleOverrides(engine) });
  // Cada motor recibe la emoción como MEJOR la entienda:
  //   · Bark   → etiquetas [laughs]/[sighs] EN el texto (con moderación).
  //   · VoxCPM → DISEÑO DE VOZ en lenguaje natural entre paréntesis al inicio.
  //   · resto  → números (speed/pitch/energy) por passthrough.
  const finalText =
    engine === "bark"
      ? decorateTextForBark(clean, params.emotion)
      : engine === "voxcpm"
        ? decorateTextForVoxCPM(clean, voiceDesignPrompt(s.voiceDesign))
        : clean;
  const body = buildBody(engine, finalText, s, params);

  const budget = ENGINE_TIMEOUT_MS[engine] ?? NEURAL_TTS_TIMEOUT_MS;
  const controller = new AbortController();
  const deadline = Date.now() + budget;
  const killer = setTimeout(() => {
    try { controller.abort(); } catch { /* */ }
  }, budget);

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

    // Último intento: interfaz Gradio (la demo oficial de VoxCPM es un Gradio).
    // Ojo: al Gradio se le pasa el texto LIMPIO y la descripción de voz POR
    // SEPARADO (tiene un campo `control_instruction` propio), no el texto con
    // los paréntesis inyectados.
    if (engine === "voxcpm" && !hasExplicitPath(endpoint) && Date.now() < deadline) {
      const viaGradio = await tryGradioVoxCPM(
        endpoint,
        clean,
        voiceDesignPrompt(s.voiceDesign),
        s,
        controller.signal,
      ).catch(() => null);
      if (viaGradio) return viaGradio;
    }

    // OmniVoice: si el endpoint MANUAL del usuario no dio audio, cae al HÍBRIDO
    // integrado (daemon local ↔ nube gratis) antes de rendirse. Aurora igual habla.
    if (engine === "omnivoice") {
      const viaHybrid = await delegateOmniHybrid(clean, s);
      if (viaHybrid) return viaHybrid;
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

// ── Gradio de VoxCPM (contrato VERIFICADO contra el Space oficial) ───────────

/**
 * Argumentos POSICIONALES de la función `/generate` del Gradio oficial de VoxCPM.
 * VERIFICADO EN VIVO (2026-07-13) contra `openbmb-voxcpm-demo.hf.space`, leyendo
 * su `GET /gradio_api/info`:
 *
 *   [0] text_input             string   — el texto a hablar
 *   [1] control_instruction    string   — DISEÑO/CONTROL de voz en lenguaje natural
 *   [2] reference_wav_path     Audio    — audio de referencia (null = sin clonar)
 *   [3] use_prompt_text        bool
 *   [4] prompt_text_input      string   — transcripción de la referencia
 *   [5] cfg_value_input        number   — 2.0 por defecto
 *   [6] do_normalize           bool
 *   [7] denoise                bool
 *
 * Devuelve un componente Audio → FileData { path, url, orig_name, mime_type }.
 *
 * OJO: aquí el diseño de voz NO va entre paréntesis dentro del texto (eso es el
 * contrato de la API Python); el Gradio tiene su propio campo `control_instruction`.
 * Por eso esta función recibe texto y diseño POR SEPARADO.
 *
 * La referencia de audio va en `null`: subir un fichero a un Gradio exige el flujo
 * de upload (multipart a /gradio_api/upload) y una ruta del servidor. Con Gradio,
 * pues, VoxCPM funciona en modo DISEÑO DE VOZ (que es su superpoder), no clonando.
 * Para clonar, usa vLLM-Omni o Nano-vLLM (que sí aceptan rutas/base64).
 */
function voxcpmGradioData(
  text: string,
  design: string,
  s: NeuralEngineSettings,
): unknown[] {
  const control = (design || deliveryInstruction(s.instruct) || "").slice(0, 300);
  return [text, control, null, false, "", 2.0, false, false];
}

/**
 * Extrae el audio de un FileData de Gradio. Su `url` suele ser absoluta (Spaces),
 * pero en un Gradio local puede venir vacía y solo traer `path` — que es una RUTA
 * DEL SERVIDOR, no una URL: hay que pedirla por `/gradio_api/file={path}`
 * (Gradio 5) o `/file={path}` (Gradio 3/4). Nunca lanza.
 */
async function gradioFileToBlob(
  item: any,
  endpoint: string,
  signal: AbortSignal,
): Promise<Blob | null> {
  if (!item || typeof item !== "object") return null;
  const base = endpoint.replace(/\/+$/, "");
  const candidates: string[] = [];
  const url = typeof item.url === "string" ? item.url : "";
  const path = typeof item.path === "string" ? item.path : "";
  const name = typeof item.name === "string" ? item.name : "";
  if (url) candidates.push(/^https?:\/\//i.test(url) ? url : resolveUrl(url, endpoint));
  for (const p of [path, name]) {
    if (!p) continue;
    if (/^https?:\/\//i.test(p)) {
      candidates.push(p);
      continue;
    }
    candidates.push(`${base}/gradio_api/file=${encodeURI(p)}`);
    candidates.push(`${base}/file=${encodeURI(p)}`);
  }
  for (const c of candidates) {
    if (!c) continue;
    const blob = await fetchAudioUrl(c, signal);
    if (blob) return blob;
  }
  return null;
}

/**
 * Habla por la interfaz GRADIO de VoxCPM (su demo oficial: `python app.py`).
 * Dos protocolos, en orden:
 *   · moderno (Gradio 5): POST /gradio_api/call/{fn} {data:[...]} → {event_id}
 *       → GET /gradio_api/call/{fn}/{event_id} (SSE) → `data: [ FileData ]`
 *   · legado (Gradio 3/4): POST /run/predict {data:[...], fn_index:0} → {data:[...]}
 *
 * VERIFICADO con `curl` contra el Space oficial: el paso 1 devuelve `event_id` tal
 * y como esperamos, y `/gradio_api/info` confirma la función `/generate` y el orden
 * de sus 8 parámetros. Si un servidor concreto expone otra función u otro orden,
 * esto declina en silencio y la CADENA DE FALLBACK sigue: nunca deja a Aurora muda
 * ni lanza.
 */
async function tryGradioVoxCPM(
  endpoint: string,
  text: string,
  design: string,
  s: NeuralEngineSettings,
  signal: AbortSignal,
): Promise<Blob | null> {
  const fns = GRADIO_FNS.voxcpm ?? ["generate"];
  const base = endpoint.replace(/\/+$/, "");
  const data = voxcpmGradioData(text, design, s);

  // 1) Moderno: /gradio_api/call/{fn} (dos pasos). Es el que usa VoxCPM hoy.
  for (const fn of fns) {
    const blob = await Promise.resolve()
      .then(async () => {
        const post = await fetch(`${base}/gradio_api/call/${fn}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data }),
          signal,
        });
        if (!post.ok) return null;
        const started = await post.json().catch(() => null);
        const eventId =
          started && typeof started === "object"
            ? ((started as any).event_id ?? (started as any).eventId)
            : null;
        if (typeof eventId !== "string" || !eventId) return null;

        const sse = await fetch(`${base}/gradio_api/call/${fn}/${eventId}`, {
          method: "GET",
          signal,
        });
        if (!sse.ok) return null;
        const raw = await sse.text();
        // El stream trae líneas "event: complete" + "data: [ ... ]".
        // Nos quedamos con el ÚLTIMO payload JSON parseable.
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
        if (!Array.isArray(last)) {
          return last ? await audioFromJson(last, endpoint, signal) : null;
        }
        for (const item of last) {
          const viaFile = await gradioFileToBlob(item, endpoint, signal);
          if (viaFile) return viaFile;
        }
        return await audioFromJson({ data: last }, endpoint, signal);
      })
      .catch(() => null);
    if (blob) return blob;
  }

  // 2) Legado: /run/predict (Gradio 3/4, una sola llamada).
  return await Promise.resolve()
    .then(async () => {
      const res = await fetch(`${base}/run/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, fn_index: 0 }),
        signal,
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const arr = Array.isArray((json as any)?.data) ? (json as any).data : null;
      if (arr) {
        for (const item of arr) {
          const viaFile = await gradioFileToBlob(item, endpoint, signal);
          if (viaFile) return viaFile;
        }
      }
      return await audioFromJson(json, endpoint, signal);
    })
    .catch(() => null);
}

// ── Reproducción por <audio> (una a la vez, patrón kokoro.ts) ────────────────

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/**
 * MODULACIÓN SUTIL de la reproducción por la EMOCIÓN PERCIBIDA del usuario
 * (Adenda V2-VOZ). Lee la instantánea compartida que mantiene `audio-emotion.ts`
 * en `window.STARSEED_userVoiceEmotion` (sin acoplar el módulo) y devuelve
 * multiplicadores de velocidad/volumen dentro de los límites del contrato
 * (±8% velocidad · ±15% volumen). Interconexión viva entre Aurora y Hermione:
 * ambas leen la MISMA emoción compartida. Con guardas; null = sin cambios.
 */
function emotionPlaybackMod(): { rate: number; volume: number } | null {
  try {
    if (typeof window === "undefined") return null;
    const e = (
      window as unknown as {
        STARSEED_userVoiceEmotion?: { mood?: string; confidence?: number };
      }
    ).STARSEED_userVoiceEmotion;
    if (!e || typeof e.confidence !== "number" || e.confidence < 0.35) return null;
    let rate = 1;
    let volume = 1;
    switch (e.mood) {
      case "alegre":
        rate = 1.06;
        volume = 1.12;
        break;
      case "enérgico":
        rate = 1.08;
        volume = 1.15;
        break;
      case "tenso":
        rate = 1.04;
        volume = 1.06;
        break;
      case "triste":
        rate = 0.93;
        volume = 0.88;
        break;
      case "sereno":
        rate = 0.96;
        volume = 0.95;
        break;
      default:
        return null; // neutral → sin modulación
    }
    rate = Math.max(0.92, Math.min(1.08, rate));
    volume = Math.max(0.85, Math.min(1.15, volume));
    return { rate, volume };
  } catch {
    return null;
  }
}

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
/**
 * Trocea un texto largo en LOCUCIONES de tamaño hablable (Adenda 82): corta por
 * finales de frase acumulando hasta ~maxLen; una frase kilométrica se parte por
 * comas/espacios. PURO y testeable. Nunca devuelve trozos vacíos.
 */
export function splitTextForVoice(text: string, maxLen = 220): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const sentences = clean.match(/[^.!?…]+[.!?…]+["»”)]?\s*|[^.!?…]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  const push = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = "";
  };
  for (const s of sentences) {
    if ((cur + s).length <= maxLen) {
      cur += s;
      continue;
    }
    push();
    if (s.length <= maxLen) {
      cur = s;
      continue;
    }
    // Frase gigante: parte por comas; si aún excede, por palabras a lo bruto.
    let piece = "";
    for (const frag of s.split(/(?<=,)\s*/)) {
      if ((piece + frag).length <= maxLen) {
        piece += frag + " ";
        continue;
      }
      if (piece.trim()) out.push(piece.trim());
      piece = "";
      if (frag.length <= maxLen) {
        piece = frag + " ";
      } else {
        for (let i = 0; i < frag.length; i += maxLen) out.push(frag.slice(i, i + maxLen).trim());
      }
    }
    if (piece.trim()) cur = piece;
  }
  push();
  return out.filter(Boolean);
}

/** Generación de reproducción troceada en curso (stopNeural la invalida). */
let chunkGeneration = 0;

/**
 * Reproduce UN Blob neural (con la modulación emocional sutil de V2-VOZ) y,
 * si `waitEnd`, espera a que termine. Registra el audio como el actual para
 * que stopNeural() lo corte. Devuelve el elemento (o null si el navegador
 * bloqueó la reproducción). Nunca lanza.
 */
function playNeuralBlob(
  blob: Blob,
  opts: { onStart?: () => void; onError?: (m: string) => void; waitEnd?: boolean },
): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
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
    const settle = (v: HTMLAudioElement | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentAudio = audio;
      currentUrl = url;
      audio.onended = () => {
        cleanup();
        settle(audio);
      };
      audio.onerror = () => {
        cleanup();
        try { opts.onError?.("Fallo al reproducir el audio del motor neural."); } catch { /* */ }
        settle(null);
      };
      try {
        const mod = emotionPlaybackMod();
        if (mod) {
          audio.playbackRate = mod.rate;
          try {
            (audio as unknown as { preservesPitch?: boolean }).preservesPitch = false;
          } catch { /* */ }
          audio.volume = mod.volume;
        }
      } catch { /* */ }
      try { opts.onStart?.(); } catch { /* */ }
      const p = audio.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {
          cleanup();
          try { opts.onError?.("El navegador bloqueó la reproducción (requiere gesto)."); } catch { /* */ }
          settle(null);
        });
      }
      if (!opts.waitEnd) settle(audio);
    } catch {
      cleanup();
      settle(null);
    }
  });
}

/**
 * Habla TROCEADA (Adenda 82): sintetiza y reproduce frase a frase, prefetching
 * el siguiente trozo MIENTRAS suena el actual — así una respuesta larga empieza
 * a oírse con la latencia de UNA frase y los Spaces CPU pueden con todo.
 * Si el PRIMER trozo no sale → null (la cadena de voz sigue con el texto entero).
 * Si un trozo intermedio falla, termina con dignidad (lo dicho, dicho está).
 */
async function neuralSpeakChunked(
  engine: NeuralVoiceEngine,
  chunks: string[],
  opts: NeuralSpeakOptions,
): Promise<HTMLAudioElement | null> {
  const myGen = ++chunkGeneration;
  const alive = () => myGen === chunkGeneration;
  const synth = (t: string) =>
    neuralSynthesize(engine, t, { settings: opts.settings }).catch(() => null);

  const first = await synth(chunks[0]);
  if (!first || !alive()) return null;

  let firstAudio: HTMLAudioElement | null = null;
  let next: Promise<Blob | null> = chunks.length > 1 ? synth(chunks[1]) : Promise.resolve(null);

  for (let i = 0; i < chunks.length; i++) {
    if (!alive()) break;
    const blob = i === 0 ? first : await next;
    if (!alive()) break;
    if (!blob) break; // trozo intermedio falló: cerramos con lo ya hablado
    // Prefetch del siguiente MIENTRAS suena este.
    next = i + 1 < chunks.length ? synth(chunks[i + 1]) : Promise.resolve(null);
    const audio = await playNeuralBlob(blob, {
      onStart: i === 0 ? opts.onStart : undefined,
      onError: i === 0 ? opts.onError : undefined,
      waitEnd: true,
    });
    if (i === 0) {
      if (!audio) return null; // el navegador bloqueó la reproducción
      firstAudio = audio;
    }
  }
  try { opts.onEnd?.(); } catch { /* */ }
  return firstAudio;
}

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

  // RESPUESTAS LARGAS por OpenVoice → habla TROCEADA (Adenda 82): los Spaces
  // gratis (CPU) no pueden sintetizar 2.000 caracteres de una pieza dentro del
  // presupuesto; frase a frase sí — y el primer sonido llega en segundos.
  // Trocear también OMNIVOICE (Adenda 85): el daemon local sintetiza una FRASE
  // en segundos (y cachea), pero un parrafón agota su presupuesto y la nube
  // gratis igual. Frase a frase, el motor local por fin puede con turnos reales.
  if (engine === "openvoice2" || engine === "omnivoice") {
    const chunks = splitTextForVoice(text);
    if (chunks.length > 1) {
      stopNeural(); // una voz a la vez (invalida troceos previos)
      return await neuralSpeakChunked(engine, chunks, opts);
    }
  }

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

      // Modulación SUTIL por la emoción percibida del usuario (V2-VOZ).
      try {
        const mod = emotionPlaybackMod();
        if (mod) {
          audio.playbackRate = mod.rate;
          // Dejar que el tono acompañe la velocidad (matiz expresivo, sutil).
          try {
            (audio as unknown as { preservesPitch?: boolean }).preservesPitch = false;
          } catch { /* */ }
          audio.volume = mod.volume;
        }
      } catch { /* */ }

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
  chunkGeneration++; // invalida cualquier habla troceada en curso (Adenda 82)
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

/**
 * ¿Motor configurado y USABLE sin mirar la red? Nunca lanza.
 * "Usable" = tiene endpoint Y cumple sus requisitos duros:
 *   · voicebox → además necesita `profileId` (su API lo exige; sin él es un 404
 *     garantizado, así que declararlo "configurado" sería mentir).
 */
export function neuralEngineConfigured(engine: NeuralVoiceEngine): boolean {
  try {
    // OmniVoice HÍBRIDO (Adenda 77-voz): motor integrado con CERO config — habla
    // por el daemon local (127.0.0.1:4444) o por la nube gratis (HF Space). Está
    // SIEMPRE "configurado", tenga o no un endpoint manual el usuario.
    if (engine === "omnivoice") return true;
    // OpenVoice V2 (web): Space integrado, CERO config → siempre "configurado".
    if (engine === "openvoice2") return true;
    const s = getEngineSettings(engine);
    if (!normalizeEndpoint(s.endpoint)) return false;
    if (engine === "voicebox" && !(s.profileId || s.voice)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Delega en el MOTOR HÍBRIDO OmniVoice (daemon local ↔ nube gratis). Se usa
 * cuando el usuario no puso un endpoint OmniVoice propio (CERO config) o cuando
 * su endpoint no devolvió audio. NUNCA lanza.
 */
async function delegateOmniHybrid(
  text: string,
  s: NeuralEngineSettings,
): Promise<Blob | null> {
  try {
    const { synthesizeOmniVoiceHybrid } = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
    return await synthesizeOmniVoiceHybrid(text, { lang: s.lang }).catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Delega en el cliente OPENVOICE V2 (Space web, sin instalar). Resuelve la config
 * EFECTIVA de OmniVoice (cuenta + personalidad → sub-esquema `openvoice`) y la
 * personalidad activa (para la semilla de identidad, el estilo y el aprendizaje
 * por voz). NUNCA lanza; null ⇒ la cadena de voz sigue.
 */
async function delegateOpenVoice2(
  text: string,
  s: NeuralEngineSettings,
  onError?: (message: string) => void,
): Promise<Blob | null> {
  try {
    const [{ synthesizeOpenVoice2 }, hybrid] = await Promise.all([
      import("@/lib/aurora/tts-oss/openvoice2"),
      import("@/lib/aurora/tts-oss/omnivoice-hybrid"),
    ]);
    const omni = await hybrid.resolveActiveOmni().catch(() => null);
    const ov = omni?.openvoice;

    let personalityId: string | undefined;
    let seedAttrs: OpenVoice2SeedSpec | undefined;
    try {
      const mod = await import("@/lib/aurora/personalities");
      const profile = mod.getActivePersonality?.();
      personalityId = profile?.id;
      // Semilla ad-hoc (para personalidades sin semilla curada): usa SU diseño de
      // voz, INSPIRADO en su arquetipo — jamás audio real de nadie.
      if (profile && typeof mod.mapPersonalityToDesign === "function") {
        seedAttrs = {
          attrs: mod.mapPersonalityToDesign(profile),
          instruct:
            (profile.voiceStyle?.omni?.instruct as string | undefined) ||
            profile.voiceStyle?.tone ||
            "",
          lang: profile.idioma || s.lang || "es",
          text: "",
        };
      }
    } catch {
      /* sin personalidades → manda la cuenta */
    }

    const blob = await synthesizeOpenVoice2(text, {
      lang: s.lang,
      personalityId,
      styleHint: ov?.style,
      useSeed: ov?.use_seed,
      seedVersion: ov?.seed_version,
      seedAttrs,
    }).catch(() => null);

    if (!blob) {
      try {
        onError?.(
          "OpenVoice V2 no devolvió audio (Space dormido o fuera de servicio); la cadena de voz sigue.",
        );
      } catch {
        /* */
      }
    }
    return blob;
  } catch {
    return null;
  }
}

// ── Voicebox: perfiles de voz reales del servidor ────────────────────────────

/** Un perfil de voz de Voicebox (`GET /profiles`). */
export interface VoiceboxProfile {
  id: string;
  name: string;
  language?: string;
  description?: string;
}

/**
 * Lista los PERFILES DE VOZ de un Voicebox vivo (`GET /profiles`). Los usa el
 * Centro de Configuración para que el usuario elija su voz clonada de una lista
 * real en vez de pegar un uuid a mano. [] si no hay servidor, no hay CORS o la
 * respuesta no se entiende. NUNCA lanza.
 */
export async function listVoiceboxProfiles(
  endpointOverride?: string,
): Promise<VoiceboxProfile[]> {
  if (typeof window === "undefined") return [];
  const endpoint = normalizeEndpoint(
    endpointOverride ?? getEngineSettings("voicebox").endpoint ?? VOICEBOX_DEFAULT_ENDPOINT,
  );
  if (!endpoint) return [];
  const base = endpoint.replace(/\/+$/, "").replace(/\/generate(\/stream)?$/, "");
  return await Promise.resolve()
    .then(async () => {
      const controller = new AbortController();
      const killer = setTimeout(() => {
        try { controller.abort(); } catch { /* */ }
      }, 6_000);
      try {
        const res = await fetch(`${base}/profiles`, { method: "GET", signal: controller.signal });
        if (!res.ok) return [];
        const json = await res.json().catch(() => null);
        const arr = Array.isArray(json)
          ? json
          : Array.isArray((json as any)?.profiles)
            ? (json as any).profiles
            : [];
        const out: VoiceboxProfile[] = [];
        for (const p of arr) {
          if (!p || typeof p !== "object") continue;
          const id = typeof (p as any).id === "string" ? (p as any).id : "";
          if (!id) continue;
          out.push({
            id,
            name: typeof (p as any).name === "string" ? (p as any).name : id,
            language: typeof (p as any).language === "string" ? (p as any).language : undefined,
            description:
              typeof (p as any).description === "string" ? (p as any).description : undefined,
          });
        }
        return out;
      } finally {
        clearTimeout(killer);
      }
    })
    .catch(() => []);
}
