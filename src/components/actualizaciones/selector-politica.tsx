"use client";

/**
 * Selector de política por capa: cómo le llega cada capa de un sistema a esta cuenta o entidad.
 * Una fila por capa (nombre, qué es, cómo se aplica) y su modo; «Programada» pide la ventana.
 */

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMO_SE_APLICA } from "@/lib/actualizaciones/capas";
import { NOMBRE_CAPA, QUE_ES_CAPA, type CapaActualizacion } from "@/lib/actualizaciones/manifiesto";
import {
  MODOS_POLITICA, NOMBRE_MODO, VENTANA_NOCTURNA, type ModoPolitica, type PoliticaCapa, type PoliticaSistema,
} from "@/lib/actualizaciones/politica";

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const CAMPO = "cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/85 focus:outline-none focus:ring-1 focus:ring-sky-400/60";

export interface SelectorPoliticaProps {
  politica: PoliticaSistema;
  capas: readonly CapaActualizacion[];
  onCambiar: (capa: CapaActualizacion, p: PoliticaCapa) => void;
  /** Etiqueta accesible del grupo (p. ej. «Política de StarSeed OS»). */
  etiqueta: string;
  compacto?: boolean;
  deshabilitado?: boolean;
}

export function SelectorPolitica({ politica, capas, onCambiar, etiqueta, compacto = false, deshabilitado = false }: SelectorPoliticaProps) {
  return (
    <div role="group" aria-label={etiqueta} className="space-y-1.5">
      {capas.map((capa) => {
        const p = politica[capa];
        const id = `pol-${etiqueta.replace(/\W+/g, "-")}-${capa}`;
        return (
          <div key={capa} className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-2.5", compacto ? "py-1.5" : "py-2")}>
            <div className="min-w-0 flex-1 basis-40">
              <label htmlFor={id} className="text-[12px] font-medium text-white/85">{NOMBRE_CAPA[capa]}</label>
              {!compacto && (
                <p className="text-[10px] leading-snug text-white/45">
                  {QUE_ES_CAPA[capa]} <span className="text-white/35">{COMO_SE_APLICA[capa].texto}</span>
                </p>
              )}
            </div>
            <select
              id={id}
              value={p.modo}
              disabled={deshabilitado}
              onChange={(e) => {
                const modo = e.target.value as ModoPolitica;
                onCambiar(capa, modo === "programada" ? { modo, ventana: p.ventana ?? { ...VENTANA_NOCTURNA } } : { modo });
              }}
              className={CAMPO}
            >
              {MODOS_POLITICA.map((m) => (
                <option key={m} value={m}>{NOMBRE_MODO[m]}</option>
              ))}
            </select>
            {p.modo === "programada" && (
              <span className="inline-flex items-center gap-1 text-[10px] text-white/55">
                <Clock className="h-3 w-3" aria-hidden />
                <select aria-label={`${NOMBRE_CAPA[capa]}: desde`} value={p.ventana?.desdeH ?? 3} disabled={deshabilitado} className={CAMPO}
                  onChange={(e) => onCambiar(capa, { modo: "programada", ventana: { desdeH: Number(e.target.value), hastaH: p.ventana?.hastaH ?? 6 } })}>
                  {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
                a
                <select aria-label={`${NOMBRE_CAPA[capa]}: hasta`} value={p.ventana?.hastaH ?? 6} disabled={deshabilitado} className={CAMPO}
                  onChange={(e) => onCambiar(capa, { modo: "programada", ventana: { desdeH: p.ventana?.desdeH ?? 3, hastaH: Number(e.target.value) } })}>
                  {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SelectorPolitica;
