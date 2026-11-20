"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
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
  inmediata: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  "en-revision": "text-amber-300 border-amber-500/30 bg-amber-500/10",
  archivo: "text-slate-300 border-slate-500/35 bg-slate-500/10",
  ninguna: "text-slate-300 border-slate-500/35 bg-slate-500/10",
};

interface PosicionMenu {
  top: number;
  left: number;
}

/**
 * Lista de canales del Chat Director con casillas.
 * Usa capa superior nativa (`popover="auto"`) + posicionamiento consciente del viewport
 * para jamás quedar detrás de los medidores inferiores ni recorte de contenedores.
 */
export function SelectorCanales({ valor, onCambio, excluir = [] }: SelectorCanalesProps) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<PosicionMenu | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const popoverId = `canales-popover-${rawId}`;
  const anchorName = `--ancla-canales-${rawId}`;
  const visibles = CANALES.filter((c) => !excluir.includes(c.id));

  const alternar = (id: CanalId) => {
    if (valor.includes(id)) onCambio(valor.filter((c) => c !== id));
    else onCambio([...valor, id]);
  };

  useEffect(() => {
    if (!abierto) {
      const nodo = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
      if (nodo && typeof nodo.hidePopover === "function") {
        try {
          if (nodo.matches(":popover-open")) nodo.hidePopover();
        } catch {
          // Ya cerrado.
        }
      }
      return;
    }

    const recalcular = () => {
      const btn = botonRef.current;
      if (!btn || typeof window === "undefined") return;
      const rect = btn.getBoundingClientRect();
      const anchoMenu = 304;
      const altoEstimado = Math.min(360, visibles.length * 52 + 24);
      const espacioAbajo = window.innerHeight - rect.bottom - 12;
      const top =
        espacioAbajo >= altoEstimado || espacioAbajo >= rect.top
          ? Math.max(8, rect.bottom + 6)
          : Math.max(8, rect.top - altoEstimado - 6);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - anchoMenu - 12));
      setPos({ top, left });
    };

    recalcular();

    const nodo = popoverRef.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    if (nodo && typeof nodo.showPopover === "function") {
      try {
        if (!nodo.matches(":popover-open")) nodo.showPopover();
      } catch {
        // Fallback fijo cuando el entorno no soporta Top Layer.
      }
    }

    const alToggle = (ev: Event) => {
      const e = ev as Event & { newState?: string };
      if (e.newState === "closed") setAbierto(false);
    };

    const alResize = () => recalcular();
    nodo?.addEventListener("toggle", alToggle);
    window.addEventListener("resize", alResize);
    window.addEventListener("scroll", alResize, true);
    return () => {
      nodo?.removeEventListener("toggle", alToggle);
      window.removeEventListener("resize", alResize);
      window.removeEventListener("scroll", alResize, true);
    };
  }, [abierto, visibles.length]);

  const estiloBoton = { anchorName } as CSSProperties;
  const estiloPopover: CSSProperties = {
    positionAnchor: anchorName,
    ...(pos ? { position: "fixed", top: `${pos.top}px`, left: `${pos.left}px`, zIndex: 2147483000 } : {}),
  } as CSSProperties;

  return (
    <div className="relative" data-testid="selector-canales">
      <button
        ref={botonRef}
        type="button"
        aria-expanded={abierto}
        aria-controls={popoverId}
        style={estiloBoton}
        onClick={() => setAbierto((a) => !a)}
        className="cursor-pointer flex items-center gap-1.5 rounded-lg border border-sky-400/35 bg-[#0A0F1D] px-2.5 py-1.5 text-xs text-sky-100 transition-colors duration-200 hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
      >
        Canales ({valor.length})
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div
          ref={popoverRef}
          id={popoverId}
          popover="auto"
          role="group"
          aria-label="Canales de destino"
          style={estiloPopover}
          className="mc-popover-canales mc-popover-anclado max-h-[min(360px,70vh)] w-[304px] overflow-y-auto p-2"
        >
          {visibles.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-sky-500/15 focus-within:ring-1 focus-within:ring-sky-400/60"
            >
              <input
                type="checkbox"
                checked={valor.includes(c.id)}
                onChange={() => alternar(c.id)}
                aria-label={c.nombre}
                className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-sky-500"
              />
              <span className="flex flex-1 flex-col">
                <span className="text-xs font-medium text-slate-100">{c.nombre}</span>
                <span className="text-[10px] leading-snug text-slate-400">{c.descripcion}</span>
              </span>
              <span className={`ml-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-medium ${INSIGNIA_TONO[c.respuesta]}`}>
                {INSIGNIA[c.respuesta]}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
