"use client";

/**
 * Secciones de una ficha del mapa: cada valor lleva una pastilla que dice QUÉ CLASE de dato es
 * (medido por un instrumento, declarado por el propio aparato, estimado con un modelo, o no medido)
 * y, debajo, DE DÓNDE sale. Lo que no se pudo medir se escribe «no medido» y se explica. Todo el
 * texto viene de `lib/senales/fichas.ts`; aquí solo se pinta.
 */

import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dato, EstadoDato, FichaMapa } from "@/lib/senales/tipos-vivo";

export const ESTILO_DATO: Record<EstadoDato, { texto: string; clase: string; ayuda: string }> = {
  medido: { texto: "medido", clase: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200", ayuda: "Lo midió un instrumento (radio, canal P2P, navegador…)" },
  declarado: { texto: "declarado", clase: "border-sky-400/35 bg-sky-500/10 text-sky-200", ayuda: "Lo dice el propio aparato o nodo de sí mismo" },
  estimado: { texto: "estimado", clase: "border-amber-400/35 bg-amber-500/10 text-amber-200", ayuda: "Se calculó con un modelo y puede equivocarse" },
  "no-medido": { texto: "no medido", clase: "border-white/15 bg-white/[0.04] text-white/50", ayuda: "No hay dato: la nota dice por qué" },
};

export function PildoraDato({ estado }: { estado: EstadoDato }) {
  const e = ESTILO_DATO[estado];
  return (
    <span title={e.ayuda} className={cn("shrink-0 rounded-full border px-1.5 py-px text-[8px] font-black uppercase tracking-wider", e.clase)}>
      {e.texto}
    </span>
  );
}

function FilaDato({ d }: { d: Dato }) {
  return (
    <div className="border-t border-white/[0.06] py-1.5 first:border-t-0" data-estado={d.estado}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] text-white/50">{d.etiqueta}</span>
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          <span className={cn("break-words text-right text-[10px] tabular-nums", d.estado === "no-medido" ? "text-white/40" : "font-medium text-white/85")}>{d.valor}</span>
          <PildoraDato estado={d.estado} />
        </span>
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-white/35">
        <span className="text-white/25">Fuente:</span> {d.fuente}
      </p>
      {d.nota ? <p className="mt-0.5 text-[9px] leading-snug text-white/50">{d.nota}</p> : null}
    </div>
  );
}

export function FichaSecciones({ ficha, omitir = [] }: { ficha: FichaMapa; omitir?: readonly string[] }) {
  return (
    <div className="space-y-1.5">
      {ficha.secciones.filter((s) => !omitir.includes(s.id)).map((s, i) => (
        <details key={s.id} open={i < 3} className="group rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5" data-seccion={s.id}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-semibold text-white/80">
            {s.titulo}
            <span className="text-[9px] font-normal text-white/30 group-open:hidden">{s.datos.length} datos</span>
          </summary>
          <div className="mt-1">{s.datos.map((d) => <FilaDato key={d.etiqueta} d={d} />)}</div>
        </details>
      ))}
    </div>
  );
}

/** Ficha completa de algo que no es una señal (Tú, un medio): sin acciones, solo datos con fuente. */
export function FichaPanel({ ficha, color, onCerrar, onVolver, textoVolver }: {
  ficha: FichaMapa;
  color: string;
  onCerrar: () => void;
  onVolver?: () => void;
  textoVolver?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/45 p-3" data-testid="ficha-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-white/95">
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
            <span className="truncate">{ficha.titulo}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-white/50">{ficha.subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la ficha"
          className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] p-1 text-white/50 transition-colors duration-200 hover:border-white/25 hover:text-white/85"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-white/60">{ficha.resumen}</p>
      {onVolver ? (
        <button
          type="button"
          onClick={onVolver}
          className="mt-1.5 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-white/65 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
        >
          <ArrowLeft className="h-3 w-3" /> {textoVolver ?? "Volver"}
        </button>
      ) : null}
      <div className="mt-2"><FichaSecciones ficha={ficha} /></div>
    </div>
  );
}
