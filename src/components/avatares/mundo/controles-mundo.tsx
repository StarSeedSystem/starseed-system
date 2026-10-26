"use client";

/**
 * Controles del mundo (Ola 1025U · U1): pausa, velocidad y cámara. Objetivos de 44 px, con etiqueta de
 * texto para lector de pantalla, y envueltos para que quepan en 360 px sin desbordar.
 */
import { useEffect, useRef, useState } from "react";
import { Compass, Crosshair, Gauge, Pause, Play } from "lucide-react";

const CLASE_BOTON =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 " +
  "text-xs font-bold text-white/85 transition duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-[#007FFF]";

export interface ControlesMundoProps {
  pausado: boolean;
  onPausar: () => void;
  onReanudar: () => void;
  velocidad: number;
  onVelocidad: (v: number) => void;
  /** Con la escena 3D hay cámara que centrar; en la crónica de texto no. */
  conCamara: boolean;
  habitantes: ReadonlyArray<{ id: string; nombre: string }>;
  centradoId: string | null;
  onCentrar: (id: string | null) => void;
}

export function ControlesMundo({ pausado, onPausar, onReanudar, velocidad, onVelocidad, conCamara, habitantes, centradoId, onCentrar }: ControlesMundoProps) {
  const [lista, setLista] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lista) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLista(false);
    };
    const alPulsar = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setLista(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alPulsar);
    };
  }, [lista]);

  return (
    <div ref={raiz} className="relative flex flex-wrap items-center gap-2" role="group" aria-label="Controles del mundo">
      {pausado ? (
        <button type="button" onClick={onReanudar} data-testid="boton-reanudar" className={CLASE_BOTON + " border-emerald-300/40 bg-emerald-500/20 text-emerald-50"}>
          <Play className="size-4" aria-hidden="true" /> Reanudar
        </button>
      ) : (
        <button type="button" onClick={onPausar} data-testid="boton-pausar" className={CLASE_BOTON}>
          <Pause className="size-4" aria-hidden="true" /> Pausar
        </button>
      )}

      <div className="inline-flex items-center gap-1" role="group" aria-label="Velocidad de la simulación">
        <Gauge className="ml-1 size-4 text-white/55" aria-hidden="true" />
        {[1, 2, 4].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={velocidad === v}
            aria-label={`Velocidad ${v}×`}
            onClick={() => onVelocidad(v)}
            className={CLASE_BOTON + " px-2.5 " + (velocidad === v ? "border-cyan-300/60 bg-cyan-400/20 text-cyan-50" : "")}
          >
            {v}×
          </button>
        ))}
      </div>

      {conCamara && (
        <>
          <button type="button" aria-haspopup="listbox" aria-expanded={lista} onClick={() => setLista((v) => !v)} className={CLASE_BOTON} title="Centrar la cámara en un habitante">
            <Crosshair className="size-4 text-violet-300" aria-hidden="true" /> Centrar
          </button>
          <button type="button" onClick={() => onCentrar(null)} className={CLASE_BOTON} aria-label="Vista general" title="Volver a la vista general">
            <Compass className="size-4 text-amber-300" aria-hidden="true" />
            <span className="hidden sm:inline">Vista general</span>
          </button>
        </>
      )}

      {lista && (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-60 w-[min(18rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[rgba(8,12,24,0.88)] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          {habitantes.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-white/60">Aún no hay habitantes.</p>
          ) : (
            <ul className="flex flex-col gap-1" role="listbox" aria-label="Habitantes">
              {habitantes.map((h) => (
                <li key={h.id} role="option" aria-selected={centradoId === h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onCentrar(h.id);
                      setLista(false);
                    }}
                    className={
                      "flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl px-3 text-left text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF] " +
                      (centradoId === h.id ? "bg-violet-500/25 text-white" : "text-white/80 hover:bg-white/10")
                    }
                  >
                    <span className="truncate">{h.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
