"use client";

/**
 * Tarjeta de veredicto para una tarea bloqueada (Ola 343 · JV3).
 * Se monta al abrir una bloqueada; si no hay veredicto para ese id no
 * se renderiza nada. Los datos llegan ya leídos de disco por el servidor:
 * la tarjeta no habla con Jev ni con ninguna red.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FilaVeredicto } from "@/lib/mando/veredictos";
import { tonoDe } from "@/lib/mando/veredictos";

const TONOS: Record<string, { borde: string; texto: string; barra: string }> = {
  verde: {
    borde: "border-emerald-400/30",
    texto: "text-emerald-300",
    barra: "bg-emerald-400",
  },
  ambar: {
    borde: "border-amber-400/30",
    texto: "text-amber-300",
    barra: "bg-amber-400",
  },
  gris: {
    borde: "border-zinc-500/30",
    texto: "text-zinc-400",
    barra: "bg-zinc-500",
  },
};

const FUENTES: Record<string, string> = {
  regla: "regla",
  jev: "Jev",
  nadie: "sin fuente",
};

export function BloqueadaVeredicto({ fila }: { fila: FilaVeredicto | null }) {
  const [abierto, setAbierto] = useState(false);
  if (!fila) return null;
  const { tono, etiqueta } = tonoDe(fila);
  // Si un tono nuevo llegara sin estar en TONOS, caemos a gris en vez de romper el render.
  const clases = TONOS[tono] ?? TONOS.gris;
  const confianza = Math.round(fila.confianza * 100);
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border ${clases.borde} bg-black/10 px-3 py-2 text-xs`}
      data-testid={`veredicto-${fila.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-bold ${clases.texto}`}>{etiqueta}</span>
        <span className="text-[10px] text-muted-foreground/70">{FUENTES[fila.fuente] ?? "desconocida"}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/20">
          <div
            className={`h-full rounded-full ${clases.barra}`}
            style={{ width: `${confianza}%` }}
            aria-hidden
          />
        </div>
        <span className="text-[10px] text-muted-foreground/70">{confianza}%</span>
      </div>
      {fila.motivo ? <p className="text-[10px] text-foreground/80">{fila.motivo}</p> : null}
      {fila.cambio ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex w-fit cursor-pointer items-center gap-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 hover:text-foreground/90"
            aria-expanded={abierto}
          >
            {abierto ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <ChevronRight className="size-3" aria-hidden />
            )}
            Cambio propuesto
          </button>
          {abierto ? (
            <p className="whitespace-pre-wrap rounded-md border border-border/20 bg-black/10 px-2 py-1.5 text-[10px] text-foreground/90">
              {fila.cambio}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
