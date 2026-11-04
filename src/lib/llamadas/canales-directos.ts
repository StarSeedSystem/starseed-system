"use client";

import type { EnlaceLocalVivo } from "@/lib/malla/registro-enlaces-locales";

const MAX_DIRECTOS = 7;

export interface CanalesDecision {
  enlaces: EnlaceLocalVivo[];
  texto: string;
  motivo?: string;
}

export function canalesParaLlamada({
  hayRedSupabase,
  enlaces,
  tema,
}: {
  hayRedSupabase: boolean;
  enlaces: EnlaceLocalVivo[];
  tema: string | null;
}): CanalesDecision {
  const vivos = enlaces.filter((e) => e.abierto()).slice(0, MAX_DIRECTOS);

  if (!hayRedSupabase) {
    if (vivos.length > 0) {
      return {
        enlaces: vivos,
        texto: "por enlace directo (misma red)",
      };
    }
    return {
      enlaces: [],
      texto: "",
      motivo: "Vincula un aparato desde \"Vincular sin internet\" o revisa tu conexión",
    };
  }

  if (vivos.length > 0 && tema) {
    return {
      enlaces: vivos,
      texto: "por enlace directo (misma red) y canal privado",
    };
  }

  if (vivos.length > 0) {
    return {
      enlaces: vivos,
      texto: "por enlace directo (misma red)",
    };
  }

  return {
    enlaces: [],
    texto: "",
    motivo: tema
      ? "El servidor no deja entrar en el canal privado de la llamada"
      : "Vincula un aparato desde \"Vincular sin internet\" o revisa tu conexión",
  };
}