export type FaseOrbe = 'reposo' | 'escuchando' | 'pensando' | 'hablando';
export type CapaIA = 'reflejo' | 'palabra' | 'razon' | null;

export interface EstadoOrbe {
  fase: FaseOrbe;
  capa: CapaIA;
  nivelVoz: number;
  texto: string;
}

export type EventoOrbe =
  | { tipo: 'escucha-inicio' }
  | { tipo: 'escucha-fin' }
  | { tipo: 'texto-parcial'; texto: string }
  | { tipo: 'entendido'; capa: CapaIA }
  | { tipo: 'habla-inicio' }
  | { tipo: 'habla-fin' }
  | { tipo: 'error'; texto?: string };

export function siguienteEstadoOrbe(prev: EstadoOrbe, ev: EventoOrbe): EstadoOrbe {
  switch (ev.tipo) {
    case 'escucha-inicio':
      return { ...prev, fase: 'escuchando', nivelVoz: 0 };
    case 'escucha-fin':
      return { ...prev, fase: prev.fase === 'escuchando' ? 'reposo' : prev.fase };
    case 'texto-parcial':
      return { ...prev, texto: ev.texto };
    case 'entendido':
      return { ...prev, fase: 'pensando', capa: ev.capa };
    case 'habla-inicio':
      return { ...prev, fase: 'hablando' };
    case 'habla-fin':
      return { ...prev, fase: 'reposo', capa: null };
    case 'error':
      return { fase: 'reposo', capa: null, nivelVoz: 0, texto: ev.texto ?? 'Error' };
  }
}

export interface ParametrosVisuales {
  radio: number;
  pulso: number;
  color: string;
  brillo: number;
}

import { COLORES_NODO } from '@/lib/xr/tokens-3d';

export function parametrosVisuales(e: EstadoOrbe, reducido: boolean): ParametrosVisuales {
  const vivo = COLORES_NODO.zenith.vivo;
  const base = COLORES_NODO.zenith.base;
  const color = e.fase === 'reposo' ? base : vivo;
  const pulso = reducido
    ? 0
    : e.fase === 'escuchando'
    ? 1 + e.nivelVoz
    : e.fase === 'hablando'
    ? 0.8
    : e.fase === 'pensando'
    ? 0.4
    : 0;
  const brillo = 0.5 + Math.min(1, e.nivelVoz) * 0.5;
  return { radio: 0.6, pulso, color, brillo };
}
