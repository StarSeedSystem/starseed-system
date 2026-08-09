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
  currentPreferredVoiceGender,
  type NeuralEngineSettings,
  type NeuralVoiceEngine,
  type VoiceGenderPref,
} from "@/lib/aurora/tts-oss/voice-config";
import { listBrowserVoices, rankBrowserVoices } from "@/lib/aurora/tts-oss/browser-voices";
import type { OpenVoiceEndpoint } from "@/lib/aurora/tts-oss/openvoice2";
import {
  cachedSynthesis,
  clearVoiceIdentity,
  getVoiceIdentity,
  lockVoiceIdentityEndpoint,
  markVoiceIdentitySpoke,
  nextVoiceIdentityToken,
  setVoiceIdentity,
  synthCacheKey,
  voiceIdentityFingerprint,
  type FrozenVoiceIdentity,
} from "@/lib/aurora/tts-oss/voice-identity";
// SOLO TIPO (se borra al compilar): ni acopla el módulo ni crea ciclos — las
// personalidades se siguen resolviendo con `import()` dinámico donde hacen falta.
import type { PersonalityProfile } from "@/lib/aurora/personalities";
import type { OmniRouteDecision } from "@/lib/aurora/tts-oss/omnivoice-hybrid";
import { omnivoiceWebSynthesize } from "@/lib/aurora/tts-oss/omnivoice-web-router";
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
  // OpenVoice V2 gestiona su propio presupuesto POR INTENTO dentro de su
  // cliente (cola + cold start del Space). El Space gratis de HF tarda
  // HASTA ~120 s en el primer arranque en frío (QUEUE_TIMEOUT_FIRST_MS) antes
  // de devolver audio; un tope de 35 s abortaba la síntesis ANTES de que el
  // Space despertara → el frontend recibía null y la cadena caía a Kokoro
  // (el bug "sigue respondiendo Kokoro" en neuronas SIN daemon local: la
  // Adenda 93 arregló el daemon pero NO esta ruta web). Por eso el tope TOTAL
  // del turno corto debe ser >= el cold start del Space (120 s). Para no
  // colgar la UI si el Space ESTÁ MUERTO de verdad, `synthesizeOpenVoice2`
  // detecta el fallo de conexión/cola rota y corta por su cuenta (y la cadena
  // pasa a Kokoro femenino) mucho antes de agotar este techo. 120 s = "espera a
  // OpenVoice de verdad" en frío; en caliente (~60 s) queda holgado.
  openvoice2: 120_000,
  // xAI (grok-voice) habla por WebSocket realtime (xai-voice-agent.ts), no por
  // HTTP: este presupuesto solo aplica si algún día se enruta por aquí.
  xai: 30_000,
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
  // xAI: WebSocket realtime vía proxy/token (nunca HTTP TTS) → sin rutas.
  xai: [],
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
    label: "OmniVoice k2-fsa (motor)",
    hint: "Voz neural k2-fsa · Next-gen Kaldi",
    voicePlaceholder: "sid o nombre de voz",
    defaultVoice: "", // el servidor elige su voz por defecto si no se indica
    repo: "https://github.com/k2-fsa/OmniVoice",
  },
  openvoice2: {
    label: "OpenVoice 2 (motor)",
    hint: "Voz de nube gratis (Space de MyShell): clona timbre a partir de una semilla o de tu audio",
    voicePlaceholder: "estilo (en_br, es_default…)",
    defaultVoice: "", // el estilo/semilla los resuelve el cliente openvoice2.ts
    repo: "https://github.com/myshell-ai/OpenVoice",
  },
  xai: {
    label: "xAI · Grok Voice (tiempo real)",
    hint: "Voz conversacional de xAI por WebSocket (token efímero/proxy) — también síntesis one-shot",
    voicePlaceholder: "voz xAI (eve · ara · rex · sal · leo)",
    defaultVoice: "eve",
    repo: "https://docs.x.ai/",
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
  opts: {
    settings?: NeuralEngineSettings;
    onError?: (message: string) => void;
    /** Tope de presupuesto por llamada (habla troceada · Adenda 85). */
    budgetCapMs?: number;
    /** Id de la personalidad activa (para el router web-only openvoice2). */
    personalityId?: string;
    /** Pista de estilo OpenVoice (para el router web-only openvoice2). */
    styleHint?: string;
    /** Muestra de audio del usuario para clonar (openvoice2 web-only). */
    refBlob?: Blob | null;
    /** Señal de aborto de la cadena de voz (openvoice2 web-only). */
    signal?: AbortSignal;
    /**
     * Ruta OmniVoice ya decidida para TODO el mensaje (fix continuidad de voz,
     * 2026-07-21): solo la usa el motor "omnivoice" (delegateOmniHybrid).
     * Ignorada por el resto de motores.
     */
    omniRouteOverride?: OmniRouteDecision;
    /**
     * Endpoint OpenVoice V2 ya fijado para TODO el mensaje (mismo motivo):
     * solo lo usa el motor "openvoice2" (delegateOpenVoice2).
     */
    openVoiceEndpointOverride?: OpenVoiceEndpoint;
    /**
     * Identidad CONGELADA del mensaje (uso interno de `neuralSpeakChunked`). Se
     * pasa EXPLÍCITAMENTE en vez de leer la global para que un trozo en vuelo de
     * un mensaje que acaba de ser cortado no pueda sintetizarse con la identidad
     * del mensaje NUEVO (y acabar cacheado bajo la voz equivocada). Ausente ⇒ se
     * usa la identidad viva si es de este mismo motor.
     */
    identityOverride?: FrozenVoiceIdentity;
  } = {},
): Promise<Blob | null> {
  const clean = (text || "").trim();
  if (clean.length === 0) return null;
  // IDENTIDAD CONGELADA del mensaje (si hay uno hablando y es de ESTE motor):
  // manda sobre cualquier relectura de config. Es lo que garantiza que el trozo
  // 7 use exactamente los mismos ajustes que el trozo 1.
  const frozen = (() => {
    if (opts.identityOverride) return opts.identityOverride;
    const id = getVoiceIdentity();
    return id && id.engine === engine ? id : null;
  })();
  const s = opts.settings ?? frozen?.settings ?? getEngineSettings(engine);

  // OpenVoice V2 (web, sin instalar): motor de NUBE integrado (como el híbrido
  // OmniVoice) — no es un endpoint del usuario. Se delega SIEMPRE a su cliente,
  // que gestiona la cola del Space, la semilla de identidad y el fallback honesto.
  if (engine === "openvoice2") {
    // ROUTER WEB-ONLY (V2-VOZ): sintetiza por el Space OpenVoice V2 (sin
    // daemon) vía el router dedicado.
    //
    // FIX DE CONTINUIDAD (2026-08-09): esta llamada IGNORABA el endpoint ya
    // congelado del mensaje (`openVoiceEndpointOverride` no se pasaba a ningún
    // sitio) y no llevaba ni personalidad, ni semilla, ni la muestra grabada.
    // Resultado: cada trozo volvía a elegir Space por salud/orden y a resolver
    // la personalidad por su cuenta ⇒ **otra voz a mitad del mensaje**, que es
    // exactamente la queja. Ahora todo eso viaja congelado desde la identidad.
    return await omnivoiceWebSynthesize(clean, {
      personalityId: opts.personalityId ?? frozen?.personalityId,
      lang: s.lang,
      style: opts.styleHint ?? frozen?.styleHint,
      refBlob: opts.refBlob ?? frozen?.refBlob,
      refKey: frozen?.refKey,
      seedAttrs: frozen?.seedAttrs,
      useSeed: frozen?.useSeed,
      seedVersion: frozen?.seedVersion,
      mood: frozen?.mood,
      budgetCapMs: opts.budgetCapMs,
      signal: opts.signal,
      endpointOverride: opts.openVoiceEndpointOverride ?? frozen?.openVoiceEndpoint,
      // Con el mensaje ya sonando NO se salta a otra familia de motor (F5/XTTS/
      // ChatTTS…): sonaría a otra persona. Solo el primer trozo puede elegir.
      allowFamilyFailover: !frozen?.spoke,
    }).catch(() => null);
  }

  const endpoint = normalizeEndpoint(s.endpoint);
  if (!endpoint) {
    // OmniVoice sin endpoint manual = MODO HÍBRIDO INTEGRADO (daemon local ↔ nube).
    if (engine === "omnivoice") {
      return await delegateOmniHybrid(clean, s, opts.budgetCapMs, opts.omniRouteOverride, frozen);
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

  // Modulación emocional resuelta (estilo persistido + overrides del motor). Con
  // un mensaje en curso se usan los parámetros CONGELADOS de su identidad: si el
  // estilo cambiaba a mitad de respuesta, los trozos siguientes salían con otra
  // velocidad/energía — otra voz.
  const params =
    frozen?.params ?? resolveVoiceParams({ engineOverrides: engineStyleOverrides(engine) });
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
      const viaHybrid = await delegateOmniHybrid(
        clean,
        s,
        opts.budgetCapMs,
        opts.omniRouteOverride,
        frozen,
      );
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
    // IDENTIDAD CONGELADA (fix "cambia de voz dentro del mismo mensaje"): con un
    // mensaje en curso mandan SIEMPRE sus valores congelados. Antes esto se leía
    // por TROZO y, como la modulación se aplica con `preservesPitch = false`, un
    // cambio de ánimo a mitad de respuesta cambiaba literalmente el TONO del
    // siguiente trozo: la misma frase, otra voz.
    const frozen = getVoiceIdentity();
    if (frozen) return frozen.playbackMod;
    return liveEmotionPlaybackMod();
  } catch {
    return null;
  }
}

/** Lectura VIVA de la emoción → modulación (la que se congela por mensaje). */
function liveEmotionPlaybackMod(): { rate: number; volume: number } | null {
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
  return planVoiceChunks(text, { first: maxLen, rest: maxLen });
}

/**
 * PLAN DE TROZOS de un mensaje (fix de latencia y pausas, 2026-08-09).
 *
 * Trocear frase a frase con un tope ÚNICO (lo de antes: 220 caracteres para
 * todo) tenía dos costes que el usuario oía:
 *   · MUCHAS peticiones — cada trozo paga el peaje fijo del motor (unirse a la
 *     cola del Space, subir/validar la referencia, arrancar la inferencia). Con
 *     trozos cortos, ese peaje domina y aparecen las pausas entre frases.
 *   · el PRIMER trozo pesaba lo mismo que los demás, así que el tiempo hasta el
 *     primer sonido era el peor de todos.
 *
 * Aquí el presupuesto es asimétrico: el PRIMER trozo es corto (arranque rápido:
 * Aurora empieza a hablar antes) y los siguientes son largos (menos viajes; y
 * como se sintetizan MIENTRAS suena el anterior, su latencia queda escondida).
 * Se respetan siempre los finales de frase — el corte cae donde ya había una
 * pausa natural, así que agrupar no cambia la prosodia.
 *
 * PURA y testeable; nunca devuelve trozos vacíos. `first === rest` reproduce
 * exactamente el troceo histórico (`splitTextForVoice`).
 */
export function planVoiceChunks(
  text: string,
  opts: { first?: number; rest?: number } = {},
): string[] {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const first = Math.max(40, Math.floor(opts.first ?? 220));
  const rest = Math.max(first, Math.floor(opts.rest ?? first));
  if (clean.length <= first) return [clean];

  const sentences = clean.match(/[^.!?…]+[.!?…]+["»”)]?\s*|[^.!?…]+$/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  /** Tope del trozo que se está formando: corto si aún no hemos emitido ninguno. */
  const budget = () => (out.length === 0 ? first : rest);
  const push = () => {
    const t = cur.trim();
    if (t) out.push(t);
    cur = "";
  };
  for (const s of sentences) {
    if ((cur + s).length <= budget()) {
      cur += s;
      continue;
    }
    push();
    if (s.length <= budget()) {
      cur = s;
      continue;
    }
    // Frase gigante: parte por comas; si aún excede, por palabras a lo bruto.
    const maxLen = budget();
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
    // El resto se queda EN CURSO para poder fundirse con la frase siguiente.
    if (piece.trim()) cur = piece;
  }
  push();
  return out.filter(Boolean);
}

/**
 * Presupuesto de caracteres por trozo según el motor y su ruta REAL.
 *
 *  · openvoice2 / omnivoice-nube (Space HF gratis): el peaje por petición es
 *    enorme comparado con la inferencia ⇒ trozos LARGOS (menos viajes).
 *  · omnivoice LOCAL (daemon en el equipo del usuario): la inferencia cuesta
 *    ~6-7× tiempo real, así que un trozo largo se acerca al watchdog del daemon
 *    ⇒ trozos CORTOS (el peaje local es despreciable: es 127.0.0.1).
 *
 * PURA (sin red, sin `window`): decide solo con el motor y la ruta congelada.
 */
export function chunkBudgetFor(
  engine: NeuralVoiceEngine,
  route?: OmniRouteDecision,
): { first: number; rest: number } {
  if (engine === "omnivoice" && route?.route === "local") return { first: 130, rest: 230 };
  if (engine === "omnivoice") return { first: 160, rest: 340 };
  if (engine === "openvoice2") return { first: 160, rest: 380 };
  return { first: 220, rest: 220 };
}


/** Hash djb2 corto y estable del texto COMPLETO hablado (liga audio ↔ mensaje). */
export function voiceTextHash(text: string): string {
  let h = 5381;
  const t = (text || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36) + ":" + t.length.toString(36);
}

/** Evento vivo: un trozo de VOZ GENERADA (para guardarla y adjuntarla al mensaje). */
export const VOICE_NOTE_EVENT = "starseed:voice-note";

/**
 * Emite un trozo de voz generada. `convId` (Adenda 87-bis · sync en cuenta) liga
 * el trozo a la conversación de Aurora ACTIVA — resuelta vía
 * `personalities.ts::activeAuroraChatId()` con el MISMO patrón de import
 * dinámico que ya usan `delegateOmniHybrid`/`delegateOpenVoice2` en este mismo
 * archivo — para que `voice-notes.ts` pueda indexar y subir la nota a la nube
 * (`os-files` + `aurora_conversations.meta.voiceNotes`) en cuanto esté
 * completa. Sin chat activo (p.ej. Aurora hablando desde el orbe sin el
 * mini-reproductor ni el Exocórtex abiertos) queda `undefined`: la nota se
 * sigue capturando LOCAL igual que siempre, solo no se ofrece a sincronizar.
 * NUNCA lanza.
 */
async function emitVoiceNote(detail: {
  textHash: string;
  chunkIndex: number;
  chunkCount: number;
  engine: string;
  blob: Blob;
}): Promise<void> {
  try {
    let convId: string | undefined;
    try {
      const mod = await import("@/lib/aurora/personalities");
      convId = mod.activeAuroraChatId?.() ?? undefined;
    } catch {
      convId = undefined;
    }
    window.dispatchEvent(new CustomEvent(VOICE_NOTE_EVENT, { detail: { ...detail, convId } }));
  } catch {
    /* */
  }
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
/**
 * Reproduce los trozos de un mensaje COMO UNA SOLA VOZ CONTINUA (sin huecos ni
 * "varias partes"): cada trozo arranca ~OVERLAP_MS antes de que termine el
 * anterior, de modo que la locución suena ininterrumpida. El solapamiento corto
 * cubre el gap natural entre `onended` y el arranque del siguiente `<audio>`
 * (que es justo lo que el usuario percibía como "mensaje dividido en partes").
 *
 * Recibe un `provider(i)` que SINTETIZA el trozo bajo demanda (con prefetch del
 * siguiente MIENTRAS suena el actual → conserva la latencia del primer sonido).
 * Usa `timeupdate` para disparar el arranque del siguiente trozo a tiempo.
 * Devuelve el primer `HTMLAudioElement` (para detener todo) o null. NUNCA lanza.
 */
const CONTINUOUS_OVERLAP_MS = 280;

/**
 * (Adenda 98) Ruta troceada por el OMNIVOICE MIXER: cuando WebAudio está
 * disponible, cada trozo se reproduce por el mixer con CROSSFADE real de
 * ~120 ms sobre el anterior (el siguiente arranca justo antes de que el actual
 * termine y se funden — cero clicks en las costuras, cero huecos). Prefetch del
 * siguiente trozo mientras suena este (igual que la ruta clásica). Devuelve
 * true si el mixer se hizo cargo del turno completo; false → HTMLAudio clásico.
 */
async function playSequentialViaMixer(
  provider: (i: number) => Promise<Blob | null>,
  count: number,
  opts: { onStart?: () => void; onError?: (m: string) => void; onChunk?: (i: number, blob: Blob) => void } = {},
): Promise<boolean> {
  try {
    const mixer = await import("@/lib/aurora/tts-oss/omnivoice-mixer");
    if (!mixer.mixerSupported()) return false;
    const CROSS_MS = 120;
    /** Cuánto antes del final despertamos para preparar y agendar el siguiente. */
    const LEAD_SEC = 0.6;
    let started = false;
    let aborted = false;
    /** Despierta la espera en curso al cortar (para que `onEnd` no llegue tarde). */
    let wakeFromWait: (() => void) | null = null;
    // El stop global corta el mixer (stopMixer, vía stopConfiguredEngine) y
    // este flag evita que sigamos agendando trozos tras el corte.
    (window as unknown as { __astrauraStopContinuous?: () => void }).__astrauraStopContinuous = () => {
      aborted = true;
      try { mixer.stopMixer(); } catch { /* */ }
      try { wakeFromWait?.(); } catch { /* */ }
    };
    /** Espera `ms`, pero vuelve AL INSTANTE si el usuario corta la locución. */
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (aborted || ms <= 0) return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          wakeFromWait = null;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        wakeFromWait = finish;
      });
    const mod = (() => {
      try { return emotionPlaybackMod(); } catch { return null; }
    })();

    // ENCADENADO POR RELOJ DE AUDIO (fix "se separa y tarda entre las pausas"):
    // cada trozo se AGENDA en el instante exacto en que termina el anterior
    // (menos el crossfade), en el reloj de WebAudio. Antes se esperaba con
    // `setTimeout` y se decodificaba el siguiente ya en el último momento: el
    // timer siempre llega tarde y el decode cuesta, así que entre frase y frase
    // había un silencio audible. Ahora el hueco es ≈ 0 mientras el audio esté
    // listo (el proveedor lo trae con lookahead), y si no lo está simplemente
    // suena en cuanto llega.
    let nextAt = 0; // 0 ⇒ "ya" (primer trozo)
    let lastEndAt = 0;
    for (let i = 0; i < count; i++) {
      if (aborted) return started; // cortado: el turno ya se consumió si empezó
      const blob = await provider(i).catch(() => null);
      if (aborted) return started;
      if (!blob) {
        if (i === 0) return false; // primer trozo falló → que lo intente la ruta clásica
        break; // trozos posteriores fallan → cerrar con dignidad
      }
      try { opts.onChunk?.(i, blob); } catch { /* */ }
      // Decodificar ANTES de agendar (el decode ya no se cuela en la costura).
      const buffer = await mixer.mixerDecodeBlob(blob);
      if (aborted) return started;
      if (!buffer) {
        if (i === 0) return false; // el mixer no pudo con el primero → clásica
        break;
      }
      const res = mixer.mixerPlayBufferAt(buffer, {
        at: nextAt > 0 ? nextAt : undefined,
        crossfadeMs: i === 0 ? 0 : CROSS_MS,
        rate: mod?.rate,
        volume: mod?.volume,
      });
      if (!res.ok) {
        if (i === 0) return false;
        break;
      }
      if (!started) {
        started = true;
        try { opts.onStart?.(); } catch { /* */ }
      }
      lastEndAt = res.endAt;
      nextAt = Math.max(0, res.endAt - CROSS_MS / 1000);
      if (i + 1 < count) {
        // Despertar un pelín antes del final para tener el siguiente agendado a
        // tiempo (el prefetch del proveedor ya lo está sintetizando).
        const waitSec = Math.max(0, res.endAt - mixer.mixerNow() - LEAD_SEC);
        await sleep(waitSec * 1000);
      }
    }
    // Esperar al final REAL del último trozo agendado (para que el `onEnd` del
    // llamador —glow del orbe, reanudar micrófono— caiga cuando de verdad calla).
    const remainMs = Math.max(0, (lastEndAt - mixer.mixerNow()) * 1000);
    if (remainMs > 0 && !aborted) await sleep(remainMs);
    return started;
  } catch {
    return false;
  }
}

async function playSequentialContinuous(
  provider: (i: number) => Promise<Blob | null>,
  count: number,
  opts: { onStart?: () => void; onError?: (m: string) => void; onChunk?: (i: number, blob: Blob) => void } = {},
): Promise<HTMLAudioElement | null> {
  if (count <= 0) return null;

  // (Adenda 98) PRIMERO el OmniVoice Mixer (crossfade real entre trozos, sin
  // clicks). Si WebAudio no está o el primer trozo no decodifica, cae SIN
  // COSTE a la ruta clásica HTMLAudio de siempre (suelo intacto).
  const viaMixer = await playSequentialViaMixer(provider, count, opts);
  if (viaMixer) return null; // el mixer habló entero (no hay HTMLAudioElement)

  return new Promise((resolve) => {
    let settled = false;
    let firstAudio: HTMLAudioElement | null = null;
    let aborted = false;
    // Prefetch por índice CORRECTO (Adenda 98 fix): sembramos el trozo 0 antes
    // del primer playAt y, al entrar en cada índice, ya tenemos su blob listo y
    // disparamos el prefetch del siguiente. Antes se perdía el trozo 1 y, en el
    // último, `nextBlob!` colgaba la Promise (null.then).
    let nextBlob: Promise<Blob | null> = provider(0).catch(() => null);
    const active: HTMLAudioElement[] = [];

    const stopAll = () => {
      aborted = true;
      for (const a of active) {
        try { a.pause(); } catch { /* */ }
        try { if (a.src) URL.revokeObjectURL(a.src); } catch { /* */ }
      }
      active.length = 0;
    };
    (window as unknown as { __astrauraStopContinuous?: () => void }).__astrauraStopContinuous = stopAll;

    const playAt = (i: number) => {
      if (aborted || i >= count) {
        if (!settled) { settled = true; resolve(firstAudio); }
        return;
      }
      // El blob de ESTE trozo ya está sembrado (i=0 antes del bucle; i>0 por el
      // prefetch de la iteración anterior). Disparamos el prefetch del SIGUIENTE
      // trozo ahora, para que se sintetice mientras suena el actual.
      const blobPromise: Promise<Blob | null> = nextBlob;
      nextBlob = i + 1 < count ? provider(i + 1).catch(() => null) : Promise.resolve(null);

      blobPromise.then((blob) => {
        if (aborted) return;
        if (!blob) {
          // Este trozo falló: si es el primero, rendirse; si no, cerrar con dignidad.
          if (i === 0) {
            try { opts.onError?.("Fallo al sintetizar el audio del motor neural."); } catch { /* */ }
            if (!settled) { settled = true; resolve(null); }
          } else if (!settled) {
            settled = true; resolve(firstAudio);
          }
          return;
        }
        try { opts.onChunk?.(i, blob); } catch { /* */ }
        let url: string | null = null;
        let audio: HTMLAudioElement | null = null;
        let nextStarted = false;
        const startNext = () => {
          if (nextStarted || aborted) return;
          nextStarted = true;
          playAt(i + 1);
        };
        try {
          url = URL.createObjectURL(blob);
          audio = new Audio(url);
          audio.src = url;
          active.push(audio);
          if (!firstAudio) firstAudio = audio;
          try {
            const mod = emotionPlaybackMod();
            if (mod) {
              audio.playbackRate = mod.rate;
              try { (audio as unknown as { preservesPitch?: boolean }).preservesPitch = false; } catch { /* */ }
              audio.volume = mod.volume;
            }
          } catch { /* */ }

          audio.ontimeupdate = () => {
            try {
              if (nextStarted || aborted || !audio) return;
              const remaining = (audio.duration || 0) - audio.currentTime;
              if (remaining > 0 && remaining <= CONTINUOUS_OVERLAP_MS / 1000) startNext();
            } catch { /* */ }
          };
          audio.onended = () => {
            try { if (url) URL.revokeObjectURL(url); } catch { /* */ }
            const idx = active.indexOf(audio as HTMLAudioElement);
            if (idx >= 0) active.splice(idx, 1);
            startNext();
          };
          audio.onerror = () => {
            try { if (url) URL.revokeObjectURL(url); } catch { /* */ }
            const idx = active.indexOf(audio as HTMLAudioElement);
            if (idx >= 0) active.splice(idx, 1);
            if (i === 0) {
              try { opts.onError?.("Fallo al reproducir el audio del motor neural."); } catch { /* */ }
              if (!settled) { settled = true; resolve(null); }
            } else {
              startNext();
            }
          };
          try { opts.onStart?.(); } catch { /* */ }
          const p = audio.play();
          if (p && typeof (p as Promise<void>).catch === "function") {
            (p as Promise<void>).catch(() => {
              if (i === 0) {
                try { opts.onError?.("El navegador bloqueó la reproducción (requiere gesto)."); } catch { /* */ }
                if (!settled) { settled = true; resolve(null); }
              }
            });
          }
        } catch {
          if (i === 0) {
            try { opts.onError?.("Fallo al reproducir el audio del motor neural."); } catch { /* */ }
            if (!settled) { settled = true; resolve(null); }
          } else {
            startNext();
          }
        }
      });
    };

    playAt(0);
  });
}

/* ── IDENTIDAD DE VOZ CONGELADA POR MENSAJE ──────────────────────────────────
 *
 * INVARIANTE #1 del sistema OmniVoice: **la misma voz dentro del mismo mensaje**.
 * Todo lo que puede alterar el timbre se resuelve AQUÍ, una sola vez, antes del
 * primer trozo; los trozos ya solo consumen. Lo que se congela y por qué:
 *
 *   · `settings` — ajustes del motor (con el idioma ya detectado del texto).
 *   · `params` / `playbackMod` — estilo persistido y modulación emocional. Se
 *     leían POR TROZO: si el usuario cambiaba de ánimo (o el panel de voz
 *     tocaba el estilo) a mitad de respuesta, el trozo siguiente salía con otra
 *     velocidad y —con `preservesPitch = false`— con otro TONO.
 *   · `personalityId` · `seedAttrs` · `refBlob`/`refKey` — quién habla y con qué
 *     semilla o muestra real. Antes se resolvía dentro de cada síntesis, y por
 *     el camino web ni siquiera llegaba la muestra grabada.
 *   · `styleHint` · `useSeed` · `seedVersion` · `omni` — config OmniVoice
 *     EFECTIVA (cuenta × personalidad), que se releía por trozo.
 *   · `omniRoute` — local ⟷ nube, decidida con UN handshake por mensaje.
 *   · `openVoiceEndpoint` — se rellena al ganar el primer trozo.
 *
 * COHERENCIA ENTRE CHATS: como la identidad se deriva de la PERSONALIDAD activa
 * (semilla, `voiceStyle` y su config OmniVoice), el mismo personaje suena igual
 * en cualquier chat donde se use — no depende del chat ni del turno.
 *
 * Todo es best-effort: cualquier pieza que falle queda `undefined` y el motor
 * cae exactamente en su camino previo. NUNCA lanza.
 */
/**
 * Identidad MÍNIMA de emergencia: si la resolución completa fallara (no debería:
 * cada tramo va en su try/catch), el mensaje sigue teniendo UNA identidad — con
 * ella se conserva el troceo, la caché y la invariante de "una sola voz", solo
 * que con los valores por defecto del motor.
 */
function fallbackVoiceIdentity(
  engine: NeuralVoiceEngine,
  settingsOverride?: NeuralEngineSettings,
): FrozenVoiceIdentity {
  let settings: NeuralEngineSettings;
  try {
    settings = settingsOverride ?? getEngineSettings(engine);
  } catch {
    settings = (settingsOverride ?? {}) as NeuralEngineSettings;
  }
  const identity: FrozenVoiceIdentity = {
    token: nextVoiceIdentityToken(),
    engine,
    settings,
    params: { rate: 1, pitch: 1, volume: 1, energy: 50 },
    playbackMod: null,
    fingerprint: voiceIdentityFingerprint({ engine, lang: settings.lang }),
    spoke: false,
  };
  setVoiceIdentity(identity);
  return identity;
}

async function beginMessageVoiceIdentity(
  engine: NeuralVoiceEngine,
  settingsOverride?: NeuralEngineSettings,
): Promise<FrozenVoiceIdentity> {
  const token = nextVoiceIdentityToken();
  let settings: NeuralEngineSettings;
  try {
    settings = settingsOverride ?? getEngineSettings(engine);
  } catch {
    settings = (settingsOverride ?? {}) as NeuralEngineSettings;
  }
  let params: ResolvedVoiceParams;
  try {
    params = resolveVoiceParams({ engineOverrides: engineStyleOverrides(engine) });
  } catch {
    params = { rate: 1, pitch: 1, volume: 1, energy: 50 };
  }
  const playbackMod = liveEmotionPlaybackMod();
  let mood: string | undefined;
  try {
    const e = (
      window as unknown as { STARSEED_userVoiceEmotion?: { mood?: string; confidence?: number } }
    ).STARSEED_userVoiceEmotion;
    if (e && typeof e.confidence === "number" && e.confidence >= 0.35 && typeof e.mood === "string") {
      mood = e.mood;
    }
  } catch {
    /* sin ánimo detectado */
  }

  const identity: FrozenVoiceIdentity = {
    token,
    engine,
    settings,
    params,
    playbackMod,
    mood,
    fingerprint: "",
    spoke: false,
  };

  // Los motores por ENDPOINT del usuario (voxcpm/bark/gpt-sovits/voicebox) no
  // usan semilla, personalidad ni ruta híbrida: para ellos la identidad termina
  // aquí (ajustes + estilo + modulación congelados) y nos ahorramos tres imports
  // dinámicos por turno.
  if (engine !== "openvoice2" && engine !== "omnivoice") {
    identity.fingerprint = voiceIdentityFingerprint({
      engine,
      lang: settings.lang,
      mood: identity.mood,
      params,
    });
    setVoiceIdentity(identity);
    return identity;
  }

  // ── Personalidad que habla: semilla, referencia real y arquetipo local ──────
  try {
    const mod = await import("@/lib/aurora/personalities");
    const profile =
      (typeof mod.resolvePersonalityForContext === "function"
        ? mod.resolvePersonalityForContext({})
        : null) ??
      (typeof mod.getActivePersonality === "function" ? mod.getActivePersonality() : null);
    if (profile) {
      identity.personalityId = profile.id;
      // Voz GRABADA/IMPORTADA de esta personalidad → clonación real (Adenda 149 ·
      // Ola 3). Hasta ahora esto se resolvía en una función que NADIE llamaba
      // (`delegateOpenVoice2`, muerta desde que el motor pasó por el router web):
      // la muestra del usuario no llegaba nunca a la síntesis. Ahora viaja en la
      // identidad y la usan todos los trozos, siempre la MISMA.
      const ref = personaVoiceRefBlob(profile);
      identity.refBlob = ref?.blob;
      identity.refKey = ref?.key;
      if (typeof mod.mapPersonalityToDesign === "function") {
        identity.seedAttrs = {
          attrs: mod.mapPersonalityToDesign(profile),
          instruct:
            (profile.voiceStyle?.omni?.instruct as string | undefined) ||
            profile.voiceStyle?.tone ||
            "",
          lang: profile.idioma || settings.lang || "es",
          text: "",
        };
      }
    }
  } catch {
    /* sin personalidades resolubles → manda la cuenta (camino previo) */
  }

  // ── Config OmniVoice EFECTIVA + arquetipo de semilla (una vez por mensaje) ──
  try {
    const hybrid = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
    const omni = await hybrid.resolveActiveOmni().catch(() => null);
    if (omni) {
      identity.omni = omni;
      identity.styleHint = omni.openvoice?.style;
      identity.useSeed = omni.openvoice?.use_seed;
      identity.seedVersion = omni.openvoice?.seed_version;
    }
    // Identidad local (sube la semilla al daemon UNA vez) + arquetipo publicado.
    void hybrid.ensureLocalIdentity(identity.personalityId);
    if (engine === "omnivoice") {
      // HANDSHAKE ÚNICO POR MENSAJE: decide local ⟷ nube aquí y no en cada trozo.
      identity.omniRoute = await hybrid
        .decideOmniRoute(undefined, undefined, identity.personalityId)
        .catch(() => undefined);
    }
  } catch {
    /* sin híbrido disponible → cada motor sigue con sus defaults */
  }
  try {
    const ov = await import("@/lib/aurora/tts-oss/openvoice2");
    identity.personaKind = ov.seedKindFor(identity.personalityId) || "";
  } catch {
    identity.personaKind = "";
  }

  identity.fingerprint = voiceIdentityFingerprint({
    engine,
    lang: settings.lang,
    personalityId: identity.personalityId,
    styleHint: identity.styleHint,
    refKey: identity.refKey,
    useSeed: identity.useSeed,
    seedVersion: identity.seedVersion,
    mood: identity.mood,
    params,
    seedAttrs: identity.seedAttrs,
    omni: identity.omni,
  });

  setVoiceIdentity(identity);
  return identity;
}

async function neuralSpeakChunked(
  engine: NeuralVoiceEngine,
  chunks: string[],
  opts: NeuralSpeakOptions,
  identity: FrozenVoiceIdentity,
): Promise<HTMLAudioElement | null> {
  const myGen = ++chunkGeneration;
  const alive = () => myGen === chunkGeneration;
  const fullHash = voiceTextHash(chunks.join(" "));

  // CONTINUIDAD DE VOZ: la identidad (motor · ruta · endpoint · personalidad ·
  // semilla · estilo · modulación) YA viene congelada por `neuralSpeak` en
  // `identity` y la leen todos los eslabones vía `voice-identity.ts`. Aquí solo
  // queda congelar el ENDPOINT ganador del primer trozo (su elección depende de
  // la salud real de varios Spaces: más honesto fijarla tras un éxito que
  // adivinarla) antes de lanzar el prefetch del resto.
  const omniRoute = identity.omniRoute;

  // Presupuesto TOPE por trozo. Dos realidades distintas según la ruta:
  //  · RUTA LOCAL (daemon OmniVoice residente en M1/8 GB): ~40-90 s por frase
  //    (inferencia ~6-7× tiempo real). Tope GENEROSO (165 s, coherente con el
  //    timeout del servidor del daemon, 150 s) para ESPERAR a OpenVoice.
  //  · RUTA NUBE (openvoice2 / omnivoice-nube, Space HF gratis): el Space tarda
  //    hasta ~120 s en frío (QUEUE_TIMEOUT_FIRST_MS) y ~60 s en caliente
  //    (QUEUE_TIMEOUT_WARM_MS) por frase. Con los topes cortos de 35/90 s que
  //    traía la Adenda 93 el frontend abandonaba el trozo ANTES de que el Space
  //    despertara → null → la cadena caía a Kokoro y el mensaje se FRAGMENTABA
  //    (el bug "sigue respondiendo Kokoro / mensajes trozeados" en neuronas sin
  //    daemon). Ahora el tope web IGUALA el cold-start del Space (120 s) para el
  //    primer trozo y 60 s para los siguientes (ya calientan el Space). Un Space
  //    MUERTO de verdad corta por su cuenta dentro de `synthesizeOpenVoice2`
  //    mucho antes de agotar esto y la cadena pasa a Kokoro femenino sin colgar.
  const isLocalRoute = engine === "omnivoice" && omniRoute?.route === "local";
  const synth = (t: string, i: number) =>
    neuralSynthesize(engine, t, {
      settings: opts.settings,
      budgetCapMs: isLocalRoute
        ? 165_000
        : i === 0
          ? 120_000 // espera al Space en frío (cold start HF ~120 s)
          : 60_000, // trozos siguientes: Space ya caliente (~60 s)
      omniRouteOverride: omniRoute,
      // El endpoint congelado viaja DENTRO de la identidad (se rellena al ganar
      // el trozo 0), así el primero corre con failover completo y los siguientes
      // heredan el ganador. La identidad se pasa explícita: ningún trozo puede
      // acabar hablando con la voz de otro mensaje.
      identityOverride: identity,
    }).catch(() => null);

  // ── PIPELINE DE TROZOS (fix "tarda mucho" + "se separa entre pausas") ──────
  // Un trozo se sintetiza UNA SOLA VEZ aunque el reproductor lo pida varias
  // (antes: el trozo 0 se sintetizaba para comprobar el motor, otra vez para el
  // mixer y otra más si el mixer declinaba → hasta 3 viajes idénticos antes del
  // primer sonido). Y al consumir el trozo `i` se lanzan ya los `LOOKAHEAD`
  // siguientes, no solo uno: con Spaces que tardan más en sintetizar que lo que
  // dura el audio, un lookahead de 1 dejaba un hueco EN CADA costura.
  const LOOKAHEAD = 2;
  const jobs = new Map<number, Promise<Blob | null>>();
  const start = (i: number): Promise<Blob | null> => {
    const hit = jobs.get(i);
    if (hit) return hit;
    if (!alive()) return Promise.resolve(null); // mensaje cortado: no gastar red
    const key = synthCacheKey(identity.fingerprint, chunks[i]);
    const job = cachedSynthesis(key, () => synth(chunks[i], i));
    jobs.set(i, job);
    return job;
  };
  /**
   * El prefetch NO arranca hasta que el trozo 0 ha ganado y la voz del mensaje
   * está congelada (endpoint incluido). Si los trozos 1..N salieran en paralelo
   * con el 0, cada uno elegiría su propio Space por salud/orden — que es
   * exactamente el bug que estamos matando.
   */
  let pipelineOpen = false;
  /** Proveedor del reproductor: devuelve el trozo `i` y adelanta los siguientes. */
  const provider = (i: number): Promise<Blob | null> => {
    const job = start(i);
    if (pipelineOpen && alive()) {
      for (let k = 1; k <= LOOKAHEAD; k++) {
        if (i + k < chunks.length) void start(i + k);
      }
    }
    return job;
  };

  const first = await provider(0);
  if (!first || !alive()) {
    clearVoiceIdentity(identity.token);
    return null;
  }

  // Tras el PRIMER trozo: si el motor es OpenVoice V2, congela el endpoint que
  // GANÓ para que el resto del mensaje hable por el MISMO Space (mismo timbre).
  // Se hace ANTES de lanzar el prefetch de los trozos 1..N (el prefetch corre en
  // paralelo: si no estuviera congelado ya, cada uno elegiría su propio Space).
  if (engine === "openvoice2") {
    try {
      const ov = await import("@/lib/aurora/tts-oss/openvoice2");
      lockVoiceIdentityEndpoint(identity.token, ov.getOpenVoice2LockedEndpoint() ?? undefined);
    } catch {
      /* sin endpoint congelado: cada trozo usa el orden de salud (como antes) */
    }
  }
  // El mensaje YA está comprometido con una voz concreta: a partir de aquí
  // ningún trozo puede saltar a otra FAMILIA de motor (sonaría a otra persona).
  // Se marca al ganar el trozo 0 —no al empezar a sonar— porque el prefetch de
  // los trozos 1..N arranca antes de la primera nota.
  markVoiceIdentitySpoke(identity.token);

  // Voz congelada ⇒ ya es seguro adelantar trabajo: los trozos siguientes se
  // sintetizan MIENTRAS suena el primero, todos con la misma identidad.
  pipelineOpen = true;
  for (let k = 1; k <= LOOKAHEAD && k < chunks.length; k++) void start(k);

  // REPRODUCCIÓN CONTINUA: el mensaje suena como UNA SOLA VOZ — el mixer agenda
  // cada trozo en el reloj de WebAudio justo antes de que acabe el anterior
  // (hueco ≈ 0, con crossfade) y, si WebAudio no está, el camino clásico
  // HTMLAudio arranca el siguiente ~280 ms antes del final. El proveedor ya
  // trae el audio sintetizado de antemano.
  return await playSequentialContinuous(
    provider,
    chunks.length,
    {
      onStart: opts.onStart,
      onError: opts.onError,
      onChunk: (i, blob) =>
        void emitVoiceNote({ textHash: fullHash, chunkIndex: i, chunkCount: chunks.length, engine, blob }),
    },
  ).then((audio) => {
    clearVoiceIdentity(identity.token); // fin del mensaje: identidad descongelada
    try { opts.onEnd?.(); } catch { /* */ }
    return audio;
  });
}

export async function neuralSpeak(
  engine: NeuralVoiceEngine,
  text: string,
  opts: NeuralSpeakOptions = {},
): Promise<HTMLAudioElement | null> {
  /** Token del mensaje en curso (se rellena al congelar su identidad). */
  let identityToken: number | undefined;
  const fireEnd = () => {
    // Fin del turno ⇒ se descongela la identidad (el siguiente mensaje resuelve
    // la suya y la modulación vuelve a leerse en vivo).
    if (identityToken !== undefined) clearVoiceIdentity(identityToken);
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
  //
  // RUTA LOCAL: el troceado SÍ es seguro para la continuidad (revertido el
  // intento de síntesis única del mensaje completo, fix 2026-07-21-c). Desde
  // la Adenda 91 el daemon local es un SERVIDOR PERSISTENTE (modelo residente
  // + semilla FIJA por personalidad): todos los trozos van al MISMO servidor
  // con la MISMA semilla (congelados por `omniRouteOverride` dentro de
  // `neuralSpeakChunked`, Adenda 90) → voz IDÉNTICA en todos los trozos, sin
  // la mezcla que motivó en su día sintetizar de un tirón. Y sintetizar el
  // mensaje COMPLETO de una vez SÍ fallaba en producción: el modelo tarda
  // ~6-7 s de cómputo por cada segundo de audio, así que un mensaje real
  // supera el watchdog del daemon (180 s) → el daemon devolvía fallo y el
  // frontend degradaba a Kokoro. Trozo a trozo, cada síntesis queda muy por
  // debajo del timeout.
  let singleShotBudgetCapMs: number | undefined;
  // IDENTIDAD DE VOZ del mensaje: se congela ANTES de trocear (así el plan de
  // trozos ya conoce la ruta local/nube y todos los eslabones comparten una sola
  // resolución de personalidad/estilo/semilla). Ver `beginMessageVoiceIdentity`.
  const identity = await beginMessageVoiceIdentity(engine, opts.settings).catch(() =>
    fallbackVoiceIdentity(engine, opts.settings),
  );
  identityToken = identity.token;
  if (engine === "openvoice2" || engine === "omnivoice") {
    const chunks = planVoiceChunks(text, chunkBudgetFor(engine, identity.omniRoute));
    if (chunks.length > 1) {
      stopNeural({ keepIdentity: identity.token }); // una voz a la vez
      return await neuralSpeakChunked(engine, chunks, opts, identity);
    } else if (engine === "openvoice2") {
      // TURNO CORTO SIN TROCEAR (fix cuelgue ~85 s, 2026-07-21): sin
      // presupuesto TOTAL, el bucle multi-endpoint de OpenVoice2
      // (synthesizeOpenVoice2) podía encadenar hasta 3 endpoints × 2 intentos
      // × 60-120 s cada uno SIN techo — de ahí la espera larguísima en un
      // Space roto antes de ceder el turno. Con ENGINE_TIMEOUT_MS.openvoice2
      // como tope TOTAL (~35 s), un Space caído cede pronto y la cadena pasa
      // a Kokoro (femenino) sin dejar al usuario esperando.
      singleShotBudgetCapMs = ENGINE_TIMEOUT_MS.openvoice2;
    }
  }

  // TURNO CORTO (un solo trozo): también pasa por la caché de (texto × identidad)
  // — repetir el mismo mensaje (o el botón «escuchar otra vez») ya no vuelve a
  // pagar el viaje al Space.
  const blob = await cachedSynthesis(synthCacheKey(identity.fingerprint, text), () =>
    neuralSynthesize(engine, text, {
      settings: opts.settings,
      onError: opts.onError,
      budgetCapMs: singleShotBudgetCapMs,
      identityOverride: identity,
    }),
  );
  if (!blob) {
    fireEnd();
    return null;
  }
  void emitVoiceNote({ textHash: voiceTextHash(text), chunkIndex: 0, chunkCount: 1, engine, blob });

  stopNeural({ keepIdentity: identity.token }); // una voz a la vez

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

/**
 * Detiene la reproducción neural en curso (si la hay). Idempotente. Nunca lanza.
 *
 * También CIERRA la identidad de voz congelada del mensaje (si no se pide
 * conservarla): así la modulación emocional vuelve a leerse en vivo para el
 * siguiente turno en vez de quedarse pegada a la del mensaje anterior.
 * `keepIdentity` lo usa `neuralSpeak` cuando el stop forma parte del arranque
 * de un mensaje NUEVO cuya identidad acaba de congelar.
 */
export function stopNeural(opts: { keepIdentity?: number } = {}): void {
  chunkGeneration++; // invalida cualquier habla troceada en curso (Adenda 82)
  try {
    const cur = getVoiceIdentity();
    if (cur && cur.token !== opts.keepIdentity) clearVoiceIdentity(cur.token);
  } catch { /* */ }
  // Adenda 97 (fix): parar TAMBIÉN el pool de <audio> del reproductor troceado
  // continuo (playSequentialContinuous registra su parada en este handle, que
  // hasta ahora NADIE invocaba — el botón de parar dejaba sonando los trozos).
  try {
    (window as unknown as { __astrauraStopContinuous?: () => void }).__astrauraStopContinuous?.();
  } catch { /* */ }
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
 *
 * PROPAGACIÓN DE IDIOMA (fix del acento importado, 2026-07-21): `s.lang` puede
 * venir YA anulado por la auto-detección CONFIABLE del texto real (ver
 * `speak-router.ts::detectSpokenLang` + `runLink`, que construye `s` con
 * `{...getEngineSettings(link), lang: detectedLang}` antes de llegar aquí vía
 * `neuralSpeak`→`neuralSynthesize`). `{ lang: s.lang }` lo pasa tal cual a
 * `synthesizeOmniVoiceHybrid`, que lo mapea a `langName` y lo manda como
 * `body.lang` tanto al daemon local (`POST /tts`, resuelto por `resolveLang`/
 * `langBaseOf` en lib.mjs para elegir instruct/referencia nativos de ESE
 * idioma) como al Space en la nube — así el idioma de síntesis SIEMPRE
 * coincide con el idioma real del texto, sin más cambios aquí.
 *
 * CONTINUIDAD DE VOZ EN MENSAJES TROCEADOS (fix 2026-07-21): `budgetCapMs` y
 * `routeOverride` (producida UNA vez por `neuralSpeakChunked` vía
 * `hybrid.decideOmniRoute()` antes de trocear) se propagan tal cual a
 * `synthesizeOmniVoiceHybrid` — así un trozo intermedio nunca agota su
 * presupuesto interno completo (hasta 150 s) y ningún trozo re-decide
 * local↔nube a mitad de mensaje.
 */
async function delegateOmniHybrid(
  text: string,
  s: NeuralEngineSettings,
  budgetCapMs?: number,
  routeOverride?: OmniRouteDecision,
  /**
   * Identidad CONGELADA del mensaje (2026-08-09). Cuando viene, ni la config
   * OmniVoice efectiva ni la personalidad se vuelven a resolver por trozo: se
   * usan las del mensaje. Antes, cada trozo repetía `resolveActiveOmni()` (con
   * su import dinámico de personalidades) y podía salir con OTRO diseño de voz
   * si algo cambiaba a mitad de respuesta.
   */
  frozen?: FrozenVoiceIdentity | null,
): Promise<Blob | null> {
  try {
    const hybrid = await import("@/lib/aurora/tts-oss/omnivoice-hybrid");
    if (frozen) {
      return await hybrid
        .synthesizeOmniVoiceHybrid(text, {
          lang: s.lang,
          personalityId: frozen.personalityId,
          budgetCapMs,
          routeOverride: routeOverride ?? frozen.omniRoute,
          omniResolved: frozen.omni,
          personaKind: frozen.personaKind,
        })
        .catch(() => null);
    }
    // IDENTIDAD FEMENINA POR PERSONALIDAD (Adenda 87): resuelve la personalidad
    // activa, publica su "kind" para que el cuerpo local viaje con `personality`
    // (el daemon clona refs/<kind>.<langBase>.wav o fija su --seed estable) y
    // sube la semilla al daemon UNA vez (fire-and-forget). Nunca bloquea ni lanza.
    //
    // PENDIENTE (fuera de este alcance): `ensureLocalIdentity(personalityId?)`
    // vive en omnivoice-hybrid.ts y hoy NO acepta un parámetro de idioma, así
    // que la subida a `POST /identity` no propaga `s.lang` (el idioma detectado
    // de ESTA locución, disponible aquí mismo). El daemon ya soporta un campo
    // `lang` opcional en `/identity` (guarda refs/<id>.<langBase>.wav; ver
    // daemon.mjs::handleIdentity) — cuando el orquestador de omnivoice-hybrid.ts
    // añada ese parámetro, debe pasarle `s.lang` (o el idioma activo equivalente)
    // para que la referencia se guarde y seleccione por idioma igual que la
    // síntesis. Hasta entonces, la subida sigue cayendo en la ruta histórica sin
    // sufijo (refs/<id>.wav) y `handleTts` — que solo clona refs/<id>.<lang>.wav
    // EXACTAS — simplemente no la usará: sintetiza con --instruct+--seed nativos
    // del idioma (sin clonar), que ya es un resultado correcto, solo sin timbre
    // clonado hasta que se cablee.
    //
    // Adenda 149 · Ola 3: la MISMA personalidad resuelta aquí viaja ahora como
    // `personalityId` a `synthesizeOmniVoiceHybrid`, para que la VÍA de voz
    // (nube/local) que la ventana «Sistemas de Astraura en esta neurona» guardó
    // para ESTA personalidad decida dentro del híbrido (`neuronPrefersLocalLS`).
    // Sin overrides guardados no cambia nada: manda la elección del dispositivo.
    let personalityId: string | undefined;
    try {
      const mod = await import("@/lib/aurora/personalities");
      const profile = mod.getActivePersonality?.();
      personalityId = profile?.id;
      void hybrid.ensureLocalIdentity(profile?.id);
    } catch {
      void hybrid.ensureLocalIdentity(undefined);
    }
    return await hybrid
      .synthesizeOmniVoiceHybrid(text, { lang: s.lang, personalityId, budgetCapMs, routeOverride })
      .catch(() => null);
  } catch {
    return null;
  }
}

/* ── Adenda 149 · Ola 3 — la voz GRABADA/IMPORTADA llega a la síntesis ──────── */

/**
 * Id de la personalidad ACTIVA, best-effort. Nunca lanza; `undefined` si el
 * módulo de personalidades no está disponible o no hay ninguna activa (en cuyo
 * caso los consumidores caen a los defaults «Todas» de la neurona, igual que el
 * mesh con el tráfico no atribuible).
 */
async function activePersonalityIdSafe(): Promise<string | undefined> {
  try {
    const mod = await import("@/lib/aurora/personalities");
    return mod.getActivePersonality?.()?.id;
  } catch {
    return undefined;
  }
}

/**
 * Blob decodificado de la referencia de audio de UNA personalidad, cacheado por
 * `personalityId` y validado con la huella del `dataUrl` (si el usuario regraba
 * su voz, la huella cambia y se vuelve a decodificar). Un mapa por personalidad
 * —no por dataUrl— mantiene la cache ACOTADA: nunca crece con las regrabaciones.
 */
const personaRefBlobCache = new Map<string, { fp: string; blob: Blob | null }>();

/** Huella barata y estable de un data URL (djb2 sobre una muestra + longitud + `at`). */
function refFingerprint(dataUrl: string, at?: number): string {
  let h = 5381;
  const sample = dataUrl.length > 4096 ? dataUrl.slice(0, 2048) + dataUrl.slice(-2048) : dataUrl;
  for (let i = 0; i < sample.length; i++) h = ((h << 5) + h + sample.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}.${dataUrl.length.toString(36)}.${(at || 0).toString(36)}`;
}

/**
 * `data:` URL → Blob SIN pasar por `fetch(dataUrl)`.
 *
 * DECISIÓN (robustez, no gusto): `fetch()` de un `data:` URL es una petición de
 * red a efectos de CSP y cae bajo `connect-src`, que en este OS es
 * `'self' https: wss:` (next.config.ts) — SIN `data:`. Hoy la política viaja en
 * `Content-Security-Policy-Report-Only`, así que `fetch` funcionaría… hasta el
 * día que se aplique de verdad, y entonces la voz clonada dejaría de cargar sin
 * más aviso que un informe. La decodificación manual (atob / decodeURIComponent)
 * no toca la red, funciona igual en cualquier runtime y cuesta una sola vez por
 * personalidad gracias a la cache de arriba. NUNCA lanza; null ⇒ sin referencia.
 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    if (typeof window === "undefined") return null;
    if (!dataUrl.startsWith("data:")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const header = dataUrl.slice(5, comma);
    const payload = dataUrl.slice(comma + 1);
    const isB64 = /;base64\s*$/i.test(header);
    // Se conserva el MIME COMPLETO con sus parámetros (`audio/webm;codecs=opus`
    // es lo que produce MediaRecorder): quitar el codec empobrecería el Blob.
    const type = header.replace(/;base64\s*$/i, "").trim() || "audio/wav";
    // Un solo camino de bytes para las dos codificaciones (`atob` ya devuelve
    // caracteres 0-255; el `& 0xff` solo importa en el payload sin base64, que
    // en audio es rarísimo y se trata como latin-1, igual que hace el navegador).
    const bin = isB64 ? atob(payload.replace(/\s+/g, "")) : decodeURIComponent(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
    return bytes.length > 0 ? new Blob([bytes], { type }) : null;
  } catch {
    return null;
  }
}

/**
 * Referencia de voz REAL de una personalidad para clonar (Adenda 96 → 149·Ola 3).
 *
 * Solo los orígenes `"recorded"` (micrófono de esta neurona) y `"library"`
 * (archivo del usuario) llevan audio propio en `dataUrl` y solo ellos producen
 * referencia: **`"builtin"` sigue EXACTAMENTE con la semilla sintética de
 * siempre** (es un id de catálogo, no audio del usuario). Sin `audioRef`, sin
 * `dataUrl` o con un `dataUrl` ilegible ⇒ null ⇒ camino previo intacto.
 *
 * `key` identifica la referencia (personalidad + huella) para que el cliente de
 * OpenVoice cachee la SUBIDA por referencia y no reutilice el /tmp de otra
 * personalidad. NUNCA lanza.
 */
function personaVoiceRefBlob(profile: PersonalityProfile | null | undefined): { blob: Blob; key: string } | null {
  try {
    const ref = profile?.voiceStyle?.audioRef;
    if (!ref || (ref.kind !== "recorded" && ref.kind !== "library")) return null;
    const dataUrl = typeof ref.dataUrl === "string" ? ref.dataUrl : "";
    if (!dataUrl.startsWith("data:")) return null;
    const id = profile?.id || "custom";
    const fp = refFingerprint(dataUrl, ref.at);
    const hit = personaRefBlobCache.get(id);
    if (hit && hit.fp === fp) return hit.blob ? { blob: hit.blob, key: `${id}.${fp}` } : null;
    const blob = dataUrlToBlob(dataUrl);
    personaRefBlobCache.set(id, { fp, blob });
    return blob ? { blob, key: `${id}.${fp}` } : null;
  } catch {
    return null;
  }
}

/*
 * NOTA (2026-08-09) — `delegateOpenVoice2` ELIMINADA.
 *
 * Era una delegación DIRECTA a `synthesizeOpenVoice2` que resolvía aquí la
 * personalidad, su semilla, su muestra grabada y el sub-esquema `openvoice` de
 * la config. Desde que el motor pasó a enrutarse por `omnivoice-web-router.ts`
 * (V2-VOZ) NADIE la llamaba: `neuralSynthesize` iba directo al router, que NO
 * recibía nada de eso. El efecto real en producción era doble —
 *   · la voz GRABADA/IMPORTADA de una personalidad nunca llegaba al Space
 *     (la clonación de la Adenda 149 · Ola 3 estaba muerta de hecho), y
 *   · el endpoint congelado del mensaje se perdía por el camino, así que cada
 *     trozo podía caer en OTRO Space ⇒ otra voz a mitad de mensaje.
 * Toda esa resolución vive ahora en `beginMessageVoiceIdentity()` (una vez por
 * mensaje) y viaja congelada hasta `omnivoiceWebSynthesize`.
 */

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

// ── Selección de voz de NAVEGADOR consciente del GÉNERO (Adenda voz-femenina) ─
//
// `browser-voices.ts` rankea por calidad/idioma con una preferencia de género
// SUAVE (informativa: suma puntos, no descarta nada — ver su cabecera). Esta
// capa añade la preferencia FUERTE que pide `preferredVoiceGender()`
// (voice-config.ts): cuando la personalidad activa es femenina (el caso por
// defecto), NUNCA se elige una voz de sistema con nombre masculino conocido
// si hay alguna alternativa. Construida SOLO con las utilidades YA
// EXPORTADAS de browser-voices.ts (`listBrowserVoices`/`rankBrowserVoices`):
// ese archivo no se toca.

/** Nombres (minúsculas) que delatan una voz de sistema MASCULINA conocida. */
const KNOWN_MALE_VOICE_NAMES = [
  "male", "hombre", "masculino", "masculina",
  "jorge", "diego", "carlos", "juan", "pablo", "enrique",
];
/** Nombres (minúsculas) que delatan una voz de sistema FEMENINA conocida. */
const KNOWN_FEMALE_VOICE_NAMES = [
  "female", "mujer", "femenina", "femenino",
  "monica", "mónica", "paulina", "marisol", "helena", "laura",
];

function voiceNameLower(v: SpeechSynthesisVoice): string {
  try {
    return `${v.name || ""} ${v.voiceURI || ""}`.toLowerCase();
  } catch {
    return "";
  }
}

/** ¿El nombre de esta voz delata un género conocido? `null` = no se sabe. */
function detectedVoiceGender(v: SpeechSynthesisVoice): VoiceGenderPref | null {
  const n = voiceNameLower(v);
  if (KNOWN_MALE_VOICE_NAMES.some((h) => n.includes(h))) return "m";
  if (KNOWN_FEMALE_VOICE_NAMES.some((h) => n.includes(h))) return "f";
  return null;
}

/**
 * Elige la MEJOR voz de sistema (Web Speech API) para el género preferido.
 * Reutiliza el ranking de calidad/idioma de `rankBrowserVoices()` (que ya
 * prioriza `es-*` y nombres femeninos conocidos) y le SUMA un filtro FUERTE:
 *   · `gender==="f"` (por defecto — ver `currentPreferredVoiceGender()`):
 *     EXCLUYE cualquier voz con nombre masculino conocido (Jorge, Diego,
 *     Carlos, Juan, Pablo, Enrique, male, hombre…) y devuelve la mejor
 *     rankeada entre el resto. Si NINGUNA española es femenina, cae a
 *     cualquier voz femenina/desconocida antes que a una explícitamente
 *     masculina; solo si TODAS las voces del dispositivo delatan nombre
 *     masculino se devuelve la mejor de todas formas — mejor hablar "con la
 *     voz equivocada" que quedarse muda (regla de oro del proyecto).
 *   · `gender==="m"`: el ranking normal ya sirve (su sesgo es suave, nunca
 *     penaliza una voz masculina).
 * La voz FIJADA por el usuario (`configuredURI`) siempre se respeta tal cual
 * si existe en este dispositivo (mismo contrato que `resolveBrowserVoice`).
 * Nunca lanza; `null` = que decida el navegador.
 */
export function pickGenderAwareBrowserVoice(
  configuredURI: string | undefined,
  preferLang: string = "es",
  voices?: SpeechSynthesisVoice[],
  gender?: VoiceGenderPref,
): SpeechSynthesisVoice | null {
  try {
    const list = voices ?? listBrowserVoices();
    if (!list.length) return null;

    // Elección EXPLÍCITA del usuario: se respeta tal cual (mismo contrato que
    // `resolveBrowserVoice`) — un gesto deliberado nunca se pisa en silencio.
    if (configuredURI) {
      const exact = list.find((v) => v.voiceURI === configuredURI);
      if (exact) return exact;
    }

    const ranked = rankBrowserVoices(list, preferLang);
    if (!ranked.length) return null;

    const wantGender = gender ?? currentPreferredVoiceGender();
    if (wantGender === "m") return ranked[0].voice;

    const noMale = ranked.filter((r) => detectedVoiceGender(r.voice) !== "m");
    return (noMale[0] ?? ranked[0]).voice;
  } catch {
    return null;
  }
}
