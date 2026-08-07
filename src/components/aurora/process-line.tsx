"use client";

/**
 * ProcessLine — línea de «proceso» bajo una respuesta de Aurora/Astraura.
 * ============================================================================
 * Adenda 149 · ola 3 (idea 2.13:180). Nació dentro de `aurora-chat-view.tsx` y
 * era privada de esa superficie, así que el chat de `/agent` no podía decir
 * QUÉ fuente respondió de verdad. Aquí queda como componente COMPARTIDO.
 *
 * Dos pieles, misma información:
 *   · `variant="axc"`   → las clases `.axc-process-*` del Exocórtex (el CSS lo
 *     inyecta `aurora-chat-section.tsx`; fuera de ahí no existen).
 *   · `variant="glass"` → estilo autocontenido con utilidades Tailwind, para
 *     cualquier otra superficie (chat de `/agent`, paneles…).
 *
 * Muestra SOLO lo que hay en `meta` (sin inventar proveedor): si no hay nada
 * que contar, no renderiza. Defensivo y SSR-safe.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";

export interface ProcessLineProps {
  meta: AuroraMessageMeta | null | undefined;
  /** Abre el modal de proceso completo (`MessageProcessModal`). */
  onOpenFull?: () => void;
  variant?: "axc" | "glass";
  className?: string;
}

/** Resumen honesto: fuente real · modelo · intentos · duración · herramientas. */
export function processSummary(meta: AuroraMessageMeta | null | undefined): string {
  if (!meta) return "";
  const toolCount = meta.tools?.length ?? 0;
  const attempts = typeof meta.attempts === "number" && meta.attempts > 1 ? `${meta.attempts} intentos` : null;
  return [
    meta.local ? "respuesta local" : meta.provider || null,
    meta.model || null,
    attempts,
    typeof meta.ms === "number" ? `${meta.ms} ms` : null,
    toolCount ? `${toolCount} herramienta${toolCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
}

export function ProcessLine({ meta, onOpenFull, variant = "glass", className }: ProcessLineProps) {
  const [open, setOpen] = useState(false);
  const summary = processSummary(meta);
  if (!meta || !summary) return null;

  const axc = variant === "axc";
  const chevron = open
    ? <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
    : <ChevronRight className="h-2.5 w-2.5" aria-hidden="true" />;

  return (
    <div className={cn(axc ? "axc-process" : "mt-1.5", className)}>
      <button
        type="button"
        className={cn(
          axc
            ? "axc-process-toggle"
            : "inline-flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-0 py-0.5 font-mono text-[9px] tracking-wide text-white/40 transition-colors duration-200 hover:text-white/75",
        )}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Ver el proceso de esta respuesta"
      >
        <span
          className={cn(axc ? "axc-process-dot" : "h-1.5 w-1.5 shrink-0 rounded-full bg-[#7fb8ff]/60")}
          aria-hidden="true"
        />
        proceso · {summary}
        {chevron}
      </button>
      {open && (
        <div
          className={cn(
            axc
              ? "axc-process-detail"
              : "mt-1.5 flex flex-col gap-1 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[10.5px] leading-relaxed text-white/65",
          )}
        >
          {meta.reason && <p>{meta.reason}</p>}
          {meta.tools?.map((t, i) => (
            <div key={`${t.name}-${i}`} className={cn(axc ? "axc-process-tool" : "flex items-start gap-1.5")}>
              <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", t.ok ? "bg-[#39FF14]" : "bg-[#FFBF00]")} />
              <span className="min-w-0 flex-1">{t.name} — {t.summary}</span>
            </div>
          ))}
          {onOpenFull && (
            <button
              type="button"
              className={cn(
                axc
                  ? "axc-process-link"
                  : "mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-left text-[10px] text-[#7fb8ff] hover:underline",
              )}
              onClick={onOpenFull}
            >
              Ver proceso completo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ProcessLine;
