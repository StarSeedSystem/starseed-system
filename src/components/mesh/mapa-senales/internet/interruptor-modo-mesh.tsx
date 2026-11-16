"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TextosInternet } from "@/lib/malla/internet/tipos";
import type { Audiencia, AjustesAudiencia } from "@/lib/malla/internet/tipos";

type Props = {
  audiencia: Audiencia;
  valor: AjustesAudiencia;
  onCambiar: (v: AjustesAudiencia) => void;
  textos: Pick<
    typeof TextosInternet,
    | "meshTitulo"
    | "meshAyuda"
    | "meshSinLimite"
    | "meshConLimite"
    | "audMiCuenta"
    | "audEntidad"
    | "audPublico"
    | "mb"
    | "gb"
  >;
};

const TEXTO_AUDIENCIA: Record<Audiencia, keyof Pick<typeof TextosInternet, "audMiCuenta" | "audEntidad" | "audPublico">> = {
  "mi-cuenta": "audMiCuenta",
  entidad: "audEntidad",
  publico: "audPublico",
};

const LIMITE_POR_DEFECTO_MB = 1024;

const AYUDA_ID_PREFIX = "interruptor-modo-mesh-ayuda";

export function InterruptorModoMesh({ audiencia, valor, onCambiar, textos }: Props) {
  const switchId = React.useId();
  const ayudaId = `${AYUDA_ID_PREFIX}-${audiencia}`;

  const etiquetaAudiencia = textos[TEXTO_AUDIENCIA[audiencia]];
  const estaEncendido = valor.mesh;

  const manejarSwitch = (nuevoEstado: boolean) => {
    onCambiar({ ...valor, mesh: nuevoEstado });
  };

  const manejarCambioLimite = (nuevoLimiteMb: number | null) => {
    if (!estaEncendido) return;
    onCambiar({ ...valor, limiteMeshMb: nuevoLimiteMb });
  };

  const obtenerOpcionActiva = () => {
    if (!estaEncendido) return null;
    return valor.limiteMeshMb === null ? "sin-limite" : "con-limite";
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, opcion: "sin-limite" | "con-limite") => {
    if (!estaEncendido) return;
    if (event.key === "ArrowRight" && opcion === "sin-limite") {
      event.preventDefault();
      manejarCambioLimite(LIMITE_POR_DEFECTO_MB);
    } else if (event.key === "ArrowLeft" && opcion === "con-limite") {
      event.preventDefault();
      manejarCambioLimite(null);
    }
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={switchId}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">{textos.meshTitulo}</span>
          <span id={ayudaId} className="block text-[9px] leading-snug text-white/45">
            {textos.meshAyuda}
          </span>
          <span className="block text-[9px] leading-snug text-sky-300/80 mt-0.5">{etiquetaAudiencia}</span>
        </span>
        <Switch
          id={switchId}
          checked={estaEncendido}
          onCheckedChange={manejarSwitch}
          aria-describedby={ayudaId}
        />
      </label>

      {estaEncendido && (
        <div role="radiogroup" aria-label={textos.meshTitulo} className="space-y-1.5 pl-1">
          <button
            type="button"
            role="radio"
            aria-checked={obtenerOpcionActiva() === "sin-limite"}
            onClick={() => manejarCambioLimite(null)}
            onKeyDown={(e) => handleKeyDown(e, "sin-limite")}
            className={cn(
              "flex items-center justify-between gap-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 text-left",
              obtenerOpcionActiva() === "sin-limite" && "border-emerald-400/35 bg-emerald-500/10",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "shrink-0 h-4 w-4 rounded-full border-2 transition-colors",
                  obtenerOpcionActiva() === "sin-limite"
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-white/20 bg-transparent",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-white/90">{textos.meshSinLimite}</span>
              </span>
            </span>
            {obtenerOpcionActiva() === "sin-limite" && (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-300" aria-hidden="true">
                {textos.meshSinLimite}
              </span>
            )}
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={obtenerOpcionActiva() === "con-limite"}
            onClick={() => manejarCambioLimite(LIMITE_POR_DEFECTO_MB)}
            onKeyDown={(e) => handleKeyDown(e, "con-limite")}
            className={cn(
              "flex items-center justify-between gap-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 text-left",
              obtenerOpcionActiva() === "con-limite" && "border-emerald-400/35 bg-emerald-500/10",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "shrink-0 h-4 w-4 rounded-full border-2 transition-colors",
                  obtenerOpcionActiva() === "con-limite"
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-white/20 bg-transparent",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-medium text-white/90">
                  Con tope ({textos.meshConLimite(LIMITE_POR_DEFECTO_MB)})
                </span>
              </span>
            </span>
            {obtenerOpcionActiva() === "con-limite" && (
              <span className="shrink-0 text-[10px] font-semibold text-emerald-300" aria-hidden="true">
                {textos.meshConLimite(valor.limiteMeshMb ?? LIMITE_POR_DEFECTO_MB)}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}