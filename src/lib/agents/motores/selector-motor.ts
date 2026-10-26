/**
 * StarSeed OS — Agentes · motores (lógica pura).
 * Un contrato de agente y varios motores intercambiables (SOP
 * `architecture/repos-3d-oido-agentes-1023.md` §3). Los modelos van siempre por
 * el enrutador propio (gratis primero, relevo ante 429/402) y las trazas de
 * terceros quedan apagadas. Sin disco, red ni `node:*`: SSR-safe.
 */

export type MotorId = "nativo" | "mastra" | "langgraph" | "pydantic-ai" | "openai-agents" | "agno";
export type MotorLenguaje = "TypeScript" | "Python";

export interface MotorDef {
  id: MotorId;
  nombre: string;
  lenguaje: MotorLenguaje;
  donde: string;
  adaptador: boolean;
  /** Qué aporta al contrato común. */
  motivo: string;
  /** Por qué aún no se puede usar (vacío si ya tiene adaptador). */
  pendiente: string;
}

export interface AgenteParaMotor {
  capabilities?: readonly string[];
}

export interface OpcionesMotor {
  /** Adaptadores ya instalados, para adelantar un «próximamente». */
  adaptadores?: readonly MotorId[];
}

export interface SugerenciaMotor {
  id: MotorId;
  nombre: string;
  lenguaje: MotorLenguaje;
  donde: string;
  motivo: string;
  disponible: boolean;
  pendiente: string | null;
}

export const MOTORES: readonly MotorDef[] = [
  { id: "nativo", nombre: "Nativo (enrutador propio)", lenguaje: "TypeScript", donde: "Navegador y neurona", adaptador: true, motivo: "Ya corre en el OS: modelos por el enrutador propio, gratis primero y relevo ante 429/402.", pendiente: "" },
  { id: "mastra", nombre: "Mastra", lenguaje: "TypeScript", donde: "Neurona · servidor de IA", adaptador: false, motivo: "Agentes y flujos en TypeScript con la persona en el bucle.", pendiente: "Aún sin adaptador: llegará como motor enchufable del contrato común, junto al servidor de IA." },
  { id: "langgraph", nombre: "LangGraph", lenguaje: "Python", donde: "MetaGenesis · Python", adaptador: false, motivo: "Flujos largos con estado duradero y memoria.", pendiente: "Aún sin adaptador; sin LangSmith y con las trazas de terceros apagadas." },
  { id: "pydantic-ai", nombre: "Pydantic AI", lenguaje: "Python", donde: "MetaGenesis · Python", adaptador: false, motivo: "Salidas validadas: decisiones con forma exacta.", pendiente: "Aún sin adaptador: el contrato de agente todavía no lo enchufa." },
  { id: "openai-agents", nombre: "OpenAI Agents SDK", lenguaje: "Python", donde: "PoliGenesis · Python", adaptador: false, motivo: "Equipos con traspasos y guardas entre roles.", pendiente: "Aún sin adaptador; con `set_tracing_disabled(True)` y sin nubes del autor." },
  { id: "agno", nombre: "Agno", lenguaje: "Python", donde: "Genesis · Python", adaptador: false, motivo: "Equipos Python con memoria, conocimiento y aprobación humana.", pendiente: "Aún sin adaptador: el contrato de agente todavía no lo enchufa." },
];

interface ReglaMotor {
  motor: MotorId;
  capacidades: readonly string[];
  motivo: string;
}

/** Primera regla que casa con alguna capacidad; si ninguna, el nativo. */
const REGLAS: readonly ReglaMotor[] = [
  { motor: "openai-agents", capacidades: ["handoff", "voice", "voice-realtime", "voice-engines", "voice-neural"], motivo: "Necesita traspasos entre roles o voz: encaja con el SDK de agentes." },
  { motor: "langgraph", capacidades: ["flow-builder", "flow-automation", "agent-memory-layered", "agent-memory-backend"], motivo: "Flujo largo con memoria: necesita estado duradero entre pasos." },
  { motor: "pydantic-ai", capacidades: ["pm", "data-science-fasta", "security-audit", "router-proxy"], motivo: "Decisiones con forma exacta: conviene validar la salida del modelo." },
  { motor: "agno", capacidades: ["rag-knowledge", "rag-workspace", "deep-research", "research", "web-senses", "agent-recipes"], motivo: "Investigación y conocimiento: equipos con memoria y fuentes propias." },
  { motor: "mastra", capacidades: ["multi-agent-code", "dev-agent", "app-builder", "agent-delegation"], motivo: "Varios agentes escribiendo: flujos en TypeScript dentro de la neurona." },
];

/** Devuelve la ficha del motor o el nativo si el id no existe. */
export function motorPorId(id: MotorId): MotorDef {
  return MOTORES.find((m) => m.id === id) ?? MOTORES[0];
}

/** Sugiere el motor más adecuado para las capacidades del agente. */
export function elegirMotor(
  agente?: AgenteParaMotor | null,
  opciones: OpcionesMotor = {},
): SugerenciaMotor {
  const capacidades = new Set(agente?.capabilities ?? []);
  const regla = REGLAS.find((r) => r.capacidades.some((c) => capacidades.has(c)));
  const motor = motorPorId(regla?.motor ?? "nativo");
  const disponible = motor.adaptador || (opciones.adaptadores ?? []).includes(motor.id);

  return {
    id: motor.id,
    nombre: motor.nombre,
    lenguaje: motor.lenguaje,
    donde: motor.donde,
    motivo:
      regla?.motivo ??
      "Sin capacidades que pidan otra cosa: el nativo es lo más barato y siempre está listo.",
    disponible,
    pendiente: disponible ? null : motor.pendiente,
  };
}
