// ══════════════════════════════════════════════════════════════
// Reparto de motores por rol y medio · Ola 1025R (AGT1025A)
// ──────────────────────────────────────────────────────────────
// Un solo contrato de agente de Genesis y varios motores
// intercambiables: el motor se elige por la FORMA del trabajo y por
// el medio donde corre, nunca por el contexto. Aquí vive esa
// decisión como DATOS. Módulo puro: sin `node:*`, sin red y sin reloj.
// Los ids son solo texto: no se importa ningún adaptador de la ola 1023A.
// ══════════════════════════════════════════════════════════════

export type RolAgente =
  | "escritor-codigo" | "revisor-codigo" | "supervision-humana" | "equipo-roles" | "decision-tipada"
  | "flujo-largo" | "asistente-canales" | "creador-apps" | "enrutador-mcp" | "agente-nativo-movil";

export type MedioEjecucion =
  | "web-publica" | "neurona-mac" | "neurona-a1" | "nube-actions" | "movil-nativo";

export type EstadoMotor = "activo" | "candidato" | "invitado" | "referencia";

export interface MotorAgente { estado: EstadoMotor; medios: MedioEjecucion[]; aviso: string }

export interface ResultadoReparto {
  principal: string | null;
  alternos: string[];
  descartados: { id: string; motivo: string }[];
}

const AVISO_1023A = "ola 1023A: aún sin adaptador en main";

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
  agno: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_1023A },
  mastra: { estado: "invitado", medios: ["neurona-mac", "neurona-a1"], aviso: AVISO_1023A },
  langgraph: { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_1023A },
  "pydantic-ai": { estado: "invitado", medios: ["neurona-mac", "neurona-a1", "nube-actions"], aviso: AVISO_1023A },
  "openai-agents": { estado: "invitado", medios: ["neurona-a1", "nube-actions"], aviso: AVISO_1023A },
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

export function motoresPara(
  rol: RolAgente,
  medio: MedioEjecucion,
  opciones: { admitir?: EstadoMotor[] } = {},
): ResultadoReparto {
  const admitidos = (opciones.admitir ?? ["activo"]).filter((estado) => estado !== "referencia");
  const alternos: string[] = [];
  const descartados: { id: string; motivo: string }[] = [];
  let principal: string | null = null;

  for (const id of REPARTO[rol] ?? []) {
    const motor = MOTORES[id];
    if (!motor) { descartados.push({ id, motivo: "motor desconocido: no está en MOTORES" }); continue; }
    if (motor.estado === "referencia") { descartados.push({ id, motivo: "estado referencia: no se usa como motor" }); continue; }
    if (!motor.medios.includes(medio)) { descartados.push({ id, motivo: `no corre en ${medio}` }); continue; }
    if (!admitidos.includes(motor.estado)) { descartados.push({ id, motivo: `estado ${motor.estado}: no admitido` }); continue; }
    if (principal === null) principal = id;
    else alternos.push(id);
  }

  return { principal, alternos, descartados };
}

export function validarReparto(): string[] {
  const problemas: string[] = [];
  const entradas = Object.entries(REPARTO) as [RolAgente, string[]][];

  for (const [rol, ids] of entradas) {
    if (!Array.isArray(ids) || ids.length === 0) { problemas.push(`rol ${rol}: sin lista de motores`); continue; }
    const vistos = new Set<string>();
    for (const id of ids) {
      if (!MOTORES[id]) problemas.push(`rol ${rol}: el motor ${id} no existe en MOTORES`);
      if (vistos.has(id)) problemas.push(`rol ${rol}: el motor ${id} está repetido`);
      vistos.add(id);
    }
  }

  for (const [id, motor] of Object.entries(MOTORES)) {
    const externo = motor.estado === "candidato" || motor.estado === "invitado";
    if (externo && motor.aviso.trim() === "") problemas.push(`motor ${id}: ${motor.estado} sin aviso`);
  }

  return problemas;
}
