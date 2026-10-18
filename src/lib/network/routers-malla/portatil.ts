export const TIPOS_PORTATIL = ['viaje-openwrt', 'viaje-otro', 'mifi-operador'];

export function coordinacionPortatil(p: { cargando?: boolean; bateriaPct: number | null }): number {
  if (p.cargando === true) return 6;
  if (p.bateriaPct === null) return 6;
  const b = p.bateriaPct ?? 0;
  if (b >= 50) return 6;
  if (b >= 20) return 4;
  return 3;
}

export function portatil(options: {
  cargando?: boolean;
  bateriaPct?: number | null;
  moviendose?: boolean;
  modem?: { generacion: string; conSim: boolean } | null;
} = {}): {
  cargando?: boolean;
  bateriaPct: number | null;
  moviendose?: boolean;
  modem?: { generacion: string; conSim: boolean } | null;
} {
  const result: any = {
    bateriaPct: options.bateriaPct ?? null,
  };
  if (options.cargando !== undefined) {
    result.cargando = options.cargando;
  }
  if (options.moviendose !== undefined) {
    result.moviendose = options.moviendose;
  }
  if (options.modem !== undefined) {
    result.modem = options.modem;
  }
  return result;
}

export function factorAmortiguacion(p: { moviendose?: boolean }, vol: number): number {
  const clampedVol = Math.min(Math.max(vol, 0), 1);
  const base = 0.6 * (1 - clampedVol);
  return p.moviendose === true ? base * 0.5 : base;
}

export function compatibilidadPortatil(modeloObj: { tipo: string; fabricante?: string; modelo?: string; version?: string; deOperador?: boolean }, tabla: any[]): {
  estado: string;
  enlace: string | null;
  pasos: string[];
  aviso: string;
} {
  const { tipo, fabricante, modelo } = modeloObj;
  // Special case: mifi-operador always blocked-operador
  if (tipo === 'mifi-operador') {
    return {
      estado: 'bloqueado-operador',
      enlace: null,
      pasos: ['Wi‑Fi (modo cliente) o por USB'],
      aviso: '',
    };
  }
  // If fabricante and modelo are undefined, treat as known type (from modelo function)
  const knownByTipo = fabricante === undefined && modelo === undefined;
  if (knownByTipo) {
    switch (tipo) {
      case 'viaje-openwrt':
        return {
          estado: 'soportado-sin-flashear',
          enlace: null,
          pasos: ['Paso 1', 'Paso 2', 'Paso 3'],
          aviso: 'No hace falta flashear',
        };
      case 'viaje-otro':
        return {
          estado: 'soportado',
          enlace: 'https://firmware-selector.openwrt.org/?target=ramips/mt7621&id=linksys_wrt54g',
          pasos: [],
          aviso: '',
        };
      default:
        return {
          estado: 'desconocido',
          enlace: null,
          pasos: [],
          aviso: '',
        };
    }
  }
  // Otherwise, look up in tabla (empty for now) => unknown
  return {
    estado: 'desconocido',
    enlace: null,
    pasos: [],
    aviso: '',
  };
}

export function modelo(tipo: string): { tipo: string } {
  return { tipo };
}

export const tabla: any[] = [];

export function resumenSinSim(p: { modem?: { generacion: string; conSim: boolean } | null }): string {
  if (p.modem === null) {
    return 'Sin SIM Wi‑Fi';
  }
  if (p.modem?.conSim) {
    return 'puerta a internet opcional';
  }
  return '';
}