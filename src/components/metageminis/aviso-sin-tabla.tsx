"use client";

/*
 * AvisoSinTabla — lo que se ve cuando una parte de MetaGeminis aún no tiene su tabla (migración sin aplicar)
 * o no se pudo leer. Dice la verdad con claridad: no pinta ceros como si fueran datos.
 */

import { DatabaseZap, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const MIGRACION_METAGEMINIS = "supabase/migrations/20261011090000_metageminis.sql";

export function AvisoSinTabla({ que, tabla, className }: { que: string; tabla: string; className?: string }) {
  return (
    <div
      role="status"
      data-testid="aviso-sin-tabla"
      className={cn("flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3 text-xs text-amber-50", className)}
    >
      <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{que}: la tabla «{tabla}» todavía no existe en la base de datos.</p>
        <p className="text-white/60">
          La migración <code className="rounded bg-black/30 px-1">{MIGRACION_METAGEMINIS}</code> está escrita y probada, pero sin aplicar.
          Hasta entonces el script de MetaGeminis deja sus borradores en <code className="rounded bg-black/30 px-1">~/.starseed/metageminis/cola.jsonl</code>{" "}
          del equipo donde corre, y nada se envía.
        </p>
      </div>
    </div>
  );
}

export function AvisoError({ que, motivo, className }: { que: string; motivo: string; className?: string }) {
  return (
    <div role="alert" data-testid="aviso-error" className={cn("flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100", className)}>
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />
      <p className="min-w-0">
        <span className="font-medium">{que}:</span> {motivo}
      </p>
    </div>
  );
}
