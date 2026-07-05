"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — CAMPANITA DE AVISOS (actualizaciones · sugerencias · importantes)
 * ---------------------------------------------------------------------------
 * Muestra un botón-campana con el nº de avisos PENDIENTES y un panel glass con
 * la lista (título/detalle/acción + "marcar visto"). Reacciona en vivo a:
 *   · `starseed:updates`               (nueva versión / cambio del registro visto)
 *   · `starseed:astraura-suggestions`  (Aurora recalculó sugerencias)
 * y arranca la vigilancia del service worker (startUpdateWatch) para enterarse
 * de despliegues nuevos sin recargar.
 *
 * El ORQUESTADOR decidirá dónde montarlo (barra global). Además se monta en
 * Ajustes dentro de una tarjeta "Actualizaciones y avisos" para que "desde cada
 * configuración se note que hay una actualización".
 *
 * SSR-safe (no toca window en render), estética glass, iconografía lucide.
 * Defensivo: nunca lanza; si algo falla, simplemente no muestra avisos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import Link from "next/link";
import { Bell, Download, Sparkles, ArrowUpCircle, Check, CheckCheck, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPendingNotifications,
  markSeen,
  markAllSeen,
  startUpdateWatch,
  UPDATES_EVENT,
  type UpdateNotification,
  type NotificationKind,
} from "@/lib/notifications/update-notifications";
import { SUGGESTIONS_EVENT } from "@/ai/astraura/autonomy";

/** Icono por tipo de aviso (lucide). */
function kindIcon(kind: NotificationKind): React.ComponentType<{ className?: string }> {
  switch (kind) {
    case "update-app": return ArrowUpCircle;
    case "install-suggestion": return Sparkles;
    case "important": return Download;
    default: return Bell;
  }
}

/** Tono de acento por tipo (cardinal Trinity: azul guía / lima vitalidad / ámbar orden). */
function kindAccent(kind: NotificationKind): { text: string; bg: string } {
  switch (kind) {
    case "update-app":
      return { text: "text-[#007FFF]", bg: "bg-[#007FFF]/10 border-[#007FFF]/25" };
    case "install-suggestion":
      return { text: "text-[#39FF14]", bg: "bg-[#39FF14]/10 border-[#39FF14]/25" };
    case "important":
    default:
      return { text: "text-[#FFBF00]", bg: "bg-[#FFBF00]/10 border-[#FFBF00]/25" };
  }
}

interface NotificationsBellProps {
  /** Ruta/área actual para afinar las sugerencias (opcional). */
  context?: string;
  /** Clase extra para el botón (posicionamiento del orquestador). */
  className?: string;
  /** Alineación del panel desplegable. Por defecto a la derecha del botón. */
  align?: "left" | "right";
}

export function NotificationsBell({ context, className, align = "right" }: NotificationsBellProps) {
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<UpdateNotification[]>([]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  // Recalcula la lista de avisos pendientes (defensivo).
  const refresh = React.useCallback(async () => {
    try {
      const pending = await getPendingNotifications(context);
      setItems(pending);
    } catch {
      setItems([]);
    }
  }, [context]);

  // Montaje: primer cálculo + suscripciones + vigilancia del SW.
  React.useEffect(() => {
    setMounted(true);
    void refresh();

    const onUpdates = () => void refresh();
    const onSuggestions = () => void refresh();
    window.addEventListener(UPDATES_EVENT, onUpdates);
    window.addEventListener(SUGGESTIONS_EVENT, onSuggestions);

    let stopWatch = () => {};
    try { stopWatch = startUpdateWatch(); } catch { /* */ }

    // Reconsulta al volver a la pestaña (por si hubo despliegue mientras).
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener(UPDATES_EVENT, onUpdates);
      window.removeEventListener(SUGGESTIONS_EVENT, onSuggestions);
      document.removeEventListener("visibilitychange", onVisible);
      try { stopWatch(); } catch { /* */ }
    };
  }, [refresh]);

  // Cerrar el panel al hacer clic fuera o pulsar Escape.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = items.length;

  const onMarkSeen = React.useCallback((id: string) => {
    try { markSeen(id); } catch { /* */ }
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const onMarkAll = React.useCallback(() => {
    void markAllSeen();
    setItems([]);
  }, []);

  // SSR-safe: el badge/contador solo aparece tras montar en cliente.
  const showBadge = mounted && count > 0;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={showBadge ? `Avisos (${count} pendientes)` : "Avisos"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative grid place-items-center w-9 h-9 rounded-xl cursor-pointer transition-colors",
          "border border-white/10 bg-background/40 backdrop-blur-lg hover:bg-background/70",
          open && "bg-background/70 border-primary/30",
        )}
      >
        <Bell className={cn("w-[18px] h-[18px]", showBadge ? "text-primary" : "text-muted-foreground")} />
        {showBadge && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[#DC143C] text-white text-[10px] font-bold leading-none shadow ring-2 ring-background"
            aria-hidden="true"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 mt-2 w-[min(92vw,22rem)] rounded-2xl border border-white/10 bg-background/80 backdrop-blur-2xl shadow-2xl overflow-hidden",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-muted/20">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-semibold truncate">Actualizaciones y avisos</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {count > 0 && (
                <button
                  type="button"
                  onClick={onMarkAll}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-foreground/5 cursor-pointer transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar todo
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                className="grid place-items-center w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1.5">
            {count === 0 ? (
              <div className="px-3 py-8 text-center">
                <Check className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-sm text-muted-foreground">Todo al día. No hay avisos pendientes.</p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = kindIcon(n.kind);
                const accent = kindAccent(n.kind);
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-white/5 bg-card/40 hover:bg-card/60 transition-colors"
                  >
                    <span className={cn("grid place-items-center w-8 h-8 rounded-lg border shrink-0", accent.bg, accent.text)}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-tight">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{n.detail}</p>

                      <div className="flex items-center gap-2 mt-2">
                        {n.href && (
                          n.external ? (
                            <a
                              href={n.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => onMarkSeen(n.id)}
                              className={cn("inline-flex items-center gap-1 text-[11px] font-semibold hover:underline cursor-pointer", accent.text)}
                            >
                              Abrir <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <Link
                              href={n.href}
                              onClick={() => { onMarkSeen(n.id); setOpen(false); }}
                              className={cn("inline-flex items-center gap-1 text-[11px] font-semibold hover:underline cursor-pointer", accent.text)}
                            >
                              {n.kind === "update-app" ? "Ver cómo" : "Abrir"} <ArrowUpCircle className="w-3 h-3" />
                            </Link>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => onMarkSeen(n.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-lg hover:bg-foreground/5 cursor-pointer transition-colors"
                        >
                          <Check className="w-3 h-3" /> Marcar visto
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationsBell;
