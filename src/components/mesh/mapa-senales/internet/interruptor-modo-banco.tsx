"use client";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface TextosInternet {
  bancoTitulo: string;
  bancoAyuda: string;
  quedaHoy: (mb: number) => string;
  agotadoHoy: string;
}

export function InterruptorModoBanco({
  activo,
  onCambiar,
  textos,
  restanteHoyMb,
}: {
  activo: boolean;
  onCambiar: (activo: boolean) => void;
  textos: TextosInternet;
  restanteHoyMb: number | null;
}) {
  const idAyuda = "ayuda-modo-banco";
  
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 cursor-pointer hover:border-emerald-400/25 transition-colors duration-200">
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">{textos.bancoTitulo}</span>
          <span id={idAyuda} className="block text-[9px] leading-snug text-white/45">{textos.bancoAyuda}</span>
        </span>
        <Switch 
          checked={activo} 
          onCheckedChange={onCambiar} 
          aria-label={textos.bancoTitulo}
          aria-describedby={idAyuda}
        />
      </label>
      {activo && restanteHoyMb !== null && (
        <div role="status" className="px-2.5 text-[9px] font-medium text-emerald-200/90">
          {restanteHoyMb > 0 ? textos.quedaHoy(restanteHoyMb) : textos.agotadoHoy}
        </div>
      )}
    </div>
  );
}
