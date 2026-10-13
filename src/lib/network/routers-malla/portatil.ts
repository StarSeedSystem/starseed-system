import { ModeloRouter, EntradaTabla, compatibilidad, ResultadoCompatibilidad } from './compatibilidad-openwrt';

export const TIPOS_PORTATIL = ['viaje-openwrt', 'viaje-otro', 'mifi-operador'] as const;
export type TipoPortatil = typeof TIPOS_PORTATIL[number];

export interface RouterPortatil {
  id: string;
  tipo: TipoPortatil;
  bateriaPct: number | null;
  cargando: boolean;
  moviendose?: boolean;
  modem?: { generacion: '4g' | '5g'; conSim: boolean } | null;
}

export function coordinacionPortatil(r: RouterPortatil): number {
  if (r.cargando) return 6;
  if (r.bateriaPct === null) return 6;
  if (r.bateriaPct >= 50) return 6;
  if (r.bateriaPct >= 20) return 4;
  return 3;
}

export function factorAmortiguacion(r: RouterPortatil, volatilidadPropia: number): number {
  // Acotar volatilidadPropia a 0-1
  const v = Math.max(0, Math.min(1, volatilidadPropia));
  let factor = 0.6 * (1 - v);
  if (r.moviendose) {
    factor *= 0.5;
  }
  // Acotar el resultado a 0-0.6
  return Math.max(0, Math.min(0.6, factor));
}

export type ResultadoCompatibilidadPortatil = Omit<ResultadoCompatibilidad, 'estado'> & {
  estado:
    | 'soportado-sin-flashear'
    | ResultadoCompatibilidad['estado'];
};

export function compatibilidadPortatil(m: ModeloRouter & { tipo: TipoPortatil }, tabla: EntradaTabla[]): ResultadoCompatibilidadPortatil {
  if (m.tipo === 'viaje-openwrt') {
    return {
      estado: 'soportado-sin-flashear',
      enlace: null,
      pasos: [
        'activar SSH en su panel',
        'copiar el guion de la malla',
        'adoptar desde StarSeed',
      ],
      aviso: 'No hace falta flashear: ya trae un sistema basado en OpenWrt.',
    };
  }
  if (m.tipo === 'mifi-operador') {
    const resultado = compatibilidad(m, tabla);
    if (resultado.estado === 'soportado') {
      return resultado;
    }
    // Si no está soportado, devolvemos el estado bloqueado-operador con la alternativa
    return {
      estado: 'bloqueado-operador',
      enlace: null,
      pasos: [
        ...resultado.pasos,
        'este MiFi no se formatea, pero su internet entra en la malla a través de un titanio compatible, por Wi‑Fi (modo cliente) o por USB',
      ],
      aviso: resultado.aviso,
    };
  }
  // Para 'viaje-otro' y cualquier otro tipo, delegamos directamente
  return compatibilidad(m, tabla);
}

export function resumenSinSim(r: RouterPortatil): string {
  return 'Sin SIM es un titanio igual: la malla (802.11s + batman‑adv) va por las radios Wi‑Fi; el módem puede quedarse apagado.';
}