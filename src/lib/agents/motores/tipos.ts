import type { Agent } from "../model";

/**
 * StarSeed OS — Agentes · CONTRATO DE MOTORES (tipos puros, sin I/O).
 * SOP `architecture/repos-3d-oido-agentes-1023.md` §3: UN contrato de agente
 * (`model.ts`) y VARIOS motores; modelos SIEMPRE por el enrutador propio
 * (gratis primero), trazas de terceros apagadas y nada de LangSmith ni de las
 * nubes de los autores. Sin nodos, red ni procesos: los adaptadores viven en
 * su propia tarea.
 */

/** Motores del contrato; «nativo» es el del OS (Aurora+Astraura). */
export type MotorAgentes =
  "nativo" | "mastra" | "langgraph" | "pydantic-ai" | "openai-agents" | "agno";

/** Idioma en el que está escrito el motor. */
export type LenguajeMotor = "ts" | "py";

/** Dónde corre el motor: navegador, neurona Node o neurona Python. */
export type DondeCorreMotor = "navegador" | "neurona-node" | "neurona-python";

/** Capacidades que un motor aporta al contrato de agente. */
export type AporteMotor =
  "flujos-con-estado" | "persona-en-el-bucle" | "salidas-tipadas" | "traspasos" | "equipos";

/** Ficha declarativa de cada motor (licencia y aportes auditable en la UI). */
export interface FichaMotor {
  nombre: string;
  lenguaje: LenguajeMotor;
  dondeCorre: DondeCorreMotor;
  aportes: AporteMotor[];
  licencia: string;
  nota: string;
}

/** Fichas por motor (verificado 2026-10-23 en el SOP §1). */
export const MOTORES_AGENTES: Record<MotorAgentes, FichaMotor> = {
  nativo: {
    nombre: "Nativo del OS",
    lenguaje: "ts",
    dondeCorre: "navegador",
    aportes: ["persona-en-el-bucle"],
    licencia: "Propio (StarSeed OS)",
    nota: "El cerebro Aurora+Astraura por el enrutador propio; sin dependencias.",
  },
  mastra: {
    nombre: "Mastra",
    lenguaje: "ts",
    dondeCorre: "neurona-node",
    aportes: ["flujos-con-estado", "persona-en-el-bucle"],
    licencia: "Apache-2.0 (carpetas ee/ aparte, no se usan)",
    nota: "Motor TS de la neurona, junto al servidor de IA en Hono.",
  },
  langgraph: {
    nombre: "LangGraph",
    lenguaje: "py",
    dondeCorre: "neurona-python",
    aportes: ["flujos-con-estado", "persona-en-el-bucle"],
    licencia: "MIT",
    nota: "Ejecución duradera con reanudación; para flujos largos de MetaGenesis.",
  },
  "pydantic-ai": {
    nombre: "Pydantic AI",
    lenguaje: "py",
    dondeCorre: "neurona-python",
    aportes: ["salidas-tipadas", "persona-en-el-bucle"],
    licencia: "MIT",
    nota: "Salidas validadas por esquema; para directores con decisiones exactas.",
  },
  "openai-agents": {
    nombre: "OpenAI Agents SDK",
    lenguaje: "py",
    dondeCorre: "neurona-python",
    aportes: ["traspasos", "persona-en-el-bucle"],
    licencia: "MIT",
    nota: "Traspasos entre roles y guardas; trazas de terceros apagadas.",
  },
  agno: {
    nombre: "Agno",
    lenguaje: "py",
    dondeCorre: "neurona-python",
    aportes: ["equipos", "persona-en-el-bucle"],
    licencia: "Apache-2.0",
    nota: "AgentOS: equipos de agentes con memoria compartida.",
  },
};

/** Lo que pide la tarea al motor: banderas booleanas opcionales. */
export interface NecesidadesAgentes {
  ejecucionLargaConReanudacion?: boolean;
  salidaConEsquema?: boolean;
  traspasos?: boolean;
  equipoConMemoriaCompartida?: boolean;
  correrEnNeuronaNode?: boolean;
}

/**
 * Regla pura de elección (SOP §3, en el orden que la da):
 * 1) nativo por defecto — la regla primero, sin dependencias nuevas;
 * 2) LangGraph si hay ejecución larga con reanudación;
 * 3) Pydantic AI si la salida debe validar un esquema;
 * 4) OpenAI Agents si hay traspasos entre roles;
 * 5) Agno si es un equipo con memoria compartida;
 * 6) Mastra si corre en la neurona en TS.
 * Solo la primera bandera activa manda: un motor por agente.
 */
export function elegirMotor(
  _agente: Pick<Agent, "id">,
  necesidades: NecesidadesAgentes,
): MotorAgentes {
  if (necesidades.ejecucionLargaConReanudacion) return "langgraph";
  if (necesidades.salidaConEsquema) return "pydantic-ai";
  if (necesidades.traspasos) return "openai-agents";
  if (necesidades.equipoConMemoriaCompartida) return "agno";
  if (necesidades.correrEnNeuronaNode) return "mastra";
  return "nativo";
}
