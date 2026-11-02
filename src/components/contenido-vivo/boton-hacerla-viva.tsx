"use client";
/**
 * Botón «Hacerla viva» (CVV1028, tarea K · contrato `architecture/contenido-vivo.md` §2).
 * Se pone en el lienzo universal de creación sobre lo que se está creando
 * (publicación, página, evento, cartel, estación o mensaje) y abre el panel
 * «Contenido vivo» (tarea H) que añade niveles a lo que ya existe, sin rehacerlo.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { PanelContenidoVivo, type CotizacionViva } from "./panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

export interface BotonHacerlaVivaProps {
  /** Conexiones, cupos y tope del ámbito de lo que se está creando. */
  contexto: ContextoVivo;
  /** Se llama con la cotización solo cuando el generador la confirma. */
  onConfirmar: (cotizacion: CotizacionViva[]) => void;
}

export function BotonHacerlaViva({ contexto, onConfirmar }: BotonHacerlaVivaProps) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-white/55">Contenido vivo</label>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls="panel-contenido-vivo-lienzo"
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-cyan-400/50 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100 transition-colors hover:bg-cyan-400/20"
      >
        <Sparkles className="size-3" aria-hidden />
        {abierto ? "Ocultar el plan" : "Hacerla viva"}
      </button>
      {abierto && (
        <div id="panel-contenido-vivo-lienzo">
          <PanelContenidoVivo contexto={contexto} onConfirmar={onConfirmar} />
        </div>
      )}
    </div>
  );
}
