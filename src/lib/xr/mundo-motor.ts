import type { Vec3 } from './tipos';

export interface CieloMundo { tipo: string; color?: string }

export interface Efecto {
  tipo: 'fuerza' | 'sonido' | 'teletransportar' | 'abrir-pizarra' | 'abrir-pantalla' | 'pedir-a-astraura';
  datos: Record<string, unknown>;
}

export interface VistaEstado { visible: boolean; pos: Vec3; rot: Vec3; color: string }

export interface EstadoMotor {
  vistas: Record<string, VistaEstado>;
  disparadas: string[];
  cielo: CieloMundo;
  mensajes: string[];
  cola: Efecto[];
}

export interface ReglaMundo {
  id: string;
  disparador: Disparador;
  acciones: AccionMundo[];
  unaVez?: boolean;
}

export interface Disparador {
  tipo: 'entra-zona' | 'sale-zona' | 'toca' | 'agarra' | 'suelta' | 'choca' | 'llega-persona' | 'cada' | 'tic';
  zona?: string;
  objeto?: string;
  cadaMs?: number;
}

export interface AccionMundo {
  tipo: 'mostrar' | 'ocultar' | 'alternar' | 'mover' | 'girar' | 'color' | 'cielo' | 'mensaje' | 'fuerza' | 'sonido' | 'teletransportar' | 'abrir-pizarra' | 'abrir-pantalla' | 'pedir-a-astraura';
  objetivo: string;
  valor?: unknown;
  duracionMs?: number;
}

export interface MundoSpec { vistas?: Record<string, VistaEstado>; reglas?: ReglaMundo[]; cielo?: CieloMundo }

export const MAX_REGLAS = 128;
export const MAX_ACCIONES_POR_REGLA = 16;

export function crearMotor(mundo: MundoSpec): EstadoMotor {
  return {
    vistas: mundo.vistas ?? {},
    disparadas: [],
    cielo: mundo.cielo ?? { tipo: 'despejado' },
    mensajes: [],
    cola: []
  };
}

export function evento(estado: EstadoMotor, ev: unknown, ahora: number): { estado: EstadoMotor; efectos: Efecto[] } {
  // implementación placeholder pura
  return { estado, efectos: [] };
}
