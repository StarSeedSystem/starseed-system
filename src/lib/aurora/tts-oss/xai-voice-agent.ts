"use client";

/**
 * xai-voice-agent.ts — Cliente WebSocket conversacional del agente de voz xAI
 * (grok-voice, en tiempo real). NO es un motor HTTP de texto-a-voz: es un
 * agente que ESCUCHA al micrófono y RESPONDE por voz, con turn detection
 * automática en el servidor (server_vad).
 * ============================================================================
 * Flujo:
 *   1. Pide un token efímero al servidor (`/api/voice/xai/token`), que usa
 *      process.env.XAI_API_KEY (StarSeed gratuita por defecto) o la API key
 *      propia del usuario si la envió. El cliente NUNCA ve la API key.
 *   2. Abre el WebSocket: wss://api.x.ai/v1/realtime?model=grok-voice-latest
 *      con el protocolo `xai-client-secret.<TOKEN>`.
 *   3. Envía `session.update` con la voz + instrucciones de la personalidad
 *      elegida, audio PCM16 @ 24000 Hz, y server_vad.
 *   4. Captura el micrófono (getUserMedia), lo convierte a PCM16 @ 24000 Hz y
 *      lo envía en `input_audio_buffer.append` (base64).
 *   5. Recibe `response.output_audio.delta` (base64 PCM16), lo decodifica con
 *      AudioContext y lo reproduce.
 *   6. Reconexión con backoff si el WebSocket cae.
 *
 * Es ADITIVO: NO participa de la cadena de síntesis one-shot (Aurora SIEMPRE
 * habla por los motores de TTS). xAI se ofrece como una EXPERIENCIA aparte
 * (botón "Hablar con <persona>" en el panel de voz) que arranca esta clase.
 *
 * SSR-safe y defensivo: todo tras un gesto del usuario; NUNCA lanza al importar.
 */

import {
  resolveXaiPersona,
  XAI_VOICE_MODEL,
  type XaiPersonaId,
  type XaiVoiceId,
} from "@/lib/aurora/tts-oss/xai-persona-voices";

/** Estado de la conversación xAI para la UI. */
export type XaiAgentStatus =
  | "idle"
  | "requesting-token"
  | "connecting"
  | "listening" // micrófono activo, esperando tu voz
  | "thinking" // el agente está generando respuesta
  | "speaking" // el agente está hablando
  | "error"
  | "closed";

export interface XaiAgentOptions {
  /** Personalidad a usar (astraura · council · moa · aurora · hermione). */
  personaId?: XaiPersonaId | string | null;
  /** Voz xAI explícita (sobreescribe la de la personalidad). */
  voice?: XaiVoiceId | string | null;
  /** Instrucciones explícitas (sobreescribe las de la personalidad). */
  instructions?: string | null;
  /** API key PROPIA del usuario (opcional). Si se omite → StarSeed gratuita. */
  apiKey?: string | null;
  /** Callback de estado (para pintar la UI). */
  onStatus?: (status: XaiAgentStatus, detail?: string) => void;
  /** Callback de errores no fatales. */
  onError?: (message: string) => void;
  /** Silence duration (ms) para el server_vad. Por defecto 800 ms. */
  silenceDurationMs?: number;
}

const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime?model=" + XAI_VOICE_MODEL;
const TOKEN_ENDPOINT = "/api/voice/xai/token";
const SAMPLE_RATE = 24000;
const TARGET_SAMPLE_RATE = 24000;

/** Convierte un ArrayBuffer/PCM Float32 en PCM16 little-endian base64. */
function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return arrayBufferToBase64(buffer);
}

