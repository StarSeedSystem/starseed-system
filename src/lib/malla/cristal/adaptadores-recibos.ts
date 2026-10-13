// Adaptadores puros: traducen los productores que ya hay (DeliveryReceipt,
// acuse universal, archivo.ok, fases de llamada) a eventos del recibo único.
// No importan los módulos de origen: declaran las interfaces mínimas.

import { esMedio, type Medio } from "./tipos";
import type { EstadoRecibo, Recibo } from "./recibos";

export type EventoRecibo = Partial<Recibo> & { estado: EstadoRecibo };

/** Mínimo de DeliveryReceipt (mesh/delivery.ts) que necesitamos. */
export interface EntregaMesh {
  status: 'delivered' | 'sent' | 'partial' | 'failed' | 'queued';
  hops: Array<{ via: string; status: string }>;
}

function medioDeHops(hops: EntregaMesh['hops']): Medio | null {
  const buen = hops.find((h) => h.status !== 'failed' && h.status !== 'skipped');
  const via = (buen ?? hops[0])?.via;
  return via && esMedio(via) ? via : null;
}

export function desdeEntregaMesh(d: EntregaMesh): EventoRecibo {
  const medio = medioDeHops(d.hops);
  const ruta = d.hops.map((h) => h.via);
  const porEstado: Record<EntregaMesh['status'], EstadoRecibo> = {
    delivered: 'recibido',
    sent: 'enviado',
    partial: 'enviado',
    failed: 'fallido',
    queued: 'preparado',
  };
  return { estado: porEstado[d.status], medio, ruta };
}

/** Acuse universal (`tu.ack` del transporte universal). */
export interface AcuseUniversal {
  enlace: string;
  confirmado: boolean;
}

export function desdeAcuseUniversal(a: AcuseUniversal): EventoRecibo {
  const medio = esMedio(a.enlace) ? a.enlace : null;
  if (a.confirmado) {
    return { estado: 'recibido', medio, confirmadoPor: a.enlace };
  }
  return { estado: 'enviado', medio };
}

/** Evento de transferencia de archivo (archivos-malla). */
export interface EventoArchivo {
  evento: 'archivo.ok' | 'archivo.error';
}

export function desdeArchivo(e: EventoArchivo): EventoRecibo {
  return e.evento === 'archivo.ok'
    ? { estado: 'recibido' }
    : { estado: 'fallido', detalle: 'la transferencia del archivo falló' };
}

/** Fases de la llamada directa (llamada-directa.ts). */
export type FaseLlamada = 'llamando' | 'entrante' | 'en-curso' | 'terminada';

export function desdeFaseLlamada(fase: FaseLlamada): EventoRecibo {
  switch (fase) {
    case 'llamando':
    case 'entrante':
      return { estado: 'llamando' };
    case 'en-curso':
      return { estado: 'en-directo' };
    case 'terminada':
      return { estado: 'terminada' };
  }
}
