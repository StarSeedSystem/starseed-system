"use client";

/**
 * voicebox-engine.ts — OpenVoiceHybridRouter + Voicebox (Local/Web) para Astraura.
 * ============================================================================
 * Voicebox (https://github.com/jamiepine/voicebox) es el motor PRINCIPAL y
 * RECOMENDADO de la rama OpenVoice, en una arquitectura híbrida Local/Web que
 * mantiene intacto el enrutamiento de personalidades:
 *
 *   · PRIORIDAD LOCAL (neuronas desktop: macOS/Windows/Linux): el sistema
 *     inicializa de forma NATIVA la integración con la app local de Voicebox
 *     (VoiceboxLocalEngine → REST 127.0.0.1:17493). Sin claves, sin nube.
 *   · VARIANTE WEB (Cerebro en la nube): VoiceboxWebClient valida primero la API
 *     Key del usuario (BrainApiManager) y, solo si existe, hace el llamado
 *     REST/WS al servicio en línea. Es OPCIONAL: las opciones predeterminadas
 *     siguen siendo los motores open-source/gratuitos (OpenVoice web).
 *
 * Fusión de personalidad (Astraura Identity): el perfil de la personalidad
 * activa (tono, velocidad, audio de referencia para clonación) se inyecta al
 * payload del motor local o web de forma transparente.
 *
 * BrainApiManager (auto-sync de keys por Cerebro/Usuario) vive en
 * brain-api-manager.ts de este mismo directorio.
 *
 * SSR-safe, defensivo. NUNCA lanza.
 */

import { BrainApiManager } from "@/lib/aurora/tts-oss/brain-api-manager";

// ── Constantes ───────────────────────────────────────────────────────────────

const VOICEBOX_LOCAL_HOST = "http://127.0.0.1:17493";
const VOICEBOX_WEB_HOST = "https://api.voicebox.studio"; // servicio en línea (requiere suscripción)
const SYNTH_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 2_500;

const VOICEBOX_LANGS = ["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "ko", "hi"] as const;
const VOICEBOX_ENGINES = ["qwen", "qwen_custom_voice", "luxtts", "chatterbox", "chatterbox_turbo", "tada", "kokoro"] as const;

function voiceboxLang(lang: string | undefined): string {
  const base = (lang || "es").trim().toLowerCase().slice(0, 2);
  return (VOICEBOX_LANGS as readonly string[]).includes(base) ? base : "en";
}

function looksLikeAudio(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 12) return false;
  // WAV: "RIFF"...."WAVE" | OGG: "OggS" | MP3: 0xFFFx/ID3 | FLAC: "fLaC"
  const h = bytes;
  const riff = h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x41 && h[10] === 0x56 && h[11] === 0x45;
  const ogg = h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53;
  const mp3 = h[0] === 0xff && (h[1] & 0xe0) === 0xe0 || (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33);
  const flac = h[0] === 0x66 && h[1] === 0x4c && h[2] === 0x61 && h[3] === 0x43;
  return riff || ogg || mp3 || flac;
}

// ── Perfil de personalidad (Astraura Identity) ───────────────────────────────

export interface VoiceboxPersonality {
  /** Id de la personalidad activa (para trazabilidad). */
  id?: string;
  /** brainId del cerebro activo (para el BrainApiManager). */
  brainId?: string | null;
  /** userId del usuario activo (para el BrainApiManager). */
  userId?: string | null;
  /** profile_id de Voicebox (app local) o id de voz en la nube. */
  profileId?: string;
  /** Idioma (es-ES, en-US…). */
  lang?: string;
  /** Tono / instrucción de entrega ("cálida", "serena"…). */
  tone?: string;
  /** Velocidad 0.5–2.0 (cuando el motor lo soporte). */
  speed?: number;
  /** Audio de referencia para clonación (Blob/dataURL), si el motor lo acepta. */
  refAudio?: string | Blob | null;
  /** Texto de referencia emparejado al audio de clonación. */
  refText?: string;
  /** Motor interno de Voicebox (qwen, chatterbox, kokoro…). */
  engine?: string;
}

// ── Resultado de síntesis ────────────────────────────────────────────────────

export interface VoiceboxSynthesisResult {
  blob: Blob | null;
  route: "local" | "web" | "none";
  reason?: string;
}

// ── VoiceboxLocalEngine ──────────────────────────────────────────────────────

