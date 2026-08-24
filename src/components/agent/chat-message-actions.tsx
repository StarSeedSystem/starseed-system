"use client";

/**
 * ChatMessageActions — «Regenerar» y «Bifurcar en un chat nuevo» (Tarea 2).
 * ============================================================================
 * Puramente presentacional: la lógica (encontrar el turno de usuario que
 * disparó la respuesta, conservar sus preferencias, copiar el historial a una
 * conversación nueva…) vive en `chat-surface.tsx`, que ya tiene todo el
 * contexto (conversación activa, proveedor, historial). Este componente sólo
 * pinta los dos botones y delega el click.
 */

import { RefreshCw, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessageActionsProps {
  /** Vuelve a pedir la respuesta a ESTE turno, conservando sus preferencias. */
  onRegenerate: () => void;
  /** Crea un chat nuevo con el historial hasta este mensaje incluido. */
  onBranch: () => void;
  /** Deshabilita ambos botones (p.ej. mientras ya hay un turno en curso). */
  busy?: boolean;
  className?: string;
}

export function ChatMessageActions({ onRegenerate, onBranch, busy, className }: ChatMessageActionsProps) {
  const btn =
    "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground " +
    "transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy}
        aria-label="Regenerar esta respuesta"
        title="Regenerar esta respuesta (mismo mensaje, mismas preferencias de aquel turno)"
        className={btn}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
      </button>
      <button
        type="button"
        onClick={onBranch}
        disabled={busy}
        aria-label="Bifurcar en un chat nuevo"
        title="Bifurcar en un chat nuevo desde aquí"
        className={btn}
      >
        <GitBranch className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default ChatMessageActions;
