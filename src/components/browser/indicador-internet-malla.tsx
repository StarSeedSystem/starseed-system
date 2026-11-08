"use client";

/**
 * Indicador pequeño del navegador de la app: «Internet por: <neurona> (vía Bluetooth directo, 1 salto)» mientras el
 * navegador (los <iframe> del webview) sale por una puerta de la malla, o el motivo de que esta plataforma no pueda
 * (PTA1108B · contrato `architecture/red-sin-dependencias.md` §5.3 c). No aparece con salida propia.
 */

import { useSyncExternalStore } from "react";
import { Globe2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { estadoPuerta, suscribirPuerta } from "@/lib/malla/puerta/servicio";
import { estadoProxyNativo, suscribirProxyNativo, vistaIndicador } from "@/lib/malla/puerta/proxy-nativo";

export function IndicadorInternetMalla({ className }: { className?: string }) {
  const puerta = useSyncExternalStore(suscribirPuerta, estadoPuerta, estadoPuerta);
  const nativo = useSyncExternalStore(suscribirProxyNativo, estadoProxyNativo, estadoProxyNativo);
  const v = vistaIndicador(puerta, nativo);
  if (!v.visible) return null;
  const aviso = v.tono === "aviso";
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="internet-por-navegador"
      title={v.detalle ?? undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] leading-5",
        aviso ? "border-amber-400/30 bg-amber-400/5 text-amber-200" : "border-[#39FF14]/30 bg-[#39FF14]/5 text-emerald-200",
        className,
      )}
    >
      {aviso ? <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden /> : <Globe2 className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">
        {v.texto}
        {v.detalle ? <span className="text-white/50"> · {v.detalle}</span> : null}
      </span>
    </p>
  );
}

export default IndicadorInternetMalla;
