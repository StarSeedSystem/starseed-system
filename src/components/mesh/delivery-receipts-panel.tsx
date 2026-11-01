'use client';

/**
 * Panel de recibos de entrega (Ola 1012Q, §6 del contrato de la malla de
 * sílice): los últimos recibos del subsistema mesh, pintados con
 * <RecibosChips/> — dato, hora, estado, medio y ruta. Los recibos llegan del
 * hook `useDeliveryReceipts`; la prop `recibos` sirve de costura de pruebas e
 * inyección sin tocar el store vivo.
 */

import { useDeliveryReceipts } from '@/ai/astraura/mesh';
import type { DeliveryReceipt } from '@/ai/astraura/mesh/delivery';
import type { TransmitVia } from '@/ai/astraura/mesh/synaptic-router';
import type { Medio } from '@/lib/malla/cristal/tipos';
import type { Recibo } from '@/lib/malla/cristal/recibos';
import { desdeEntregaMesh } from '@/lib/malla/cristal/adaptadores-recibos';
import { RecibosChips } from '@/components/malla/recibos-chips';

/** Medio físico de cada vía del plan sináptico: la malla por daemon/IP es
 *  Wi‑Fi, el relé y el servidor público son el servidor, y el directo por LAN
 *  es Wi‑Fi. Lo consume `desdeEntregaMesh` para el recibo único. */
const MEDIO_DE_VIA: Record<TransmitVia, Medio> = {
  'mesh-direct': 'wifi-mesh',
  'mesh-flood': 'wifi-mesh',
  'server-public': 'servidor',
  'server-relay': 'servidor',
  'wifi-direct': 'wifi-lan',
};

export interface DeliveryReceiptsPanelProps {
  recibos?: DeliveryReceipt[];
  maximo?: number;
}

export function DeliveryReceiptsPanel({ recibos, maximo = 6 }: DeliveryReceiptsPanelProps) {
  const delStore = useDeliveryReceipts();
  const lista = (recibos ?? delStore).slice(0, maximo);
  return (
    <div data-testid="recibos-entrega" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] font-semibold text-white/90">Recibos de entrega</p>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-200">
          {lista.length}
        </span>
      </div>
      {lista.length === 0 ? (
        <p className="mt-1 text-[10px] text-white/45">
          aún no hay recibos: se pintan al enviar por la malla
        </p>
      ) : (
        <div className="mt-1.5 space-y-1">
          {lista.map((r) => (
            <FilaRecibo key={r.id} recibo={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Traducción del recibo del mesh al recibo único del modelo ──

/** Traduce un recibo de entrega del mesh a un `Recibo` del modelo único:
 *  `desdeEntregaMesh` decide estado, medio y ruta de forma monótona. Pura. */
export function reciboDeEntrega(r: DeliveryReceipt): Recibo {
  const ev = desdeEntregaMesh({
    status: r.status,
    hops: r.hops.map((h) => ({ via: MEDIO_DE_VIA[h.via], status: h.status })),
  });
  return {
    datoId: r.id,
    tipo: 'mensaje',
    estado: ev.estado,
    medio: ev.medio ?? null,
    ruta: ev.ruta ?? [],
    confirmadoPor: null,
    t: r.endedAt || r.startedAt,
    detalle: r.summary,
  };
}

/** Hora legible (hh:mm:ss) del recibo para la fila. */
export function horaLegal(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}

// ── Una fila: dato, hora, chips de estado/medio y la ruta ──

function FilaRecibo({ recibo }: { recibo: DeliveryReceipt }) {
  const rec = reciboDeEntrega(recibo);
  const ruta = rec.ruta.length > 0 ? rec.ruta.join(' → ') : null;
  return (
    <div data-testid="fila-recibo" className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/80" title={recibo.summary || recibo.id}>
        {recibo.summary || recibo.id}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-white/45">{horaLegal(rec.t)}</span>
      <RecibosChips recibo={rec} />
      {ruta && (
        <span className="w-full truncate text-[9px] text-white/35" title={ruta}>
          ruta: {ruta}
        </span>
      )}
    </div>
  );
}

export default DeliveryReceiptsPanel;
