"use client";

import { useEffect, useState } from "react";
import { Download, HardDrive, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { esEstadoPrecarga, EVENTO_PRECARGA, type EstadoPrecarga } from "@/lib/pwa/precarga-cliente";

function formatearBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function tieneServiceWorker(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

const BOTON_BASE = "inline-flex items-center justify-center gap-1.5 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-[#39FF14]/30 disabled:opacity-50 disabled:pointer-events cursor-pointer";
const BOTON_OUTLINE_SM = "border-white/20 bg-white/[0.04] text-white/90 hover:bg-white/10 h-8 px-3 text-xs";

export function PrecargaSinInternet() {
  const [estado, setEstado] = useState<EstadoPrecarga | null>(null);
  const [swDisponible, setSwDisponible] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as unknown as { STARSEED_PRECARGA?: unknown };
    const inicial = win.STARSEED_PRECARGA;
    if (esEstadoPrecarga(inicial)) setEstado(inicial);

    setSwDisponible(tieneServiceWorker());

    const onEvento = (ev: Event) => {
      const ce = ev as CustomEvent<unknown>;
      if (ce.detail && esEstadoPrecarga(ce.detail)) setEstado(ce.detail);
    };
    window.addEventListener(EVENTO_PRECARGA, onEvento);
    return () => window.removeEventListener(EVENTO_PRECARGA, onEvento);
  }, []);

  const pedirDescarga = () => {
    const win = window as unknown as { STARSEED_PRECARGAR?: (forzar?: boolean) => boolean };
    win.STARSEED_PRECARGAR?.(true);
  };

  if (!swDisponible) {
    return (
      <div
        role="status"
        aria-label="Este navegador no puede guardar la app para usarla sin internet"
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-400/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Este navegador no puede guardar la app para usarla sin internet</span>
      </div>
    );
  }

  if (!estado) {
    return (
      <div
        role="status"
        aria-label="Aún no hay datos de la precarga"
        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white/60"
      >
        <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Aún no hay datos de la precarga</span>
      </div>
    );
  }

  if (estado.completo) {
    return (
      <div
        role="status"
        aria-label="Lista para usar sin internet"
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-200"
      >
        <CheckCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Lista para usar sin internet</span>
      </div>
    );
  }

  const bytesTexto = formatearBytes(estado.bytes);
  const motivoTexto = estado.motivo ? ` · ${estado.motivo}` : "";

  return (
    <div className="flex flex-col gap-2">
      <div
        role="status"
        aria-label={`Guardadas ${estado.guardados} de ${estado.planificados} · ${bytesTexto}${motivoTexto}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200"
      >
        <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Guardadas {estado.guardados} de {estado.planificados} · {bytesTexto}{motivoTexto}</span>
      </div>
      <button
        onClick={pedirDescarga}
        className={cn(BOTON_BASE, BOTON_OUTLINE_SM, "w-fit")}
        aria-label="Descargar la app para usarla sin internet"
      >
        <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden />
        Descargar para usar sin internet
      </button>
    </div>
  );
}