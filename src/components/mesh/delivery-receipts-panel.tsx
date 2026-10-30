"use client";

/**
 * DeliveryReceiptsPanel — Panel de recibos de entrega de la malla (Adenda 149).
 * ============================================================================
 * Muestra los últimos recibos de entrega usando useDeliveryReceipts y
 * desdeEntregaMesh para traducir los estados, y los pinta con RecibosChips.
 */

import { useMemo } from "react";
import { Clock, Check, CheckCircle, Eye, Globe, Share2, PhoneCall, Radio, PhoneOff, AlertTriangle } from "lucide-react";
import { useDeliveryReceipts } from "@/ai/astraura/mesh";
import { desdeEntregaMesh } from "@/lib/malla/cristal/adaptadores-recibos";
import type { DeliveryReceipt } from "@/ai/astraura/mesh/delivery";
import type { Recibo, EstadoRecibo } from "@/lib/malla/cristal/recibos";
import type { Medio } from "@/lib/malla/cristal/tipos";
import { RecibosChips } from "@/components/malla/recibos-chips";

const LIMITE_RECIBOS = 10;

const medioTexto = (medio: Medio | null): string => {
  if (!medio) return "";
  switch (medio) {
    case "lora":
      return "LoRa";
    case "ble":
      return "BLE";
    case "wifi-lan":
      return "Wi‑Fi";
    case "webrtc":
      return "WebRTC";
    case "wifi-mesh":
      return "malla Wi‑Fi";
    case "reticulum":
      return "Reticulum";
    case "serie":
      return "Serie";
    case "servidor":
      return "Servidor";
    case "nfc":
      return "NFC";
    default:
      return medio;
  }
};

const iconoPorEstado = (estado: EstadoRecibo) => {
  switch (estado) {
    case "preparado":
      return Clock;
    case "enviado":
      return Check;
    case "recibido":
      return CheckCircle;
    case "leido":
      return Eye;
    case "publicado":
      return Globe;
    case "propagado":
      return Share2;
    case "llamando":
      return PhoneCall;
    case "en-directo":
      return Radio;
    case "terminada":
      return PhoneOff;
    case "fallido":
      return AlertTriangle;
    default:
      return Clock;
  }
};

const textoPorEstado = (estado: EstadoRecibo): string => {
  switch (estado) {
    case "preparado":
      return "Preparado";
    case "enviado":
      return "Enviado";
    case "recibido":
      return "Recibido";
    case "leido":
      return "Leído";
    case "publicado":
      return "Publicado";
    case "propagado":
      return "Propagado";
    case "llamando":
      return "Llamando";
    case "en-directo":
      return "En directo";
    case "terminada":
      return "Terminada";
    case "fallido":
      return "Fallido";
    default:
      return "Desconocido";
  }
};

function traducirRecibo(d: DeliveryReceipt): Recibo {
  const evento = desdeEntregaMesh({
    status: d.status,
    hops: d.hops.map((h) => ({ via: h.via, status: h.status })),
  });
  return {
    datoId: d.id,
    tipo: "mensaje",
    estado: evento.estado,
    medio: evento.medio,
    ruta: evento.ruta ?? [],
    confirmadoPor: null,
    t: d.endedAt,
    detalle: d.summary,
  };
}

export function DeliveryReceiptsPanel() {
  const receipts = useDeliveryReceipts();

  const últimos = useMemo(() => receipts.slice(0, LIMITE_RECIBOS), [receipts]);

  if (últimos.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center text-[12px] text-white/45">
        Sin recibos de entrega recientes
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-white/90">Recibos de entrega recientes</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {últimos.map((r) => {
          const recibo = traducirRecibo(r);
          const Icon = iconoPorEstado(recibo.estado);
          const medio = medioTexto(recibo.medio);
          const estadoTexto = textoPorEstado(recibo.estado);
          const rutaTexto = recibo.ruta.length > 0 ? recibo.ruta.join(" → ") : "";
          const hora = new Date(recibo.t).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          const ariaLabel = medio
            ? `por ${medio}: ${rutaTexto}`
            : rutaTexto
            ? `ruta: ${rutaTexto}`
            : `estado: ${estadoTexto}`;

          return (
            <div
              key={r.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-sky-300" />
                  <span className="text-[12px] font-medium text-white/90">{estadoTexto}</span>
                  {medio && (
                    <span className="text-[11px] text-emerald-300">{medio}</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] text-white/40 font-mono">{hora}</span>
              </div>
              {recibo.detalle && (
                <p className="mt-1 text-[11px] text-white/55 truncate">{recibo.detalle}</p>
              )}
              {rutaTexto && (
                <p className="mt-1 text-[10px] text-white/40 truncate">{rutaTexto}</p>
              )}
              <RecibosChips recibo={recibo} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DeliveryReceiptsPanel;