export class VoiceboxLocalEngine {
  /** ¿Está viva la app local de Voicebox en este equipo? (sondeo ligero). */
  static async isAvailable(host = VOICEBOX_LOCAL_HOST): Promise<boolean> {
    try {
      if (typeof window === "undefined") return false;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      const r = await fetch(`${host}/`, { signal: ctrl.signal });
      clearTimeout(t);
      return r.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sintetiza por la app LOCAL de Voicebox. El perfil de voz (profile_id) es
   * OBLIGATORIO; la personalidad aporta tono/velocidad/referencia de clonación.
   */
  static async synthesize(
    text: string,
    personality: VoiceboxPersonality,
    opts: { host?: string; signal?: AbortSignal } = {},
  ): Promise<Blob | null> {
    try {
      if (typeof window === "undefined") return null;
      const host = opts.host || VOICEBOX_LOCAL_HOST;
      const profileId = personality.profileId || "";
      if (!profileId) return null; // Voicebox local exige profile_id

      const body: Record<string, unknown> = {
        profile_id: profileId,
        text,
        language: voiceboxLang(personality.lang),
        normalize: true,
      };
      if (personality.engine && (VOICEBOX_ENGINES as readonly string[]).includes(personality.engine)) {
        body.engine = personality.engine;
      }
      if (personality.tone) body.instruct = String(personality.tone).slice(0, 500);
      // Clonación por referencia (si Voicebox la acepta en el payload).
      if (personality.refAudio) body.reference_audio = personality.refAudio;
      if (personality.refText) body.reference_text = personality.refText;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), SYNTH_TIMEOUT_MS);
      if (opts.signal) opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });

      const res = await fetch(`${host}/api/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!looksLikeAudio(buf)) return null;
      const type = res.headers.get("content-type") || "audio/wav";
      return new Blob([buf], { type: type.split(";")[0] });
    } catch {
      return null;
    }
  }
}

// ── VoiceboxWebClient ────────────────────────────────────────────────────────

export class VoiceboxWebClient {
  /**
   * Intercepta la petición y VALIDA si hay credenciales (API Key del usuario
   * para este Cerebro) antes de llamar al servicio en línea. Sin key → null
   * (el router cae al siguiente eslabón open-source/gratuito).
   */
  static async synthesize(
    text: string,
    personality: VoiceboxPersonality,
    ctx: { brainId: string | null; userId: string | null; apiKey?: string; signal?: AbortSignal },
  ): Promise<Blob | null> {
    try {
      if (typeof window === "undefined") return null;
      const apiKey =
        ctx.apiKey ?? BrainApiManager.getKey(ctx.brainId, ctx.userId);
      if (!apiKey) return null; // sin suscripción → no se intenta

      const body: Record<string, unknown> = {
        profile_id: personality.profileId || "default",
        text,
        language: voiceboxLang(personality.lang),
        normalize: true,
      };
      if (personality.engine) body.engine = personality.engine;
      if (personality.tone) body.instruct = String(personality.tone).slice(0, 500);
      if (personality.refAudio) body.reference_audio = personality.refAudio;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), SYNTH_TIMEOUT_MS);
      if (ctx.signal) ctx.signal.addEventListener("abort", () => ctrl.abort(), { once: true });

      const res = await fetch(`${VOICEBOX_WEB_HOST}/v1/tts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!looksLikeAudio(buf)) return null;
      const type = res.headers.get("content-type") || "audio/wav";
      return new Blob([buf], { type: type.split(";")[0] });
    } catch {
      return null;
    }
  }
}

// ── OpenVoiceHybridRouter ────────────────────────────────────────────────────

export type VoiceboxRoute = "local" | "web" | "none";

export interface HybridRouteDecision {
  route: VoiceboxRoute;
  reason: string;
  /** Host a usar (local o web), cuando aplica. */
  host?: string;
}

/**
 * Decide entre Local y Web para la rama OpenVoice→Voicebox, manteniendo intacto
 * el enrutamiento de personalidades. Prioridad:
 *   1) LOCAL si la neurona es desktop y la app de Voicebox está viva.
 *   2) WEB si hay API Key de Voicebox para este Cerebro/Usuario (suscripción).
 *   3) NONE → el router de OmniVoice sigue con los motores open-source/gratuitos
 *      (OpenVoice web por defecto). Voicebox es OPCIONAL y recomendado, no forzado.
 */
