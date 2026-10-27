// Reparto de motores por rol y medio (Ola 1025R · AGT1025A).
// UN contrato de agente de Genesis y varios motores intercambiables: se
// elige por la FORMA del trabajo y por dónde puede correr, no por el
// contexto. Módulo PURO: sin `node:*`, sin red, sin disco ni reloj.

export type RolAgente =
  | "escritor-codigo" | "revisor-codigo" | "supervision-humana" | "equipo-roles" | "decision-tipada"
  | "flujo-largo" | "asistente-canales" | "creador-apps" | "enrutador-mcp" | "agente-nativo-movil";

export type MedioEjecucion = "web-publica" | "neurona-mac" | "neurona-a1" | "nube-actions" | "movil-nativo";
export type EstadoMotor = "activo" | "candidato" | "invitado" | "referencia";

export interface MotorAgente { estado: EstadoMotor; medios: MedioEjecucion[]; aviso: string }

/** Aviso común a los motores que la ola 1023A dejó sin adaptador. */
const SIN_ADAPTADOR = "ola 1023A: aún sin adaptador en main";

export const MOTORES: Record<string, MotorAgente> = {
  nativo: { estado: "activo", medios: ["web-publica", "neurona-mac", "neurona-a1", "nube-actions"], aviso: "contrato propio del OS (Jev, decidir.py, enjambre, Hermes)" },
  opencode: { estado: "activo", medios: ["neurona-mac", "neurona-a1", "nube-actions"], aviso: "escritor principal del enjambre" },
  codex: { estado: "activo", medios: ["neurona-mac", "neurona-a1"], aviso: "segundo escritor, su cupo semanal es el del enjambre" },
  kilo: { estado: "candidato", medios: ["neurona-mac", "neurona-a1", "nube-actions"], aviso: "bifurcación de OpenCode, solo tras la prueba de edición real con contexto de tamaño real (§20)" },
  deepcode: { estado: "candidato", medios: ["neurona-a1", "nube-actions", "neurona-mac"], aviso: "siempre en modo Preguntar, su salida es un candidato y nunca se ejecuta en el OS" },
  openhands: { estado: "candidato", medios: ["neurona-a1", "nube-actions"], aviso: "Agent Server en sandbox Docker" },
  "open-strata": { estado: "candidato", medios: ["neurona-a1", "neurona-mac"], aviso: "agregador MCP autoalojado opcional, activación manual" },
  crewai: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: "equipos por roles y Flows, telemetría apagada con OTEL_SDK_DISABLED=true, entra por AG-UI (https público)" },
  nanobot: { estado: "invitado", medios: ["neurona-a1", "neurona-mac"], aviso: "API compatible con OpenAI de un mensaje por petición, shell y archivos solo en sandbox" },
  agno: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: SIN_ADAPTADOR },
  mastra: { estado: "invitado", medios: ["neurona-mac", "neurona-a1"], aviso: SIN_ADAPTADOR },
  langgraph: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: SIN_ADAPTADOR },
  "pydantic-ai": { estado: "invitado", medios: ["neurona-mac", "neurona-a1", "nube-actions"], aviso: SIN_ADAPTADOR },
  "openai-agents": { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: SIN_ADAPTADOR },
  "agent-orchestrator": { estado: "referencia", medios: ["neurona-mac"], aviso: "app de escritorio de Alex, sin Linux arm64, telemetría PostHog" },
  "omo-slim": { estado: "referencia", medios: [], aviso: "plugin de OpenCode que NO entra en el enjambre (subagentes en segundo plano que se saltan el gobernador, MCP que gastan contexto, exige opencode 1.18.32 o más)" },
  koog: { estado: "referencia", medios: ["movil-nativo"], aviso: "solo si existe una app nativa en Kotlin, hoy no hay hueco" },
};

export const REPARTO: Record<RolAgente, string[]> = {
  "escritor-codigo": ["opencode", "codex", "kilo", "deepcode", "openhands"],
  "revisor-codigo": ["nativo"],
  "supervision-humana": ["nativo", "agent-orchestrator"],
  "equipo-roles": ["crewai", "openai-agents", "agno", "nativo"],
  "decision-tipada": ["nativo", "pydantic-ai"],
  "flujo-largo": ["langgraph", "mastra", "crewai", "nativo"],
  "asistente-canales": ["nativo", "nanobot"],
  "creador-apps": ["nativo", "deepcode", "openhands"],
  "enrutador-mcp": ["nativo", "open-strata"],
  "agente-nativo-movil": ["koog"],
};

export interface OpcionesReparto { admitir?: EstadoMotor[] }
export interface ResultadoReparto {
  principal: string | null;
  alternos: string[];
  descartados: { id: string; motivo: string }[];
}

export function motoresPara(
  rol: RolAgente,
  medio: MedioEjecucion,
  opciones: OpcionesReparto = {},
): ResultadoReparto {
  const admitidos = new Set<EstadoMotor>(opciones.admitir ?? ["activo"]);
  admitidos.delete("referencia");
  const admisibles: string[] = [];
  const descartados: { id: string; motivo: string }[] = [];

  for (const id of REPARTO[rol] ?? []) {
    const motor = MOTORES[id];
    if (!motor) {
      descartados.push({ id, motivo: "motor desconocido: no está en MOTORES" });
    } else if (motor.estado === "referencia") {
      descartados.push({ id, motivo: "estado referencia: no se usa como motor" });
    } else if (!admitidos.has(motor.estado)) {
      descartados.push({ id, motivo: `estado ${motor.estado}: no admitido` });
    } else if (!motor.medios.includes(medio)) {
      descartados.push({ id, motivo: `no corre en ${medio}` });
    } else {
      admisibles.push(id);
    }
  }

  const [principal = null, ...alternos] = admisibles;
  return { principal, alternos, descartados };
}

export function validarReparto(): string[] {
  const problemas: string[] = [];

  for (const [rol, lista] of Object.entries(REPARTO)) {
    if (!Array.isArray(lista) || lista.length === 0) {
      problemas.push(`rol "${rol}" sin lista de motores`);
      continue;
    }
    const vistos = new Set<string>();
    for (const id of lista) {
      if (!MOTORES[id]) problemas.push(`motor "${id}" de "${rol}" no existe en MOTORES`);
      if (vistos.has(id)) problemas.push(`motor "${id}" repetido en "${rol}"`);
      vistos.add(id);
    }
  }

  for (const [id, motor] of Object.entries(MOTORES)) {
    const externo = motor.estado === "candidato" || motor.estado === "invitado";
    if (externo && motor.aviso.trim() === "") {
      problemas.push(`motor "${id}" ${motor.estado} sin aviso`);
    }
  }

  return problemas;
}
