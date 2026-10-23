/*
 * StarSeed OS — Agentes · Motores
 * Contrato puro: MotorAgentes + metadatos por motor + elegirMotor
 * Modelos siempre por enrutador propio (gratis primero). Trazas de terceros apagadas.
 */

import type { Agent } from "../model";

export type MotorAgentes =
  | "nativo"
  | "mastra"
  | "langgraph"
  | "pydantic-ai"
  | "openai-agents"
  | "agno";

export type LenguajeMotor = "ts" | "py";

export type DondeCorreMotor = "navegador" | "neurona-node" | "neurona-python";

export interface AportesMotor {
  /** Flujos con estado */
  flujosConEstado: boolean;
  /** Persona en el bucle */
  personaEnBucle: boolean;
  /** Salidas tipadas / validadas */
  salidasTipadas: boolean;
  /** Traspasos entre roles/agentes */
  traspasos: boolean;
  /** Equipos / colaboración multiagente */
  equipos: boolean;
}

export interface InfoMotor {
  id: MotorAgentes;
  /** Lenguaje principal del motor */
  lenguaje: LenguajeMotor;
  /** Dónde puede correr */
  dondeCorre: DondeCorreMotor[];
  /** Qué aporta */
  aporta: AportesMotor;
  /** Licencia declarada */
  licencia: string;
}

/** Metadatos por motor según contrato 1023A */
export const MOTORES_INFO: Record<MotorAgentes, InfoMotor> = {
  nativo: {
    id: "nativo",
    lenguaje: "ts",
    dondeCorre: ["navegador", "neurona-node"],
    aporta: {
      flujosConEstado: false,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: false,
      equipos: false,
    },
    licencia: "propio",
  },
  mastra: {
    id: "mastra",
    lenguaje: "ts",
    dondeCorre: ["neurona-node"],
    aporta: {
      flujosConEstado: true,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: false,
      equipos: false,
    },
    licencia: "Apache-2.0",
  },
  langgraph: {
    id: "langgraph",
    lenguaje: "py",
    dondeCorre: ["neurona-python"],
    aporta: {
      flujosConEstado: true,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: false,
      equipos: false,
    },
    licencia: "MIT",
  },
  "pydantic-ai": {
    id: "pydantic-ai",
    lenguaje: "py",
    dondeCorre: ["neurona-python"],
    aporta: {
      flujosConEstado: true,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: false,
      equipos: false,
    },
    licencia: "MIT",
  },
  "openai-agents": {
    id: "openai-agents",
    lenguaje: "py",
    dondeCorre: ["neurona-python"],
    aporta: {
      flujosConEstado: true,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: true,
      equipos: true,
    },
    licencia: "MIT",
  },
  agno: {
    id: "agno",
    lenguaje: "py",
    dondeCorre: ["neurona-python"],
    aporta: {
      flujosConEstado: true,
      personaEnBucle: true,
      salidasTipadas: true,
      traspasos: false,
      equipos: true,
    },
    licencia: "Apache-2.0",
  },
};

export interface NecesidadesMotor {
  /** Ejecución larga con reanudación */
  ejecucionLargaConReanudacion?: boolean;
  /** Salida debe validar un esquema */
  salidaConEsquema?: boolean;
  /** Traspasos entre roles */
  traspasosEntreRoles?: boolean;
  /** Equipo con memoria compartida */
  equipoConMemoriaCompartida?: boolean;
  /** Corre en la neurona en TS */
  correrEnNeuronaTS?: boolean;
}

/**
 * Sugiere motor puro según agente y necesidades.
 * Nativo por defecto; reglas en orden: LangGraph, Pydantic AI, OpenAI Agents, Agno, Mastra.
 */
export function elegirMotor(
  _agente: Agent | Partial<Agent> = {},
  necesidades: NecesidadesMotor = {}
): MotorAgentes {
  if (necesidades.ejecucionLargaConReanudacion) {
    return "langgraph";
  }
  if (necesidades.salidaConEsquema) {
    return "pydantic-ai";
  }
  if (necesidades.traspasosEntreRoles) {
    return "openai-agents";
  }
  if (necesidades.equipoConMemoriaCompartida) {
    return "agno";
  }
  if (necesidades.correrEnNeuronaTS) {
    return "mastra";
  }
  return "nativo";
}
