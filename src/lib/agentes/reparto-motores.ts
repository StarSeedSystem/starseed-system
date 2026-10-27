// Reparto de motores de agente por rol y medio (Ola 1025R · AGT1025A).
// Un solo contrato de agente de Genesis y varios motores intercambiables: la
// decisión vive aquí como datos, no en prosa, y se elige por la forma del
// trabajo. Módulo puro: sin red, disco ni reloj.

export type RolAgente = "escritor-codigo" | "revisor-codigo" | "supervision-humana" | "equipo-roles" | "decision-tipada" | "flujo-largo" | "asistente-canales" | "creador-apps" | "enrutador-mcp" | "agente-nativo-movil";

export type MedioEjecucion = "web-publica" | "neurona-mac" | "neurona-a1" | "nube-actions" | "movil-nativo";

export type EstadoMotor = "activo" | "candidato" | "invitado" | "referencia";

export type MotorAgente = { estado: EstadoMotor; medios: MedioEjecucion[]; aviso: string };

export type OpcionesMotores = { admitir?: EstadoMotor[] };

export type RepartoMotores = { principal: string | null; alternos: string[]; descartados: { id: string; motivo: string }[] };

const AVISO_SIN_ADAPTADOR = "ola 1023A: aún sin adaptador en main";

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
  agno: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_SIN_ADAPTADOR },
  mastra: { estado: "invitado", medios: ["neurona-mac", "neurona-a1"], aviso: AVISO_SIN_ADAPTADOR },
  langgraph: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_SIN_ADAPTADOR },
  "pydantic-ai": { estado: "invitado", medios: ["neurona-mac", "neurona-a1", "nube-actions"], aviso: AVISO_SIN_ADAPTADOR },
  "openai-agents": { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_SIN_ADAPTADOR },
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

const ROLES = Object.keys(REPARTO) as RolAgente[];

export function motoresPara(
  rol: RolAgente,
  medio: MedioEjecucion,
  opciones: OpcionesMotores = {},
): RepartoMotores {
  const admitidos = new Set(
    (opciones.admitir ?? ["activo"]).filter((estado) => estado !== "referencia"),
  );
  const admisibles: string[] = [];
  const descartados: { id: string; motivo: string }[] = [];

  for (const id of REPARTO[rol] ?? []) {
    const motor = MOTORES[id];
    if (!motor) {
      descartados.push({ id, motivo: "no consta en MOTORES" });
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

  return {
    principal: admisibles[0] ?? null,
    alternos: admisibles.slice(1),
    descartados,
  };
}

export function validarReparto(): string[] {
  const problemas: string[] = [];

  for (const rol of ROLES) {
    const lista = REPARTO[rol];
    if (!lista || lista.length === 0) {
      problemas.push(`rol ${rol} sin lista o lista vacía`);
      continue;
    }
    const vistos = new Set<string>();
    for (const id of lista) {
      if (!MOTORES[id]) {
        problemas.push(`rol ${rol}: motor ${id} no consta en MOTORES`);
      }
      if (vistos.has(id)) {
        problemas.push(`rol ${rol}: motor ${id} repetido`);
      }
      vistos.add(id);
    }
  }

  for (const [id, motor] of Object.entries(MOTORES)) {
    const externo = motor.estado === "candidato" || motor.estado === "invitado";
    if (externo && motor.aviso.trim() === "") {
      problemas.push(`motor ${id} ${motor.estado} con aviso vacío`);
    }
  }

  return problemas;
}
