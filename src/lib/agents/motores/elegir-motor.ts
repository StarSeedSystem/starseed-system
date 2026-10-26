/**
 * StarSeed OS — Agentes · elección de MOTOR (ola 1023A).
 * Un contrato de agente y varios motores; los modelos salen siempre por el
 * enrutador propio (gratis primero, relevo 429/402, ASTRAURA_CLOUD_URL → túnel →
 * fuentes libres) y las trazas de terceros van apagadas. Módulo puro, sin I/O.
 */
export type MotorId =
  | "nativo"
  | "mastra"
  | "langgraph"
  | "pydantic-ai"
  | "openai-agents"
  | "agno";
export interface Motor {
  id: MotorId;
  nombre: string;
  lenguaje: string;
  /** Dónde corre de verdad; nunca se finge una nube del autor. */
  dondeCorre: string;
  fuerteEn: string;
  disponible: boolean;
  /** Motivo visible mientras no exista adaptador en el OS. */
  motivoNoDisponible?: string;
}
/** Lo mínimo que necesita la elección; el tipo `Agent` encaja sin conversión. */
export interface AgenteParaMotor {
  name?: string;
  description?: string;
  persona?: string;
  capabilities?: readonly string[];
  motor?: string;
}
export interface SugerenciaMotor {
  /** Motor que puede ejecutar al agente HOY. */
  motor: Motor;
  /** Mejor encaje cuando aún no hay adaptador; null si ya corre. */
  ideal: Motor | null;
  motivos: string[];
}
export const ENRUTADOR_PROPIO =
  "Modelos por el enrutador propio: gratis primero, relevo ante 429/402 y ASTRAURA_CLOUD_URL → túnel → fuentes libres.";
export const SIN_TRAZAS =
  "Trazas de terceros apagadas: nada de LangSmith ni de las nubes de los autores.";
export const MOTORES: readonly Motor[] = [
  { id: "nativo", nombre: "Motor nativo del OS", lenguaje: "TypeScript · OS", disponible: true,
    dondeCorre: "En esta neurona: navegador o servidor Next.js, sin dependencias nuevas.",
    fuerteEn: "Persona, capacidades, memoria y herramientas del OS tal como están hoy." },
  { id: "mastra", nombre: "Mastra", lenguaje: "TypeScript", disponible: false,
    dondeCorre: "En la neurona, junto al servidor propio de IA (Hono); nunca en una nube del autor.",
    fuerteEn: "Flujos, RAG, evaluaciones y MCP en TypeScript, dentro del propio OS.",
    motivoNoDisponible: "Próximamente: falta su adaptador TS en el servidor propio de IA." },
  { id: "langgraph", nombre: "LangGraph", lenguaje: "Python", disponible: false,
    dondeCorre: "En una neurona con Python (no en el navegador del OS).",
    fuerteEn: "Flujos largos con estado que se reanudan tras un fallo.",
    motivoNoDisponible: "Próximamente: falta su adaptador Python para ejecución duradera." },
  { id: "pydantic-ai", nombre: "Pydantic AI", lenguaje: "Python", disponible: false,
    dondeCorre: "En una neurona con Python (no en el navegador del OS).",
    fuerteEn: "Decisiones con forma exacta: salidas y herramientas tipadas y validadas.",
    motivoNoDisponible: "Próximamente: falta su adaptador Python para salidas validadas." },
  { id: "openai-agents", nombre: "OpenAI Agents SDK", lenguaje: "Python", disponible: false,
    dondeCorre: "En una neurona con Python, con las trazas de OpenAI apagadas.",
    fuerteEn: "Equipos con traspasos entre roles y guardas de entrada y salida.",
    motivoNoDisponible: "Próximamente: falta su adaptador Python, con las trazas apagadas." },
  { id: "agno", nombre: "Agno", lenguaje: "Python", disponible: false,
    dondeCorre: "En una neurona con Python, en su AgentOS soberano.",
    fuerteEn: "Equipos con memoria, conocimiento, aprobación humana y RBAC.",
    motivoNoDisponible: "Próximamente: falta su adaptador Python para AgentOS." },
];
export function motorPorId(id: string): Motor | undefined {
  return MOTORES.find((m) => m.id === id);
}
export function esMotorId(valor: unknown): valor is MotorId {
  return typeof valor === "string" && MOTORES.some((m) => m.id === valor);
}
interface Senal {
  motor: MotorId;
  peso: number;
  patrones: readonly string[];
  motivo: string;
}
const SENALES: readonly Senal[] = [
  { motor: "mastra", peso: 3, patrones: ["typescript", "next.js", "app-builder", "eval", "rag", "mcp"],
    motivo: "Encaja en TypeScript dentro del servidor propio de IA: flujos, RAG y MCP sin salir del OS." },
  { motor: "langgraph", peso: 3, patrones: ["flujo largo", "durader", "reanud", "grafo", "estado", "meta"],
    motivo: "Pide un flujo largo con estado que se reanude tras un fallo: para eso está LangGraph." },
  { motor: "pydantic-ai", peso: 3, patrones: ["decisi", "director", "valid", "tipad", "forma exacta", "jev"],
    motivo: "Necesita decisiones con forma exacta y salidas validadas: Pydantic AI es el que mejor encaja." },
  { motor: "openai-agents", peso: 3, patrones: ["traspaso", "handoff", "guardas", "roles", "poli"],
    motivo: "Es un equipo con traspasos entre roles y guardas: OpenAI Agents SDK lo cubre de forma directa." },
  { motor: "agno", peso: 2, patrones: ["agno", "agentos", "conocimiento", "plataforma", "equipo", "memoria"],
    motivo: "Es un equipo con memoria y conocimiento: Agno los reúne en un AgentOS soberano." },
];
function motorObligatorio(id: MotorId): Motor {
  const motor = motorPorId(id);
  if (!motor) throw new Error(`Motor desconocido: ${id}`);
  return motor;
}
/** Sugiere el motor que puede correr hoy y el mejor encaje cuando llegue. */
export function elegirMotor(agente: AgenteParaMotor): SugerenciaMotor {
  const nativo = motorObligatorio("nativo");
  if (esMotorId(agente.motor)) {
    const elegido = motorObligatorio(agente.motor);
    if (elegido.disponible) return { motor: elegido, ideal: null, motivos: ["Elegido a mano para este agente."] };
    return { motor: nativo, ideal: elegido,
      motivos: ["Elegido a mano, pero aún no tiene adaptador: el agente corre en el nativo mientras llega."] };
  }
  const texto = [agente.name, agente.description, agente.persona].map((v) => (v ?? "").toLowerCase()).join(" ");
  const capacidades = (agente.capabilities ?? []).map((c) => c.toLowerCase());
  const contiene = (patron: string): boolean => texto.includes(patron) || capacidades.includes(patron);
  const candidatas = SENALES
    .map((senal) => ({ ...senal, coincidencias: senal.patrones.filter(contiene).length }))
    .filter((senal) => senal.coincidencias > 0)
    .sort((a, b) => b.coincidencias * b.peso - a.coincidencias * a.peso);
  const mejor = candidatas[0];
  if (!mejor) return { motor: nativo, ideal: null, motivos: ["El OS ya ejecuta este agente hoy con su motor nativo."] };
  const ideal = motorObligatorio(mejor.motor);
  if (ideal.disponible) return { motor: ideal, ideal: null, motivos: [mejor.motivo] };
  return { motor: nativo, ideal,
    motivos: [mejor.motivo, "Mientras llega su adaptador, el agente corre en el motor nativo."] };
}
