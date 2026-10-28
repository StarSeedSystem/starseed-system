// Reparto de motores por rol y medio - puro, sin node:*, sin red, sin disco

export type EstadoMotor = "activo" | "candidato" | "invitado" | "referencia";

export type MedioEjecucion =
  | "web-publica"
  | "neurona-mac"
  | "neurona-a1"
  | "nube-actions"
  | "movil-nativo";

export type RolAgente =
  | "escritor-codigo"
  | "revisor-codigo"
  | "supervision-humana"
  | "equipo-roles"
  | "decision-tipada"
  | "flujo-largo"
  | "asistente-canales"
  | "creador-apps"
  | "enrutador-mcp"
  | "agente-nativo-movil";

export interface MotorAgente {
  estado: EstadoMotor;
  medios: MedioEjecucion[];
  aviso: string;
}

export const MOTORES: Record<string, MotorAgente> = {
  nativo: {
    estado: "activo",
    medios: ["web-publica", "neurona-mac", "neurona-a1", "nube-actions"],
    aviso: "contrato propio del OS (Jev, decidir.py, enjambre, Hermes)",
  },
  opencode: {
    estado: "activo",
    medios: ["neurona-mac", "neurona-a1", "nube-actions"],
    aviso: "escritor principal del enjambre",
  },
  codex: {
    estado: "activo",
    medios: ["neurona-mac", "neurona-a1"],
    aviso: "segundo escritor, su cupo semanal es el del enjambre",
  },
  kilo: {
    estado: "candidato",
    medios: ["neurona-mac", "neurona-a1", "nube-actions"],
    aviso: "bifurcación de OpenCode, solo tras la prueba de edición real con contexto de tamaño real (§20)",
  },
  deepcode: {
    estado: "candidato",
    medios: ["neurona-a1", "nube-actions", "neurona-mac"],
    aviso: "siempre en modo Preguntar, su salida es un candidato y nunca se ejecuta en el OS",
  },
  openhands: {
    estado: "candidato",
    medios: ["neurona-a1", "nube-actions"],
    aviso: "Agent Server en sandbox Docker",
  },
  "open-strata": {
    estado: "candidato",
    medios: ["neurona-a1", "neurona-mac"],
    aviso: "agregador MCP autoalojado opcional, activación manual",
  },
  crewai: {
    estado: "invitado",
    medios: ["neurona-a1", "nube-actions"],
    aviso: "equipos por roles y Flows, telemetría apagada con OTEL_SDK_DISABLED=true, entra por AG-UI (https público)",
  },
  nanobot: {
    estado: "invitado",
    medios: ["neurona-a1", "neurona-mac"],
    aviso: "API compatible con OpenAI de un mensaje por petición, shell y archivos solo en sandbox",
  },
  agno: {
    estado: "invitado",
    medios: ["neurona-a1", "nube-actions"],
    aviso: "ola 1023A: aún sin adaptador en main",
  },
  mastra: {
    estado: "invitado",
    medios: ["neurona-mac", "neurona-a1"],
    aviso: "ola 1023A: aún sin adaptador en main",
  },
  langgraph: {
    estado: "invitado",
    medios: ["neurona-a1", "nube-actions"],
    aviso: "ola 1023A: aún sin adaptador en main",
  },
  "pydantic-ai": {
    estado: "invitado",
    medios: ["neurona-mac", "neurona-a1", "nube-actions"],
    aviso: "ola 1023A: aún sin adaptador en main",
  },
  "openai-agents": {
    estado: "invitado",
    medios: ["neurona-a1", "nube-actions"],
    aviso: "ola 1023A: aún sin adaptador en main",
  },
  "agent-orchestrator": {
    estado: "referencia",
    medios: ["neurona-mac"],
    aviso: "app de escritorio de Alex, sin Linux arm64, telemetría PostHog",
  },
  "omo-slim": {
    estado: "referencia",
    medios: [],
    aviso: "plugin de OpenCode que NO entra en el enjambre (subagentes en segundo plano que se saltan el gobernador, MCP que gastan contexto, exige opencode 1.18.32 o más)",
  },
  koog: {
    estado: "referencia",
    medios: ["movil-nativo"],
    aviso: "solo si existe una app nativa en Kotlin, hoy no hay hueco",
  },
}

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
}

export function motoresPara(
  rol: RolAgente,
  medio: MedioEjecucion,
  opciones?: { admitir?: EstadoMotor[] },
): { principal: string | null; alternos: string[]; descartados: { id: string; motivo: string }[] } {
  const admitir = opciones?.admitir ?? ["activo"]
  const lista = REPARTO[rol] ?? []
  const admisibles: string[] = []
  const descartados: { id: string; motivo: string }[] = []

  for (const id of lista) {
    const motor = MOTORES[id]
    if (!motor) {
      continue
    }
    if (motor.estado === "referencia") {
      descartados.push({ id, motivo: "estado referencia: no se usa como motor" })
      continue
    }
    if (!admitir.includes(motor.estado)) {
      if (motor.estado === "candidato") {
        descartados.push({ id, motivo: "estado candidato: no admitido por defecto" })
        continue
      }
      if (motor.estado === "invitado") {
        descartados.push({ id, motivo: "estado invitado: no admitido por defecto" })
        continue
      }
      continue
    }
    if (!motor.medios.includes(medio)) {
      descartados.push({ id, motivo: `no corre en ${medio}` })
      continue
    }
    admisibles.push(id)
  }

  if (admisibles.length === 0) {
    return { principal: null, alternos: [], descartados }
  }
  const [principal, ...alternos] = admisibles
  return { principal, alternos, descartados }
}

export function validarReparto(): string[] {
  const problemas: string[] = []
  const roles = Object.keys(REPARTO) as RolAgente[]
  for (const rol of roles) {
    const lista = REPARTO[rol]
    if (!lista || lista.length === 0) {
      problemas.push(`rol sin lista o lista vacía: ${rol}`)
      continue
    }
    const vistos = new Set<string>()
    for (const id of lista) {
      if (vistos.has(id)) {
        problemas.push(`id repetido dentro de una lista: ${rol}.${id}`)
      }
      vistos.add(id)
      if (!(id in MOTORES)) {
        problemas.push(`id de REPARTO que no existe en MOTORES: ${id}`)
        continue
      }
      const motor = MOTORES[id]
      if ((motor.estado === "candidato" || motor.estado === "invitado") && (!motor.aviso || motor.aviso.trim() === "")) {
        problemas.push(`motor candidato/invitado con aviso vacío: ${id}`)
      }
    }
  }
  return problemas
}