export const OpenVoiceHybridRouter = {
  async decide(
    ctx: { brainId?: string | null; userId?: string | null; allowWeb?: boolean } = {},
  ): Promise<HybridRouteDecision> {
    try {
      // 1) Local: neurona desktop con la app viva.
      if (await VoiceboxLocalEngine.isAvailable()) {
        return { route: "local", reason: "app local de Voicebox detectada y viva", host: VOICEBOX_LOCAL_HOST };
      }
      // 2) Web: solo si el usuario tiene key para este cerebro.
      if (ctx.allowWeb !== false && BrainApiManager.hasKey(ctx.brainId ?? null, ctx.userId ?? null)) {
        return { route: "web", reason: "API Key de Voicebox disponible para este cerebro", host: VOICEBOX_WEB_HOST };
      }
      // 3) Ninguna → cae a OpenVoice web (open-source, gratis).
      return {
        route: "none",
        reason: "Voicebox no disponible (sin app local ni API Key) → OmniVoice usa OpenVoice web por defecto",
      };
    } catch {
      return { route: "none", reason: "fallo al decidir ruta de Voicebox" };
    }
  },

  /**
   * Sintetiza con Voicebox (Local o Web según la decisión del router) inyectando
   * la personalidad activa. Devuelve el Blob o null (para que la cadena de
   * OmniVoice continue con el siguiente eslabón si Voicebox no entrega).
   */
  async synthesize(
    text: string,
    personality: VoiceboxPersonality,
    ctx: { brainId?: string | null; userId?: string | null; allowWeb?: boolean; signal?: AbortSignal } = {},
  ): Promise<VoiceboxSynthesisResult> {
    const decision = await this.decide(ctx);
    if (decision.route === "local") {
      const blob = await VoiceboxLocalEngine.synthesize(text, personality, { host: decision.host, signal: ctx.signal });
      return { blob, route: "local" };
    }
    if (decision.route === "web") {
      // Resuelve userId de la personalidad o del contexto de sesión si falta.
      let userId = ctx.userId ?? personality.userId ?? null;
      if (!userId) {
        try {
          const { getCurrentUserId } = await import("@/lib/os-social");
          userId = (await getCurrentUserId()) || null;
        } catch {
          /* */
        }
      }
      const blob = await VoiceboxWebClient.synthesize(text, personality, {
        brainId: ctx.brainId ?? personality.brainId ?? null,
        userId,
        signal: ctx.signal,
      });
      return { blob, route: "web" };
    }
    return { blob: null, route: "none", reason: decision.reason };
  },
};

// ── Resolución de personalidad activa (flujo Astraura) ────────────────────────

/**
 * Trae la personalidad activa del módulo de personalidades y la mapea al perfil
 * de Voicebox. Reutiliza las mismas fuentes que el resto de motores. Nunca lanza.
 */
export async function resolveVoiceboxPersonality(
  override?: VoiceboxPersonality,
): Promise<VoiceboxPersonality> {
  const base: VoiceboxPersonality = override ?? {};
  try {
    if (base.profileId && base.lang) return base; // ya completo
    const mod = await import("@/lib/aurora/personalities");
    const profile =
      (typeof mod.getActivePersonality === "function" ? mod.getActivePersonality() : null) ??
      (typeof mod.resolvePersonalityForContext === "function" ? mod.resolvePersonalityForContext({}) : null);
    if (!profile) return base;
    // voiceStyle tiene forma variada según la personalidad; accedemos de forma
    // tolerante sin acoplarnos a un tipo estricto.
    const vs = (profile.voiceStyle ?? {}) as Record<string, any>;
    const omni = (vs.omni ?? {}) as Record<string, any>;
    const vb = (vs.voicebox ?? {}) as Record<string, any>;
    // El contexto de personalidad puede traer el brainId activo.
    let brainId: string | null = null;
    try {
      const ctxMod = await import("@/lib/aurora/personalities");
      const ctx = typeof ctxMod.resolvePersonalityForContext === "function"
        ? ctxMod.resolvePersonalityForContext({})
        : null;
      if (ctx && (ctx as any).brainId) brainId = (ctx as any).brainId;
    } catch {
      /* */
    }
    return {
      id: profile.id,
      brainId: base.brainId ?? brainId,
      userId: base.userId,
      profileId: base.profileId || vb.profileId || vs.voice,
      lang: base.lang || profile.idioma || "es",
      tone: base.tone || vs.tone || omni.instruct,
      speed: base.speed ?? vs.speed,
      refAudio: base.refAudio ?? vs.refAudio,
      refText: base.refText,
      engine: base.engine || vb.engine,
    };
  } catch {
    return base;
  }
}
