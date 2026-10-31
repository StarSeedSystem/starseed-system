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
 * Esta capa resuelve el motor EFECTIVO con el MISMO orden que la cadena que
 * suena de verdad (`refreshPersonalityVoicePin`, Adenda 149):
 *
 *   agente > neurona > personalidad > cerebro > cuenta > cadena AUTO
 *
 * (SGO1031A) Manda lo que suena: el override neurona×personalidad describe el
 * hardware de ESTE dispositivo y la cadena real lo pone por delante del pin de
 * la personalidad. Aquí mandaba la personalidad (orden genérico de la Adenda
 * 153) y, con personalidad=omnivoice y neurona=vibevoice, sonaba VibeVoice sin
 * que el router preparase su guion multi-locutor.
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

/** Ámbito que puede fijar el motor de voz (en orden de precedencia). */
export type VoiceHierarchyScope =
  | "agente"
  | "neurona"
  | "personalidad"
  | "cerebro"
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

/**
 * Normaliza un id de motor: solo devuelve motores conocidos. Tolera espacios y
 * mayúsculas de valores guardados a mano (`" VibeVoice "`), pero nunca inventa
 * un motor: lo desconocido se descarta y el ámbito hereda del siguiente.
 */
function motorDe(v: unknown): AuroraVoiceEngine | null {
  if (typeof v !== "string") return null;
  const limpio = v.trim().toLowerCase();
  return isVoiceEngineId(limpio) ? limpio : null;
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
 * Precedencia sobre un store ya completo: agente > neurona > personalidad >
 * cerebro > cuenta. La neurona va delante de la personalidad como en
 * `refreshPersonalityVoicePin` (paso 0); agente y cerebro no existen en la
 * cadena real y conservan su sitio relativo.
 */
function elegirDeStore(
  store: VoiceHierarchyStore,
  ctx: VoiceHierarchyContext,
): ResolvedVoiceChoice | null {
  const cuenta = motorDe(store.cuenta?.motor);
  return (
    deMapa(store.agente, ctx.agentId, "agente") ??
    deMapa(store.neurona, ctx.deviceId, "neurona") ??
    deMapa(store.personalidad, ctx.personaId, "personalidad") ??
    deMapa(store.cerebro, ctx.brainId, "cerebro") ??
    (cuenta ? { motor: cuenta, provenance: "cuenta" } : null)
  );
}

/**
 * Motor fijado por la JERARQUÍA, o `null` si ningún ámbito elige (⇒ AUTO).
 * Precedencia: agente > neurona > personalidad > cerebro > cuenta.
 *
 * Pasa SIEMPRE por `resolveVoiceChoice` (y este por `voiceHierarchyStoreFrom`):
 * es el único camino que completa el store, así que no queda una segunda
 * precedencia que se pueda desincronizar de la cadena de voz.
 */
export function resolveVoiceChoiceFrom(
  store: VoiceHierarchyStore,
  ctx: VoiceHierarchyContext = {},
): ResolvedVoiceChoice | null {
  return resolveVoiceChoice({ store, ctx });
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
 * Fuentes CRUDAS de un turno, tal como las tiene el llamador (router): las
 * elecciones guardadas por ámbito, el contexto de quién habla y los pines que
 * viven fuera del store (personalidad, neurona×personalidad y cuenta).
 */
export interface VoiceHierarchySources {
  /** Elecciones ya guardadas por ámbito. Manda sobre lo derivado. */
  store?: VoiceHierarchyStore;
  /** Qué agente, personalidad, cerebro y neurona hablan en este turno. */
  ctx?: VoiceHierarchyContext;
  /** Perfil de la personalidad activa (pin de voz). */
  personality?: PersonalityVoiceShape | null;
  /** Override neurona×personalidad de esta neurona (Adenda 149). */
  override?: { voz?: { motor?: string } } | null;
  /** Config de la cuenta (Ajustes → Voz). */
  config?: VoiceConfigShape | null;
}

/**
 * Completa un mapa por id con un motor derivado, SIN pisar una elección válida
 * que ya estuviera guardada en el store. Si no hay id o motor, deja el mapa tal
 * cual: ese ámbito simplemente hereda del siguiente.
 */
function conMotor(
  mapa: Record<string, VoiceScopeChoice> | undefined,
  id: string | null | undefined,
  motor: AuroraVoiceEngine | null,
): Record<string, VoiceScopeChoice> | undefined {
  if (!id || !motor) return mapa;
  if (motorDe(mapa?.[id]?.motor)) return mapa;
  return { ...(mapa ?? {}), [id]: { ...(mapa?.[id] ?? {}), motor } };
}

/**
 * Construye el store de la jerarquía a partir de las fuentes crudas del turno:
 * lo guardado en `store` manda; lo que falte se deriva de la personalidad, del
 * override neurona×personalidad y de la cuenta. Función pura; nunca lanza.
 */
function voiceHierarchyStoreFrom(
  sources: VoiceHierarchySources = {},
): VoiceHierarchyStore {
  const store = sources.store ?? {};
  const ctx = sources.ctx ?? {};
  const cuentaMotor = motorDe(store.cuenta?.motor) ?? voiceChoiceFromConfig(sources.config);
  return {
    agente: store.agente,
    personalidad: conMotor(
      store.personalidad,
      ctx.personaId,
      voiceChoiceFromPersonality(sources.personality),
    ),
    cerebro: store.cerebro,
    neurona: conMotor(
      store.neurona,
      ctx.deviceId,
      voiceChoiceFromOverride(sources.override),
    ),
    cuenta: cuentaMotor ? { ...(store.cuenta ?? {}), motor: cuentaMotor } : store.cuenta,
  };
}

/**
 * Motor elegido por la JERARQUÍA a partir de las fuentes crudas del turno, o
 * `null` si ningún ámbito fija motor (⇒ manda la cadena AUTO). Es el mismo
 * camino que recorre `speakWithConfiguredEngine`, expuesto en una sola llamada
 * para que el router no recomponga la precedencia a mano.
 */
export function resolveVoiceChoice(
  sources: VoiceHierarchySources = {},
): ResolvedVoiceChoice | null {
  const ctx = sources.ctx ?? {};
  return elegirDeStore(voiceHierarchyStoreFrom(sources), ctx);
}

/**
 * (SGO1031B) Store del ROUTER con los ámbitos que de verdad fijan el PIN de la
 * cadena que suena (`refreshPersonalityVoicePin` → `buildVoiceChain`): el
 * override neurona×personalidad y la personalidad activa. Dos reglas que ya
 * desincronizaron el guion multi-locutor de VibeVoice:
 *
 *  · La CUENTA no entra: `buildVoiceChain` la mete como eslabón con `cfg.engine`
 *    (paso 2), nunca como pin. Si el router la contara, con cuenta=VibeVoice y
 *    el pin por defecto (openvoice2/omnivoice) disponible prepararía el guion
 *    mientras suena OpenVoice.
 *  · El override solo se aplica CON personalidad activa y deviceId: en la
 *    cadena real `neuronPersonaVoice` devuelve null sin ella, así que la clave
 *    comodín «*» del store no existe ahí.
 *
 * Pura: no lee disco ni red; el llamador pasa lo que ya tiene en mano.
 */
export function storeDelPinQueSuena(
  persona: (PersonalityVoiceShape & { id?: string }) | null | undefined,
  deviceId: string | null | undefined,
  override: { voz?: { motor?: string } } | null | undefined,
): VoiceHierarchyStore {
  const personaId = persona?.id || null;
  return {
    personalidad: conMotor(undefined, personaId, voiceChoiceFromPersonality(persona)),
    neurona: conMotor(
      undefined,
      deviceId && personaId ? deviceId : null,
      voiceChoiceFromOverride(override),
    ),
  };
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