/** Decodifica base64 a un Int16Array PCM16. */
function base64ToPcm16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const out = new Int16Array(bytes.length / 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

/**
 * XaiVoiceAgent — controla una sesión conversacional en tiempo real con xAI.
 * Una instancia = una conversación. Llama a `start()` tras un gesto del usuario
 * y a `stop()` para cerrar.
 */

/** Resultado de pedir acceso: token efímero o proxy server-side. */
type XaiTokenResult =
  | { mode: "token"; token: string }
  | { mode: "proxy" }
  | { mode: "none" };

export class XaiVoiceAgent {
  private opts: XaiAgentOptions;
  private ws: WebSocket | null = null;
  private persona: ReturnType<typeof resolveXaiPersona>;
  private micStream: MediaStream | null = null;
  private sourceNode: AudioNode | null = null;
  private audioCtx: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private playbackCtx: AudioContext | null = null;
  private nextPlaybackTime = 0;
  private reconnectAttempts = 0;
  private maxReconnect = 4;
  private stopped = false;

  constructor(opts: XaiAgentOptions) {
    this.opts = opts;
    this.persona = resolveXaiPersona({
      personaId: opts.personaId,
      voice: opts.voice,
      instructions: opts.instructions,
    });
  }

  private setStatus(s: XaiAgentStatus, detail?: string) {
    try {
      this.opts.onStatus?.(s, detail);
    } catch {
      /* */
    }
  }

  private reportError(m: string) {
    try {
      this.opts.onError?.(m);
    } catch {
      /* */
    }
  }

  /** Inicia la sesión: pide token, abre WS, configura mic + audio. */
  async start(): Promise<void> {
    this.stopped = false;
    try {
      this.setStatus("requesting-token");
      const tokenResult = await this.requestToken();
      if (tokenResult.mode === "token" && tokenResult.token) {
        await this.connect(tokenResult.token);
      } else if (tokenResult.mode === "proxy") {
        await this.connectViaProxy();
      } else {
        this.setStatus("error", "No se pudo obtener acceso de voz xAI.");
      }
    } catch (e) {
      this.reportError("Error al iniciar el agente xAI: " + String(e));
      this.setStatus("error", String(e));
    }
  }

  /** Pide acceso al servidor: token efímero (key propia) o proxy (StarSeed). */
  private async requestToken(): Promise<XaiTokenResult> {
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La API key propia solo viaja a este endpoint server-side; NUNCA al
        // bundle ni al cliente del WebSocket. Si va vacía, el server usa la de
        // StarSeed (gratuita por defecto).
        body: JSON.stringify({
          apiKey: this.opts.apiKey || undefined,
          personaId: this.persona.id,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          mode?: string;
          error?: string;
        };
        // 503 + mode "proxy-needed": la key server-side no tiene permiso de
        // ephemeral → usamos el proxy WebSocket server-side (/api/voice/xai/stream).
        if (data.mode === "proxy-needed") {
          return { mode: "proxy" };
        }
        this.reportError(
          `El servidor de voz xAI respondió ${res.status}. ${data.error ?? ""}`.slice(0, 240),
        );
        return { mode: "none" };
      }
      const data = (await res.json().catch(() => ({}))) as { token?: string };
      if (data.token) return { mode: "token", token: data.token };
      return { mode: "none" };
    } catch (e) {
      this.reportError("No se pudo contactar al servidor de voz xAI: " + String(e));
      return { mode: "none" };
    }
  }

  /** Abre el WebSocket directo con token efímero (key propia de usuario). */
  private connect(token: string): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        this.setStatus("connecting");
        const ws = new WebSocket(XAI_REALTIME_URL, [`xai-client-secret.${token}`]);
        this.attachWs(ws);
        resolve();
      } catch (e) {
        this.reportError("No se pudo abrir el WebSocket xAI: " + String(e));
        this.setStatus("error", String(e));
        resolve();
      }
    });
  }

  /** Abre el WebSocket vía PROXY server-side (API de StarSeed gratuita). */
  private connectViaProxy(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        this.setStatus("connecting");
        // El proxy server-side autentica con la key de StarSeed (server-side)
        // y hace forwarding bidireccional. No se expone la key.
        const ws = new WebSocket(`/api/voice/xai/stream`);
        this.attachWs(ws);
        resolve();
      } catch (e) {
        this.reportError("No se pudo abrir el proxy de voz xAI: " + String(e));
        this.setStatus("error", String(e));
        resolve();
      }
    });
  }

  /** Conecta handlers comunes a cualquier WebSocket xAI (token o proxy). */
  private attachWs(ws: WebSocket) {
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.sendSessionUpdate();
    };
    ws.onmessage = (ev) => {
      try {
        this.handleServerEvent(ev.data as string);
      } catch {
        /* evento ilegible: ignoramos para no romper la sesión */
      }
    };
    ws.onerror = () => {
      this.reportError("Conexión con xAI interrumpida.");
    };
    ws.onclose = () => {
      if (this.stopped) {
        this.setStatus("closed");
        return;
      }
      if (this.reconnectAttempts < this.maxReconnect) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * this.reconnectAttempts, 5000);
        this.setStatus("connecting", `Reconectando (${this.reconnectAttempts})…`);
        setTimeout(() => {
          if (this.stopped) return;
          void this.start();
        }, delay);
      } else {
        this.setStatus("error", "Se perdió la conexión con xAI.");
      }
    };
  }

  /** Envía la configuración de sesión (voz + instrucciones + server_vad). */
  private sendSessionUpdate() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const { voice, instructions } = this.persona;
    const update = {
      type: "session.update",
      session: {
        voice: voice,
        instructions: instructions,
        turn_detection: { type: "server_vad" },
        audio: {
          input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
          output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
        },
        reasoning: { effort: "none" },
      },
    };
    this.ws.send(JSON.stringify(update));
  }

  /** Maneja eventos del servidor xAI. */
  private handleServerEvent(raw: string) {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "session.updated":
        // Sesión lista: arrancamos micrófono + reproducción.
        void this.beginCapture();
        this.setStatus("listening");
        break;
      case "response.created":
        this.setStatus("thinking");
        break;
      case "response.output_audio.delta": {
        const b64 = msg.delta as string | undefined;
        if (b64) {
          this.setStatus("speaking");
          void this.playPcm16(b64);
        }
        break;
      }
      case "response.done":
        // Tras hablar, volvemos a escuchar.
        this.setStatus("listening");
        break;
      case "error":
        this.reportError(
          "xAI: " + JSON.stringify(msg.error ?? msg.message ?? "error desconocido"),
        );
        break;
      default:
        break;
    }
  }

  /** Inicia la captura del micrófono y el envío de audio PCM16. */
  private async beginCapture(): Promise<void> {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE });
      this.audioCtx = ctx;
      const source = ctx.createMediaStreamSource(stream);
      this.sourceNode = source;

      // ScriptProcessor para leer el PCM y enviarlo (compatible con navegadores
      // actuales; AudioWorklet sería ideal pero requiere módulo aparte).
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.scriptNode = processor;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        if (!input || input.length === 0) return;
        const b64 = float32ToPcm16Base64(input);
        this.sendAudioChunk(b64);
      };
      source.connect(processor);
      processor.connect(ctx.destination); // necesario para que procese
      await ctx.resume().catch(() => {});
    } catch (e) {
      this.reportError(
        "No se pudo acceder al micrófono: " +
          String(e) +
          ". El agente escuchará solo por texto si lo hubiera.",
      );
    }
  }

  /** Envía un chunk de audio PCM16 base64 al servidor. */
  private sendAudioChunk(base64Pcm16: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64Pcm16,
        }),
      );
    } catch {
      /* */
    }
  }

  /** Reproduce un chunk PCM16 base64 con el AudioContext de salida. */
  private async playPcm16(base64Pcm16: string): Promise<void> {
    try {
      const samples = base64ToPcm16(base64Pcm16);
      if (!this.playbackCtx) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.playbackCtx = new Ctx({ sampleRate: TARGET_SAMPLE_RATE });
      }
      const ctx = this.playbackCtx;
      const float = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        float[i] = samples[i] / 0x8000;
      }
      const buffer = ctx.createBuffer(1, float.length, TARGET_SAMPLE_RATE);
      buffer.copyToChannel(float, 0);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      // Encadenamos para no cortar chunks consecutivos.
      if (this.nextPlaybackTime < ctx.currentTime) {
        this.nextPlaybackTime = ctx.currentTime;
      }
      node.start(this.nextPlaybackTime);
      this.nextPlaybackTime += buffer.duration;
      await ctx.resume().catch(() => {});
    } catch {
      /* */
    }
  }

  /** Cierra todo (mic, websocket, contextos). Idempotente. */
  stop(): void {
    this.stopped = true;
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* */
    }
    this.micStream = null;
    try {
      this.scriptNode?.disconnect();
    } catch {
      /* */
    }
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* */
    }
    try {
      void this.audioCtx?.close();
    } catch {
      /* */
    }
    try {
      void this.playbackCtx?.close();
    } catch {
      /* */
    }
    this.audioCtx = null;
    this.playbackCtx = null;
    this.scriptNode = null;
    this.sourceNode = null;
    this.setStatus("closed");
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * xaiSpeakOnce — SÍNTESIS ONE-SHOT por el canal realtime (Adenda 97).
 * ----------------------------------------------------------------------------
 * Convierte al agente conversacional en un motor de TTS de UNA locución para
 * la cadena OmniVoice: token/proxy → WebSocket → session.update (sin VAD ni
 * micrófono) → texto → deltas de audio PCM16 → OmniVoice Mixer (gapless).
 *
 * Contrato de la cadena (speak-router): resuelve `true` si HABLÓ (el turno se
 * consumió) y `false` si declinó limpio (sin key/red/soporte) para que el
 * siguiente eslabón cubra el turno. NUNCA lanza. Presupuesto duro: 30 s.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface XaiSpeakOnceOptions {
  /** Voz xAI explícita (eve · ara · rex · sal · leo o custom id). */
  voice?: string | null;
  /** Personalidad para voz/instrucciones por defecto. */
  personaId?: string | null;
  /** API key propia del usuario (opcional; si falta, StarSeed/proxy). */
  apiKey?: string | null;
  /** Neurona/personalidad dueña (ganancia del mixer). */
  neuronId?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

const XAI_ONESHOT_BUDGET_MS = 30_000;

/**
 * Cancelación de la síntesis one-shot xAI en vuelo (Adenda 97 · fix): sin esto,
 * `stopConfiguredEngine()` cerraba el mixer pero la sesión xAI seguía viva y el
 * siguiente delta de audio reabría un stream PCM y volvía a hablar. Un contador
 * de generación invalida la locución actual: se comprueba antes de cada trozo.
 */
let xaiSpeakGeneration = 0;
let activeXaiWs: WebSocket | null = null;

/** Corta cualquier `xaiSpeakOnce` en curso (lo llama el speak-router al parar). */
export function cancelActiveXaiSpeak(): void {
  xaiSpeakGeneration++;
  try {
    activeXaiWs?.close();
  } catch {
    /* */
  }
  activeXaiWs = null;
}

export async function xaiSpeakOnce(
  text: string,
  opts: XaiSpeakOnceOptions = {},
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const clean = (text || "").trim();
  if (!clean) return false;
  const myGen = ++xaiSpeakGeneration;
  const cancelled = () => myGen !== xaiSpeakGeneration;

  const persona = resolveXaiPersona({
    personaId: opts.personaId,
    voice: opts.voice,
    instructions: null,
  });

  // 1) Acceso: token efímero (key propia) o proxy server-side (StarSeed).
  let wsUrl: string;
  let protocols: string[] | undefined;
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: opts.apiKey || undefined, personaId: persona.id }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { token?: string };
      if (!data.token) return false;
      wsUrl = XAI_REALTIME_URL;
      protocols = [`xai-client-secret.${data.token}`];
    } else {
      const data = (await res.json().catch(() => ({}))) as { mode?: string };
      if (data.mode !== "proxy-needed") return false; // sin acceso → declinar limpio
      wsUrl = "/api/voice/xai/stream"; // proxy server-side (Cloud Run/local)
      protocols = undefined;
    }
  } catch {
    return false;
  }

  // 2) Mixer OmniVoice (import dinámico: circular-safe y fuera del bundle base).
  const { mixerPlayPcm16Chunk, mixerEndPcmStream, mixerPcmRemainingSeconds } = await import(
    "@/lib/aurora/tts-oss/omnivoice-mixer"
  );

  // 3) Sesión one-shot: sin micrófono, respuesta de audio a un texto.
  return await new Promise<boolean>((resolve) => {
    let ws: WebSocket | null = null;
    let started = false;
    let settled = false;
    let sawAudio = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (activeXaiWs === ws) activeXaiWs = null;
      try {
        clearTimeout(budgetTimer);
      } catch {
        /* */
      }
      const closeWs = () => {
        try {
          ws?.close();
        } catch {
          /* */
        }
      };
      if (sawAudio) {
        // Esperar a que la cola PCM agendada termine antes de cerrar el turno.
        const waitMs = Math.ceil(mixerPcmRemainingSeconds() * 1000) + 150;
        setTimeout(() => {
          mixerEndPcmStream();
          closeWs();
          if (started) {
            try {
              opts.onEnd?.();
            } catch {
              /* */
            }
          }
          resolve(ok);
        }, waitMs);
      } else {
        mixerEndPcmStream();
        closeWs();
        resolve(ok && started);
      }
    };

    const budgetTimer = setTimeout(() => finish(sawAudio), XAI_ONESHOT_BUDGET_MS);

    if (cancelled()) {
      clearTimeout(budgetTimer);
      resolve(false);
      return;
    }
    try {
      ws = protocols ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl);
      activeXaiWs = ws;
    } catch {
      clearTimeout(budgetTimer);
      resolve(false);
      return;
    }

    ws.onopen = () => {
      try {
        ws?.send(
          JSON.stringify({
            type: "session.update",
            session: {
              voice: persona.voice,
              instructions:
                "Eres el sistema de voz OmniVoice de StarSeed. Lee EXACTAMENTE el texto que el usuario te envíe, con naturalidad. No añadas nada.",
              audio: {
                input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
                output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
              },
              reasoning: { effort: "none" },
            },
          }),
        );
      } catch {
        finish(false);
      }
    };

    ws.onmessage = (ev) => {
      let msg: { type?: string; delta?: string } = {};
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case "session.updated":
          // Pedimos la locución: texto del usuario → respuesta SOLO audio.
          try {
            ws?.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: clean }],
                },
              }),
            );
            ws?.send(JSON.stringify({ type: "response.create" }));
          } catch {
            finish(false);
          }
          break;
        case "response.output_audio.delta": {
          const b64 = msg.delta;
          if (!b64) break;
          if (cancelled()) {
            finish(false); // stopConfiguredEngine() abortó: no reabrir stream PCM
            break;
          }
          const pcm = base64ToPcm16(b64);
          const played = mixerPlayPcm16Chunk(pcm, SAMPLE_RATE, {
            neuronId: opts.neuronId ?? persona.id,
          });
          if (played && !started) {
            started = true;
            sawAudio = true;
            try {
              opts.onStart?.();
            } catch {
              /* */
            }
          } else if (played) {
            sawAudio = true;
          }
          break;
        }
        case "response.done":
          finish(sawAudio);
          break;
        case "error":
          try {
            opts.onError?.("xAI: error de sesión de voz");
          } catch {
            /* */
          }
          finish(sawAudio);
          break;
        default:
          break;
      }
    };

    ws.onerror = () => finish(sawAudio);
    ws.onclose = () => finish(sawAudio);
  });
}
