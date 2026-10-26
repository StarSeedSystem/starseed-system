"use client";
/**
 * Ventana de la Protomolécula · peticiones recientes (solo en este aparato, máximo 8). Tocar una la devuelve a
 * la barra para repetirla o ajustarla; no se vuelve a enviar sola.
 */
import { History, Trash2 } from "lucide-react";
import type { EntradaHistorial } from "./tipos";

export interface ListaHistorialProps {
  entradas: EntradaHistorial[];
  alElegir: (e: EntradaHistorial) => void;
  alBorrar: () => void;
}

export function ListaHistorial({ entradas, alElegir, alBorrar }: ListaHistorialProps) {
  if (entradas.length === 0) return null;
  return (
    <details data-testid="historial" className="group rounded-2xl border border-white/10 bg-white/5">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80 [&::-webkit-details-marker]:hidden">
        <History className="h-4 w-4 text-[#00F0FF]" aria-hidden="true" />
        Peticiones recientes ({entradas.length})
        <span className="ml-auto text-[11px] font-normal text-white/50">solo en este aparato</span>
      </summary>
      <ul className="flex flex-col gap-1 px-2 pb-2">
        {entradas.map((e) => (
          <li key={`${e.en}-${e.texto}`}>
            <button
              type="button"
              onClick={() => alElegir(e)}
              title={e.donde ? `Pedido en: ${e.donde}` : undefined}
              className="flex min-h-[44px] w-full cursor-pointer flex-col items-start justify-center rounded-xl px-2 py-1 text-left text-xs transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
            >
              <span className="w-full truncate">{e.texto}</span>
              <span className="text-[11px] text-white/50">{e.modo === "rama" ? "En una rama" : "Directo"}{e.donde ? ` · ${e.donde}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={alBorrar}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 text-xs transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Borrar el historial
        </button>
      </div>
    </details>
  );
}
