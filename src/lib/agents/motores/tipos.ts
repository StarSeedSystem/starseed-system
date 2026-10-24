/*
 * StarSeed OS — Motores de agentes · Contrato (TS, puro)
 * Sin efectos, sin imports de Node, sin I/O.
 */

export type MotorAgentes =
  | 'nativo'
  | 'mastra'
  | 'langgraph'
  | 'pydantic-ai'
  | 'openai-agents'
  | 'agno';

export type MotorLenguaje = 'ts' | 'py';

export type MotorDondeCorre = 'navegador' | 'neurona-node' | 'neurona-python';

export type MotorAporte =
  | 'flujos-con-estado'
  | 'persona-en-bucle'
  | 'salidas-tipadas'
  | 'traspasos'
  | 'equipos';

export interface MotorInfo {
  id: MotorAgentes;
  nombre: string;
  lenguaje: MotorLenguaje;
  dondeCorre: MotorDondeCorre[];
  aporta: MotorAporte[];
  licencia: string;
  descripcion: string;
}

const MOTORES_INFO: Record<MotorAgentes, MotorInfo> = {
  nativo: {
    id: 'nativo',
    nombre: 'Nativo (StarSeed)',
    lenguaje: 'ts',
    dondeCorre: ['navegador', 'neurona-node'],
    aporta: ['persona-en-bucle', 'salidas-tipadas'],
    licencia: 'Propietario / OS',
    descripcion: 'Motor por defecto del OS, integrado al enrutador y a las capacidades.',
  },
  mastra: {
    id: 'mastra',
    nombre: 'Mastra',
    lenguaje: 'ts',
    dondeCorre: ['neurona-node'],
    aporta: ['flujos-con-estado', 'persona-en-bucle', 'salidas-tipadas', 'equipos'],
    licencia: 'Apache-2.0',
    descripcion: 'Framework TS para flujos con estado, memoria y equipos en la neurona.',
  },
  langgraph: {
    id: 'langgraph',
    nombre: 'LangGraph',
    lenguaje: 'ts',
    dondeCorre: ['neurona-node', 'neurona-python'],
    aporta: ['flujos-con-estado', 'persona-en-bucle'],
    licencia: 'MIT',
    descripcion: 'Ejecución larga con reanudación y flujos con estado.',
  },
  'pydantic-ai': {
    id: 'pydantic-ai',
    nombre: 'Pydantic AI',
    lenguaje: 'py',
    dondeCorre: ['neurona-python'],
    aporta: ['persona-en-bucle', 'salidas-tipadas'],
    licencia: 'MIT',
    descripcion: 'Agentes tipados con salidas validadas contra un esquema.',
  },
  'openai-agents': {
    id: 'openai-agents',
    nombre: 'OpenAI Agents SDK',
    lenguaje: 'py',
    dondeCorre: ['neurona-python'],
    aporta: ['persona-en-bucle', 'traspasos', 'equipos'],
    licencia: 'MIT',
    descripcion: 'Traspasos entre roles con guardas y sesiones.',
  },
  agno: {
    id: 'agno',
    nombre: 'Agno',
    lenguaje: 'py',
    dondeCorre: ['neurona-python'],
    aporta: ['persona-en-bucle', 'equipos', 'salidas-tipadas'],
    licencia: 'Apache-2.0',
    descripcion: 'Equipos con memoria compartida y runtime AgentOS.',
  },
};

export function obtenerInfoMotor(id: MotorAgentes): MotorInfo {
  return MOTORES_INFO[id];
}

export function listarMotores(): MotorInfo[] {
  return Object.values(MOTORES_INFO);
}

export interface AgenteMotorContexto {
  id?: string;
  necesitaEquipo?: boolean;
  necesitaTraspasos?: boolean;
  necesitaReanudacion?: boolean;
  necesitaSalidaTipada?: boolean;
  esquemaSalida?: boolean;
  correEnNeurona?: boolean;
}

export interface NecesidadesMotor {
  equipo?: boolean;
  traspasos?: boolean;
  reanudacion?: boolean;
  salidaTipada?: boolean;
  esquema?: boolean;
  largoPlazo?: boolean;
}

export function elegirMotor(
  agente: AgenteMotorContexto = {},
  necesidades: NecesidadesMotor = {}
): MotorAgentes {
  const equipo = necesidades.equipo ?? agente.necesitaEquipo ?? false;
  const traspasos = necesidades.traspasos ?? agente.necesitaTraspasos ?? false;
  const reanudacion =
    necesidades.reanudacion ??
    necesidades.largoPlazo ??
    agente.necesitaReanudacion ??
    false;
  const salidaTipada =
    necesidades.salidaTipada ?? necesidades.esquema ?? agente.necesitaSalidaTipada ?? agente.esquemaSalida ?? false;

  if (equipo && !traspasos) {
    return 'agno';
  }
  if (traspasos) {
    return 'openai-agents';
  }
  if (salidaTipada) {
    return 'pydantic-ai';
  }
  if (reanudacion) {
    return 'langgraph';
  }
  if (equipo) {
    return 'mastra';
  }
  return 'nativo';
}
