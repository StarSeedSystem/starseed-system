"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { TextosInternet } from "@/lib/malla/internet/tipos";

type Props = {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  textos: Pick<typeof TextosInternet, "bancoTitulo" | "bancoAyuda" | "quedaHoy" | "agotadoHoy">;
  restanteHoyMb: number | null;
};

const AYUDA_ID = "interruptor-modo-banco-ayuda";

export function InterruptorModoBanco({ activo, onCambiar, textos, restanteHoyMb }: Props) {
  const switchId = React.useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={switchId}
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">{textos.bancoTitulo}</span>
          <span id={AYUDA_ID} className="block text-[9px] leading-snug text-white/45">
            {textos.bancoAyuda}
          </span>
        </span>
        <Switch
          id={switchId}
          checked={activo}
          onCheckedChange={onCambiar}
          aria-describedby={AYUDA_ID}
        />
      </label>
      {activo && restanteHoyMb !== null && (
        <p
          role="status"
          aria-live="polite"
          className="text-[10px] leading-snug text-white/70"
        >
          {restanteHoyMb === 0 ? textos.agotadoHoy : textos.quedaHoy(restanteHoyMb)}
        </p>
      )}
    </div>
  );
}