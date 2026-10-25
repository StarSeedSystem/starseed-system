/**
 * VOZ ACTIVA — jerarquía única de decisión del motor de voz (SGO1024D).
 * Hallado por VOZ1024B: `resolveActiveVoiceEngine` (engine-registry) leía el
 * pin cacheado y casi siempre devolvía el pin por defecto (`openvoice2`), por
 * eso el router casi nunca preparaba el guion multi-locutor de VibeVoice y
 * todo sonaba como «Speaker 0». Esta capa PURA (sin red, sin disco, nunca
 * lanza) resuelve el motor EFECTIVO con la misma precedencia del resto del
 * OS (Adenda 153) y de la cadena de voz: agente > personalidad > cerebro >
 * neurona > cuenta > cadena AUTO. Si ningún ámbito fija motor devuelve
 * `null`, y el llamador usa la selección automática de `buildVoiceChain`.
 */

import {
  isVoiceEngineId,
  type AuroraVoiceConfig,
  type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import type { VoiceChainLink } from "@/lib/aurora/tts-oss/engine-registry";

/** Ámbito que puede fijar el motor de voz (de más específico a más general). */
export type VoiceHierarchyScope = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta";

/** Elección de motor de un ámbito. `motor` ausente = hereda del siguiente. */
export interface VoiceScopeChoice { motor?: string | null; }

/** Elecciones guardadas por ámbito. */
export interface VoiceHierarchyStore {
  agente?: Record<string, VoiceScopeChoice>;
  personalidad?: Record<string, VoiceScopeChoice>;
  cerebro?: Record<string, VoiceScopeChoice>;
  neurona?: Record<string, VoiceScopeChoice>;
  cuenta?: VoiceScopeChoice;
}

/** Contexto del turno: qué agente, personalidad, cerebro y neurona hablan. */
export interface VoiceHierarchyContext {
  agentId?: string | null; personaId?: string | null;
  brainId?: string | null; deviceId?: string | null;
}

/** Motor elegido y de qué ámbito salió. */
export interface ResolvedVoiceChoice {
  motor: AuroraVoiceEngine; provenance: VoiceHierarchyScope; scopeId?: string;
}

/** Forma mínima del perfil de personalidad que influye en la voz. */
export interface PersonalityVoiceShape {
  intelligence?: {
    modo?: string; motorVoz?: string; porSentido?: { voz?: { fuente?: string } };
  } | null;
  voiceStyle?: { engine?: string } | null;
}

/** Config de voz persistida (solo lo que decide el motor). */
export type VoiceConfigShape = Pick<AuroraVoiceConfig, "engine" | "autoDownload">;

/** Normaliza un id de motor: solo devuelve motores conocidos, nunca lanza. */
function motorDe(v: unknown): AuroraVoiceEngine | null {
  return isVoiceEngineId(v) ? v : null;
}
/** Elige el motor de un mapa por id (agente/personalidad/cerebro/neurona). */
function deMapa(
  mapa: Record<string, VoiceScopeChoice> | undefined,
  id: string | null | undefined,
  provenance: VoiceHierarchyScope,
): ResolvedVoiceChoice | null {
  if (!id || !mapa) return null; const motor = motorDe(mapa[id]?.motor);
  return motor ? { motor, provenance, scopeId: id } : null;
}

/** Motor fijado por la JERARQUÍA, o `null` si ningún ámbito elige (⇒ AUTO). */
export function resolveVoiceChoiceFrom(
  store: VoiceHierarchyStore, ctx: VoiceHierarchyContext = {},
): ResolvedVoiceChoice | null {
  const cuenta = motorDe(store.cuenta?.motor);
  return deMapa(store.agente, ctx.agentId, "agente")
    ?? deMapa(store.personalidad, ctx.personaId, "personalidad")
    ?? deMapa(store.cerebro, ctx.brainId, "cerebro")
    ?? deMapa(store.neurona, ctx.deviceId, "neurona")
    ?? (cuenta ? { motor: cuenta, provenance: "cuenta" } : null);
}

/**
 * Motor preferido por una PERSONALIDAD, con la MISMA regla que
 * `refreshPersonalityVoicePin`: `motorVoz` o `porSentido.voz.fuente` solo
 * en modo «fija»; `voiceStyle.engine` en cualquier modo. Nunca lanza.
 */
export function voiceChoiceFromPersonality(profile: PersonalityVoiceShape | null | undefined): AuroraVoiceEngine | null {
  const intel = profile?.intelligence;
  if (intel?.modo === "fija") {
    const directo = motorDe(intel.motorVoz);
    if (directo) return directo;
    return motorDe(intel.porSentido?.voz?.fuente);
  }
  return motorDe(profile?.voiceStyle?.engine);
}
/** Motor fijado por ESTA neurona para una personalidad (override A149). */
export function voiceChoiceFromOverride(overrides: { voz?: { motor?: string } } | null | undefined): AuroraVoiceEngine | null {
  return motorDe(overrides?.voz?.motor);
}

/** Motor elegido en la CUENTA (Ajustes → Voz); el navegador no fija nada. */
export function voiceChoiceFromConfig(cfg: VoiceConfigShape | null | undefined): AuroraVoiceEngine | null {
  return cfg?.engine === "browser" ? null : motorDe(cfg?.engine);
}

/**
 * Primer eslabón que DE VERDAD puede hablar, mismo filtro que
 * `resolveActiveVoiceEngine`: Kokoro solo cuenta con modelo listo o descarga
 * autorizada; Kitten sigue siendo un stub.
 */
export function activeEngineFromChain(
  chain: readonly VoiceChainLink[],
  cfg?: Pick<AuroraVoiceConfig, "autoDownload"> | null,
): AuroraVoiceEngine {
  const activo = chain.find(
    (link) => (link === "kokoro" ? cfg?.autoDownload === true : link !== "kitten"),
  );
  return activo ?? "browser";
}
