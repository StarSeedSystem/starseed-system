/**
 * VOZ ACTIVA — jerarquía única de decisión del motor de voz.
 * ==========================================================
 * `resolveActiveVoiceEngine` lee el pin CACHEADO: si nadie llamó a
 * `refreshPersonalityVoicePin`, devuelve el predeterminado (`openvoice2`)
 * aunque la personalidad, el cerebro o esta neurona hayan fijado otro motor.
 * Por eso el router casi nunca veía VibeVoice y su guion multi-locutor no se
 * preparaba (todo sonaba como Speaker 0).
 *
 * Precedencia (igual que el sistema primario y la cadena de voz):
 *   agente > personalidad > cerebro > neurona > cuenta > cadena AUTO
 *
 * Es PURA (entrada → salida): no toca red ni disco y nunca lanza. Sin ningún
 * ámbito que fije motor devuelve `null` y manda `buildVoiceChain`.
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

/** Etiquetas de procedencia para la UI. */
export const VOICE_HIERARCHY_LABEL: Record<VoiceHierarchyScope, string> = {
  agente: "Fijado por el agente",
  personalidad: "Fijado por la personalidad",
  cerebro: "Fijado por el cerebro",
  neurona: "Fijado por esta neurona",
  cuenta: "Elección de la cuenta",
};

/** Id de motor reconocido y distinto de «navegador» (el navegador es el suelo). */
export function esMotorVozPin(v: unknown): v is AuroraVoiceEngine {
  return isVoiceEngineId(v) && v !== "browser";
}

function motorDe(v: unknown): AuroraVoiceEngine | null {
  return esMotorVozPin(v) ? v : null;
}

function deMapa(
  mapa: Record<string, VoiceScopeChoice> | undefined,
  id: string | null | undefined,
  provenance: VoiceHierarchyScope,
): ResolvedVoiceChoice | null {
  if (!id || !mapa) return null;
  const motor = motorDe(mapa[id]?.motor);
  return motor ? { motor, provenance, scopeId: id } : null;
}

/** Motor fijado por la JERARQUÍA, o `null` si ningún ámbito elige (⇒ AUTO). */
export function resolveVoiceChoiceFrom(
  store: VoiceHierarchyStore | null | undefined,
  ctx: VoiceHierarchyContext = {},
): ResolvedVoiceChoice | null {
  try {
    const cuenta = motorDe(store?.cuenta?.motor);
    return (
      deMapa(store?.agente, ctx?.agentId, "agente") ??
      deMapa(store?.personalidad, ctx?.personaId, "personalidad") ??
      deMapa(store?.cerebro, ctx?.brainId, "cerebro") ??
      deMapa(store?.neurona, ctx?.deviceId, "neurona") ??
      (cuenta ? { motor: cuenta, provenance: "cuenta" } : null)
    );
  } catch {
    return null;
  }
}

/** Motor de la personalidad: `motorVoz`/`porSentido` solo en «fija»; estilo siempre. */
export function voiceChoiceFromPersonality(
  profile: PersonalityVoiceShape | null | undefined,
): AuroraVoiceEngine | null {
  try {
    const intel = profile?.intelligence;
    if (intel?.modo === "fija") {
      const directo = motorDe(intel.motorVoz);
      if (directo) return directo;
      const porSentido = motorDe(intel.porSentido?.voz?.fuente);
      if (porSentido) return porSentido;
    }
    return motorDe(profile?.voiceStyle?.engine);
  } catch {
    return null;
  }
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
  return motorDe(cfg?.engine);
}

/** Primer eslabón que DE VERDAD puede hablar; Kokoro exige descarga autorizada. */
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
