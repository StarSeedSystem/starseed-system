"use client";

/**
 * Barra de resumen del mapa: recuentos MEDIDOS de lo que se oye ahora (nada de relleno) y las
 * dos acciones reales de la página: escanear Bluetooth y volver a sondear todas las fuentes.
 */

import { Bluetooth, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResumenMapa, ResumenVivo } from "@/lib/senales/mapa-3d";

const CHIP = "rounded-full border px-2 py-0.5";

export interface BarraResumenProps {
  resumen: ResumenMapa;
  vivo: ResumenVivo;
  /** Medios abiertos ahora en todos los aparatos. */
  medios: number;
  compacto: boolean;
  bleSoportado: boolean;
  bleEscaneando: boolean;
  bleDetalle: string;
  ocupado: boolean;
  sondeando: boolean;
  onBle: () => void;
  onSondear: () => void;
}

export function BarraResumen(p: BarraResumenProps) {
  const { resumen, vivo } = p;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className={cn(CHIP, "border-white/10 bg-white/[0.04] font-semibold text-white/80")}>
        {resumen.total} {resumen.total === 1 ? "señal" : "señales"}
      </span>
      {vivo.aparatos > 0 && (
        <span
          className={cn(CHIP, "border-violet-400/30 bg-violet-500/10 text-violet-200")}
          title="Aparatos de tu cuenta y enlaces directos. «Activos» = con un medio abierto a la vista ahora (presencia en vivo)"
        >
          {vivo.aparatos} {vivo.aparatos === 1 ? "aparato" : "aparatos"} · {vivo.porEstado.activa} {vivo.porEstado.activa === 1 ? "activo" : "activos"} ahora
        </span>
      )}
      {vivo.aparatos > 0 && (
        <span className={cn(CHIP, "border-teal-400/30 bg-teal-500/10 text-teal-200")} title="Aparatos con un canal P2P o un enlace directo abierto, con su latencia medida">
          {vivo.conCanal} con enlace medido
        </span>
      )}
      {p.medios > 0 && (
        <span className={cn(CHIP, "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200")} title="Formas de abrir el OS que están abiertas ahora en tus aparatos">
          {p.medios} {p.medios === 1 ? "medio abierto" : "medios abiertos"}
        </span>
      )}
      {!p.compacto && (
        <>
          <span className={cn(CHIP, "border-emerald-400/30 bg-emerald-500/10 text-emerald-200")} title="Posición GPS real de ambos extremos">
            {resumen.gps} con GPS real
          </span>
          <span className={cn(CHIP, "border-sky-400/30 bg-sky-500/10 text-sky-200")} title="Distancia estimada por radiofrecuencia, rumbo desconocido">
            {resumen.rf} por radiofrecuencia
          </span>
          <span className={cn(CHIP, "border-amber-400/30 bg-amber-500/10 text-amber-200")} title="Sin posición: solo el sector de su antena">
            {resumen.sector} sin posición
          </span>
        </>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        {p.bleSoportado && (
          <button
            type="button"
            disabled={p.ocupado}
            onClick={p.onBle}
            title={p.bleDetalle}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors duration-200 disabled:cursor-wait disabled:opacity-60",
              p.bleEscaneando
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                : "border-blue-400/30 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20",
            )}
          >
            <Bluetooth className="h-3 w-3" /> {p.bleEscaneando ? "Detener BLE" : "Escanear BLE"}
          </button>
        )}
        <button
          type="button"
          onClick={p.onSondear}
          aria-label="Volver a sondear todas las fuentes"
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/65 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
        >
          {p.sondeando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sondear
        </button>
      </span>
    </div>
  );
}
