/**
 * use-disposicion-puro — lógica pura para la disposición 4D (MV1125C · parte 2 de 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Funciones puras para construcción de peticiones y validación, separadas para test.
 */

import type {
  AristaDisposicion,
  OpcionesDisposicion,
  OpcionesRadial,
  OpcionesEspiral,
  OpcionesPlanos,
} from './disposicion';

export type TipoDisposicion = 'fuerza' | 'radial' | 'espiral' | 'planos';

export function tipoValido(tipo: string): tipo is TipoDisposicion {
  return ['fuerza', 'radial', 'espiral', 'planos'].includes(tipo);
}

export interface DatosFuerza {
  n: number;
  aristas: AristaDisposicion[];
  opciones?: OpcionesDisposicion;
}

export interface DatosRadial {
  padres: number[];
  opciones?: OpcionesRadial;
}

export interface DatosEspiral {
  tiempos: number[];
  opciones?: OpcionesEspiral;
}

export interface DatosPlanos {
  capas: (string | number)[];
  opciones?: OpcionesPlanos;
}

export interface DatosCalcular {
  tipo: TipoDisposicion;
  n?: number;
  aristas?: AristaDisposicion[];
  padres?: number[];
  tiempos?: number[];
  capas?: (string | number)[];
  opciones?: OpcionesDisposicion | OpcionesRadial | OpcionesEspiral | OpcionesPlanos;
}

export type DatosDisposicion =
  | { tipo: 'fuerza'; datos: DatosFuerza }
  | { tipo: 'radial'; datos: DatosRadial }
  | { tipo: 'espiral'; datos: DatosEspiral }
  | { tipo: 'planos'; datos: DatosPlanos };

export interface PeticionDisposicionConstruida {
  modo: 'fuerza' | 'radial' | 'espiral' | 'planos';
  n?: number;
  aristas?: AristaDisposicion[];
  padres?: number[];
  tiempos?: number[];
  capas?: (string | number)[];
  opciones?: OpcionesDisposicion | OpcionesRadial | OpcionesEspiral | OpcionesPlanos;
}

export function construirPeticion(
  tipo: TipoDisposicion,
  datos: DatosFuerza | DatosRadial | DatosEspiral | DatosPlanos,
): PeticionDisposicionConstruida {
  switch (tipo) {
    case 'fuerza':
      return {
        modo: 'fuerza',
        n: (datos as DatosFuerza).n,
        aristas: (datos as DatosFuerza).aristas,
        opciones: (datos as DatosFuerza).opciones,
      };
    case 'radial':
      return {
        modo: 'radial',
        padres: (datos as DatosRadial).padres,
        opciones: (datos as DatosRadial).opciones,
      };
    case 'espiral':
      return {
        modo: 'espiral',
        tiempos: (datos as DatosEspiral).tiempos,
        opciones: (datos as DatosEspiral).opciones,
      };
    case 'planos':
      return {
        modo: 'planos',
        capas: (datos as DatosPlanos).capas,
        opciones: (datos as DatosPlanos).opciones,
      };
  }
}

export function generarIdsUnicos(n: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    ids.push(i);
  }
  return ids;
}