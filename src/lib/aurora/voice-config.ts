"use client";

/**
 * VOZ ACTIVA — jerarquía única de decisión del motor de voz.
 * ==========================================================
 * `resolveActiveVoiceEngine` (engine-registry) lee el pin CACHEADO: si nadie
 * llamó a `refreshPersonalityVoicePin`, devuelve el pin por defecto
 * (`openvoice2`) aunque la personalidad o la neurona hayan fijado otro motor.
 * El router preguntaba ahí si el motor era VibeVoice y por eso casi nunca
 * preparaba el guion multi-locutor (todo sonaba como Speaker 0).
 *
 * Esta capa resuelve el motor EFECTIVO con la misma precedencia que el resto
 * del OS (Adenda 153) y que la cadena de voz:
 *
 *   agente > personalidad > cerebro > neurona > cuenta > cadena AUTO
 *
 * Es PURA (entrada → salida): no toca red ni disco y nunca lanza. El llamador
 * le pasa las elecciones que ya conoce; si ningún ámbito fija motor, devuelve
 * `null` y manda la selección automática de `buildVoiceChain`.
 */

import {
  isVoiceEngineId,
  type AuroraVoiceConfig,
  type AuroraVoiceEngine,
} from "@/lib/aurora/tts-oss/voice-config";
import type { VoiceChainLink } from "@/lib/aurora/tts-oss/engine-registry";

/** Ámbito que puede fijar el motor de voz (de más específico a más general). */
export type VoiceHierarchyScope =
  | "agente"
  | "personalidad"
  | "cerebro"
  | "neurona"
  | "cuenta";

/** Elección de motor de un ámbito. `motor` ausente = hereda del siguiente. */
export interface VoiceScopeChoice {
  motor?: string | null;
}

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
  agentId?: string | null;
  personaId?: string | null;
  brainId?: string | null;
  deviceId?: string | null;
}

/** Motor elegido y de qué ámbito salió. */
export interface ResolvedVoiceChoice {
  motor: AuroraVoiceEngine;
  provenance: VoiceHierarchyScope;
  scopeId?: string;
}

/** Forma mínima del perfil de personalidad que influye en la voz. */
export interface PersonalityVoiceShape {
  intelligence?: {
    modo?: string;
    motorVoz?: string;
    porSentido?: { voz?: { fuente?: string } };
  } | null;
  voiceStyle?: { engine?: string } | null;
}

/** Config de voz persistida (solo lo que decide el motor). */
export type VoiceConfigShape = Pick<AuroraVoiceConfig, "engine" | "autoDownload">;

/** Normaliza un id de motor: solo devuelve motores conocidos. */
function motorDe(v: unknown): AuroraVoiceEngine | null {
  return isVoiceEngineId(v) ? v : null;
}

/** Elige en un mapa por id (agente/personalidad/cerebro/neurona). */
function deMapa(
  mapa: Record<string, VoiceScopeChoice> | undefined,
  id: string | null | undefined,
  provenance: VoiceHierarchyScope,
): ResolvedVoiceChoice | null {
  if (!id || !mapa) return null;
  const motor = motorDe(mapa[id]?.motor);
  return motor ? { motor, provenance, scopeId: id } : null;
}

/**
 * Motor fijado por la JERARQUÍA, o `null` si ningún ámbito elige (⇒ AUTO).
 * Precedencia: agente > personalidad > cerebro > neurona > cuenta.
 */
export function resolveVoiceChoiceFrom(
  store: VoiceHierarchyStore,
  ctx: VoiceHierarchyContext = {},
): ResolvedVoiceChoice | null {
  const cuenta = motorDe(store.cuenta?.motor);
  return (
    deMapa(store.agente, ctx.agentId, "agente") ??
    deMapa(store.personalidad, ctx.personaId, "personalidad") ??
    deMapa(store.cerebro, ctx.brainId, "cerebro") ??
    deMapa(store.neurona, ctx.deviceId, "neurona") ??
    (cuenta ? { motor: cuenta, provenance: "cuenta" } : null)
  );
}

/**
 * Motor preferido por una PERSONALIDAD, con la MISMA regla que
 * `refreshPersonalityVoicePin`: `motorVoz` o `porSentido.voz.fuente` solo en
 * modo «fija»; `voiceStyle.engine` en cualquier modo. Nunca lanza.
 */
export function voiceChoiceFromPersonality(
  profile: PersonalityVoiceShape | null | undefined,
): AuroraVoiceEngine | null {
  const intel = profile?.intelligence;
  if (intel?.modo === "fija") {
    const directo = motorDe(intel.motorVoz);
    if (directo) return directo;
    const porSentido = motorDe(intel.porSentido?.voz?.fuente);
    if (porSentido) return porSentido;
  }
  return motorDe(profile?.voiceStyle?.engine);
}

/** Motor fijado por ESTA neurona para una personalidad (override A149). */
export function voiceChoiceFromOverride(
  overrides: { voz?: { motor?: string } } | null | undefined,
): AuroraVoiceEngine | null {
  return motorDe(overrides?.voz?.motor);
}

/** Motor elegido en la CUENTA (Ajustes → Voz); el navegador no fija nada. */
export function voiceChoiceFromConfig(
  cfg: VoiceConfigShape | null | undefined,
): AuroraVoiceEngine | null {
  return cfg?.engine === "browser" ? null : motorDe(cfg?.engine);
}

/**
 * Primer eslabón que DE VERDAD puede hablar en esta cadena, con el mismo
 * filtro que `resolveActiveVoiceEngine`: Kokoro solo cuenta si su modelo está
 * listo o el usuario autorizó la descarga, y Kitten sigue siendo un stub.
 */
export function activeEngineFromChain(
  chain: readonly VoiceChainLink[],
  cfg?: Pick<AuroraVoiceConfig, "autoDownload"> | null,
): AuroraVoiceEngine {
  for (const link of chain) {
    if (link === "kokoro" && !cfg?.autoDownload) continue;
    if (link === "kitten") continue;
    return link;
  }
  return "browser";
}
