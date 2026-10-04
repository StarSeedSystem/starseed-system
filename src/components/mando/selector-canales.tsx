"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CANALES, type CanalId, type RespuestaCanal } from "@/lib/mando/chat-director-tipos";

export interface SelectorCanalesProps {
  valor: CanalId[];
  onCambio: (c: CanalId[]) => void;
  excluir?: CanalId[];
}

/** Insignia que promete cuándo contesta cada canal. */
const INSIGNIA: Record<RespuestaCanal, string> = {
  inmediata: "al momento",
  "en-revision": "en su revisión",
  archivo: "por archivo",
  ninguna: "por archivo",
};

const INSIGNIA_TONO: Record<RespuestaCanal, string> = {
  inmediata: "text-emerald-300 border-emerald-500/30",
  "en-revision": "text-amber-300 border-amber-500/30",
  archivo: "text-zinc-400 border-zinc-600/40",
  ninguna: "text-zinc-400 border-zinc-600/40",
};

/** Lista de canales del Chat Director con casillas; accesible y plegable. */
export function SelectorCanales({ valor, onCambio, excluir = [] }: SelectorCanalesProps) {
  const [abierto, setAbierto] = useState(false);
  const visibles = CANALES.filter((c) => !excluir.includes(c.id));

  const alternar = (id: CanalId) => {
    if (valor.includes(id)) onCambio(valor.filter((c) => c !== id));
    else onCambio([...valor, id]);
  };

  return (
    <div className="relative" data-testid="selector-canales">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-zinc-900 px-2.5 py-1.5 text-xs text-violet-200 transition-colors duration-200 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
      >
        Canales ({valor.length})
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div
          role="group"
          aria-label="Canales de destino"
          className="absolute z-20 mt-1 w-72 rounded-lg border border-violet-500/20 bg-zinc-900 p-1.5 shadow-lg shadow-black/40"
        >
          {visibles.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-zinc-800 focus-within:ring-1 focus-within:ring-violet-400/60"
            >
              <input
                type="checkbox"
                checked={valor.includes(c.id)}
                onChange={() => alternar(c.id)}
                aria-label={c.nombre}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-violet-500"
              />
              <span className="flex flex-1 flex-col">
                <span className="text-xs text-zinc-100">{c.nombre}</span>
                <span className="text-[10px] text-zinc-500">{c.descripcion}</span>
              </span>
              <span className={`ml-1 whitespace-nowrap rounded border px-1 py-0.5 text-[9px] ${INSIGNIA_TONO[c.respuesta]}`}>
                {INSIGNIA[c.respuesta]}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
