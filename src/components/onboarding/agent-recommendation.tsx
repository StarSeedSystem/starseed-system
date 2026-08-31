"use client";

/**
 * AgentRecommendation — panel del "agente de integración" en cada paso del
 * wizard. Muestra la mejor configuración elegida automáticamente para este
 * dispositivo, EXPLICA por qué, y deja aceptar con un toque o modificarla
 * con los controles del paso. Honesto: las razones citan lo realmente
 * detectado; lo que no se pudo detectar se dice tal cual.
 */

import { Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AgentRecommendation({
  razones,
  aplicado,
  onAceptar,
  cargando,
  className,
}: {
  razones: string[];
  aplicado: boolean;
  onAceptar?: () => void;
  cargando?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-3.5 space-y-2.5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-200/90">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Recomendación del agente de integración
        </p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            aplicado
              ? "bg-emerald-400/15 text-emerald-300"
              : "bg-white/10 text-slate-300",
          )}
        >
          {aplicado ? "Aplicada" : "Sugerida"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {razones.map((r, i) => (
          <li key={i} className="flex gap-2 text-xs leading-snug text-slate-300">
            <span aria-hidden className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/70" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {!aplicado && onAceptar && (
        <Button size="sm" onClick={onAceptar} disabled={cargando} className="h-8 gap-1.5 text-xs">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {cargando ? "Aplicando…" : "Aceptar recomendación"}
        </Button>
      )}
      <p className="text-[10px] text-slate-400">
        Puedes modificar cualquier opción abajo; todo es reconfigurable después en Ajustes.
      </p>
    </div>
  );
}

export default AgentRecommendation;
