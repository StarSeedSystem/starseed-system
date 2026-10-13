// Recibos únicos de la malla cristalina (§6 del contrato): un modelo monótono
// para mensaje, archivo, publicación y llamada. Módulo puro, sin node:*.

import type { Medio, TipoDato } from "./tipos";

export type EstadoRecibo =
  | 'preparado' | 'enviado' | 'recibido' | 'leido'
  | 'publicado' | 'propagado'
  | 'llamando' | 'en-directo' | 'terminada'
  | 'fallido';

export interface Recibo {
  datoId: string;
  tipo: TipoDato;
  estado: EstadoRecibo;
  medio: Medio | null;
  ruta: string[];
  confirmadoPor: string | null;
  t: number;
  detalle?: string;
}

/** Cadenas de progreso por tipo de dato; un estado nunca retrocede. */
const CADENAS: Record<string, EstadoRecibo[]> = {
  mensaje: ['preparado', 'enviado', 'recibido', 'leido'],
  archivo: ['preparado', 'enviado', 'recibido', 'leido'],
  publicacion: ['preparado', 'enviado', 'publicado', 'propagado'],
  llamada: ['llamando', 'en-directo', 'terminada'],
};

const PUNTOS_SIN_FALLA: EstadoRecibo[] = ['recibido', 'publicado', 'en-directo'];

function cadenaDe(tipo: TipoDato): EstadoRecibo[] {
  return CADENAS[tipo] ?? CADENAS.mensaje;
}

/** Posición de un estado dentro de la cadena de su tipo (-1 si no aplica). */
export function orden(tipo: TipoDato, estado: EstadoRecibo): number {
  return cadenaDe(tipo).indexOf(estado);
}

/** Estados válidos (cadena del tipo) más 'fallido', que siempre se contempla. */
export function estadosDe(tipo: TipoDato): EstadoRecibo[] {
  return [...cadenaDe(tipo), 'fallido'];
}

export function reciboInicial(datoId: string, tipo: TipoDato, t: number): Recibo {
  return {
    datoId,
    tipo,
    estado: tipo === 'llamada' ? 'llamando' : 'preparado',
    medio: null,
    ruta: [],
    confirmadoPor: null,
    t,
  };
}

/**
 * Aplica un evento al recibo de forma monótona: un estado anterior se ignora;
 * 'fallido' solo entra si aún no hay 'recibido'/'publicado'/'en-directo'.
 */
export function aplicar(
  r: Recibo,
  ev: Partial<Recibo> & { estado: EstadoRecibo },
): Recibo {
  if (ev.estado === 'fallido') {
    if (PUNTOS_SIN_FALLA.includes(r.estado)) return r;
    if (r.estado === 'terminada' || r.estado === 'leido' || r.estado === 'propagado') return r;
  } else {
    const desde = orden(r.tipo, r.estado);
    const hasta = orden(r.tipo, ev.estado);
    if (hasta < 0 || (desde >= 0 && hasta <= desde)) return r;
  }
  return {
    ...r,
    estado: ev.estado,
    medio: ev.medio !== undefined ? ev.medio : r.medio,
    ruta: ev.ruta ?? r.ruta,
    confirmadoPor: ev.confirmadoPor !== undefined ? ev.confirmadoPor : r.confirmadoPor,
    t: ev.t ?? r.t,
    detalle: ev.detalle ?? r.detalle,
  };
}
