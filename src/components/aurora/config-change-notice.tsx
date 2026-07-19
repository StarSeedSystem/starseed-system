"use client";

/**
 * ConfigChangeNotice — DIVISOR SUTIL de "ajustes del chat actualizados"
 * (Adenda 71-ter · I1). Se renderiza en lugar de la burbuja normal cuando un
 * mensaje del hilo es un cambio de configuración (role 'system' +
 * meta.kind 'config-change', o el texto con el prefijo ⚙️). Pequeño, centrado
 * y tenue: no interrumpe el flujo de la conversación.
 *
 * Exportado para que TODAS las superficies de mensajes lo reutilicen
 * (agent/page.tsx, aurora-chat-view, fullscreen, mini-player).
 */

import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONFIG_CHANGE_KIND, CONFIG_CHANGE_PREFIX } from "@/lib/aurora/config-change";

/** ¿Es este mensaje un divisor de cambio de configuración? */
export function isConfigChangeMessage(
  role: string | null | undefined,
  text: string | null | undefined,
  meta?: { kind?: string } | null,
): boolean {
  if (meta?.kind === CONFIG_CHANGE_KIND) return true;
  return role === "system" && !!text && text.trim().startsWith(CONFIG_CHANGE_PREFIX);
}

/** Devuelve el resumen legible del cambio (sin el prefijo ⚙️). */
export function configChangeSummary(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (t.startsWith(CONFIG_CHANGE_PREFIX)) return t.slice(CONFIG_CHANGE_PREFIX.length).trim();
  return t;
}

export function ConfigChangeNotice({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const summary = configChangeSummary(text);
  return (
    <div className={cn("flex w-full items-center justify-center py-1.5", className)}>
      <div
        className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-light leading-tight text-white/40"
        title="Ajustes del chat actualizados"
      >
        <Settings2 className="h-3 w-3 shrink-0 text-white/35" />
        <span className="truncate">{summary || "Ajustes del chat actualizados"}</span>
      </div>
    </div>
  );
}

export default ConfigChangeNotice;
