"use client";

/**
 * Neuronas de la cuenta con la versión de cada capa (de la presencia en vivo) y las que van
 * atrasadas con su motivo. «Canaria» marca la neurona donde se prueba primero cada versión (y la
 * de «automática solo en esta neurona»).
 */

import { CheckCircle2, CircleDashed, Bird, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Atraso } from "@/lib/actualizaciones/atrasadas";
import { NOMBRE_CAPA, type CapaActualizacion } from "@/lib/actualizaciones/manifiesto";
import type { NeuronaVista } from "./use-estado-actualizaciones";

export interface TablaNeuronasProps {
  neuronas: readonly NeuronaVista[];
  atrasos: readonly Atraso[];
  capas: readonly CapaActualizacion[];
  canariaId: string | null;
  onCanaria: (id: string | null) => void;
  presenciaConectada: boolean;
}

export function TablaNeuronas({ neuronas, atrasos, capas, canariaId, onCanaria, presenciaConectada }: TablaNeuronasProps) {
  const atrasadas = atrasos.filter((a) => capas.includes(a.capa));
  return (
    <div className="space-y-2">
      {!presenciaConectada && (
        <p className="text-[10px] leading-snug text-amber-200/80">
          La presencia en vivo no está conectada (sin sesión o sin Realtime): solo se ve esta neurona.
        </p>
      )}
      <ul className="space-y-1.5" aria-label="Neuronas y versión de cada capa">
        {neuronas.map((n) => {
          const canaria = n.neuronaId === canariaId;
          return (
            <li key={n.neuronaId} className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Smartphone className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
                <span className="min-w-0 truncate text-[12px] font-medium text-white/85">{n.nombre}</span>
                {n.esEsta && <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-1.5 text-[9px] font-semibold text-sky-200">ESTA</span>}
                {n.medios > 1 && <span className="text-[10px] text-white/40">{n.medios} medios abiertos</span>}
                <button
                  type="button"
                  aria-pressed={canaria}
                  onClick={() => onCanaria(canaria ? null : n.neuronaId)}
                  className={cn(
                    "ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-medium transition-colors duration-200",
                    canaria ? "border-amber-300/50 bg-amber-400/15 text-amber-100" : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/85",
                  )}
                  title="Las versiones se prueban primero en la neurona canaria"
                >
                  <Bird className="h-3 w-3" aria-hidden /> {canaria ? "Canaria" : "Hacer canaria"}
                </button>
              </div>
              <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                {capas.map((c) => (
                  <div key={c} className="flex gap-1">
                    <dt className="text-white/40">{NOMBRE_CAPA[c]}</dt>
                    <dd className={n.versiones[c] ? "font-mono text-white/75" : "text-white/30"}>{n.versiones[c] ?? "sin dato"}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      {atrasadas.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-200/85">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Todas las neuronas conocidas están al día en estas capas.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="Neuronas atrasadas">
          {atrasadas.map((a) => (
            <li key={`${a.neuronaId}-${a.capa}`} className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-100/85">
              <CircleDashed className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {a.texto}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default TablaNeuronas;
