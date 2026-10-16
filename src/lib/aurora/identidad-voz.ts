"use client";

import { VOZ_POR_PERSONA } from "@/lib/aurora/voz-rt";
import { timbreActual, type Timbre } from "@/lib/aurora/timbres";
import { getModoVoz, generoEfectivo } from "@/lib/aurora/voz-inicial";

/** Categoría de origen de una voz. */
export type OrigenVoz =
  | "default"
  | "agent"
  | "personality"
  | "brain"
  | "neuron"
  | "account"
  | "stored";

/** Resolución unificada de identidad de voz con precedencia establecida. */
export interface IdentidadVoz {
  timbre: Timbre;
  motor: string;
  vozRT: string;
  origen: OrigenVoz;
  origenData?: {
    agente?: string;
    personalidad?: string;
    cerebro?: string;
    neurona?: string;
    cuenta?: string;
    almacenado?: string;
  };
}

/**
 * Resolver una identidad de voz unificada para una persona con múltiples fuentes de origen.
 *
 * Precedencia (primero gana):
 *  1. Agente (usado por agentes externos como Hermione)
 *  2. Personalidad (de la cuenta del usuario, definida por el usuario)
 *  3. Cerebro (modelo de base de la cuenta)
 *  4. Neurona (dispositivo físico donde corre el OS)
 *  5. Cuenta (vínculo del usuario a la red)
 *
 * Siempre lee de los mapas establecidos:
 *  - VOZ_POR_PERSONA (de voz-rt.ts)
 *  - ajustes de timbres de personalidad (voz-inicial, timbre-actual)
 *  - motor actual preferido de la cuenta (desde voice-config)
 */
export function identidadVoz(opts?: {
  agente?: string;
  personalidad?: string;
  cerebro?: string;
  neurona?: string;
  cuenta?: string;
}): IdentidadVoz {
  // 1. Agente
  if (opts?.agente) {
    return {
      timbre: timbreActual("femenina"),
      motor: "agent",
      vozRT: VOZ_POR_PERSONA["agent"] ?? "F1",
      origen: "agent",
      origenData: { agente: opts.agente },
    };
  }

  // 2. Personalidad
  if (opts?.personalidad) {
    const personaId = opts.personalidad.toLowerCase().replace(/\s+/g, "_");
    const timbre = timbreActual(generoEfectivo("femenina"));
    const motor = "voice Persona";
    const voz = VOZ_POR_PERSONA[personaId] ?? "F1";
    return {
      timbre,
      motor,
      vozRT: voz,
      origen: "personality",
      origenData: { personalidad: opts.personalidad },
    };
  }

  // 3. Cerebro
  if (opts?.cerebro) {
    const timbre = timbreActual("femenina");
    const motor = "brain-default";
    const voz = VOZ_POR_PERSONA["cerebro"] ?? "F2";
    return {
      timbre,
      motor,
      vozRT: voz,
      origen: "brain",
      origenData: { cerebro: opts.cerebro },
    };
  }

  // 4. Neurona
  if (opts?.neurona) {
    const timbre = timbreActual(generoEfectivo("masculina"));
    const motor = "local";
    const voz = VOZ_POR_PERSONA["neurona"] ?? "M1";
    return {
      timbre,
      motor,
      vozRT: voz,
      origen: "neuron",
      origenData: { neurona: opts.neurona },
    };
  }

  // 5. Cuenta
  if (opts?.cuenta) {
    const timbre = timbreActual("neutra");
    const motor = "account";
    const voz = VOZ_POR_PERSONA["account"] ?? "F1";
    return {
      timbre,
      motor,
      vozRT: voz,
      origen: "account",
      origenData: { cuenta: opts.cuenta },
    };
  }

  // Valor por defecto sin parámetros
  const timbre = timbreActual("femenina");
  const motor = "default";
  const voz = VOZ_POR_PERSONA.aurora ?? "F1";
  const almacenado = typeof window !== "undefined" ? window.localStorage.getItem("starseed.voz.timbre.v1") : undefined;
  return {
    timbre,
    motor,
    vozRT: voz,
    origen: "default",
    origenData: almacenado !== null ? { almacenado } : undefined,
  };
}
