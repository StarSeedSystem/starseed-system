"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — HOST DE VENTANAS EMERGENTES DE APPS (Adenda 69 · J-1)
 * ---------------------------------------------------------------------------
 * Overlay portátil, global y sin dependencias del gestor de ventanas del
 * escritorio. Escucha `starseed:app-popup` y pinta popups/mini-ventanas:
 *   · APILABLES (varias a la vez, en cascada, z-order por foco),
 *   · MOVIBLES (arrastrar por la cabecera),
 *   · CERRABLES (botón × · tecla Esc cierra la de arriba),
 *   · NO INTRUSIVAS (sin fondo que bloquee la pantalla).
 *
 * Contenido: `route` (iframe mismo origen) · `html` (iframe sandbox aislado) ·
 * `text` (párrafo). Ver src/lib/notifications/app-popups.ts. SSR-safe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import { createPortal } from "react-dom";
import * as Lucide from "lucide-react";
import { X, GripHorizontal, Package as PackageIcon } from "lucide-react";
import { APP_POPUP_EVENT, type AppPopup, type AppPopupSize } from "@/lib/notifications/app-popups";

interface LivePopup extends AppPopup {
  x: number;
  y: number;
  z: number;
}

const SIZES: Record<AppPopupSize, { w: number; h: number }> = {
  sm: { w: 360, h: 320 },
  md: { w: 480, h: 440 },
  lg: { w: 680, h: 560 },
};

function iconFor(name: string): React.ComponentType<{ className?: string }> {
  const dict = Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return dict[name] ?? PackageIcon;
}

let zCounter = 1000;

export function AppPopupHost() {
  const [mounted, setMounted] = React.useState(false);
  const [popups, setPopups] = React.useState<LivePopup[]>([]);
  const drag = React.useRef<{ id: string; dx: number; dy: number } | null>(null);

  React.useEffect(() => setMounted(true), []);

  const focus = React.useCallback((id: string) => {
    setPopups((list) => list.map((p) => (p.id === id ? { ...p, z: ++zCounter } : p)));
  }, []);

  const close = React.useCallback((id: string) => {
    setPopups((list) => list.filter((p) => p.id !== id));
  }, []);

  // Alta/baja de popups desde el evento del DOM.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string; popup?: AppPopup; id?: string; appId?: string } | undefined;
      if (!detail) return;
      if (detail.action === "open" && detail.popup) {
        const p = detail.popup;
        setPopups((list) => {
          const size = SIZES[p.size] || SIZES.md;
          const idx = list.length;
          const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
          const vh = typeof window !== "undefined" ? window.innerHeight : 800;
          const baseX = Math.max(16, Math.min(vw - size.w - 16, vw / 2 - size.w / 2 + idx * 28));
          const baseY = Math.max(60, Math.min(vh - size.h - 16, vh / 2 - size.h / 2 + idx * 28));
          return [...list, { ...p, x: baseX, y: baseY, z: ++zCounter }];
        });
      } else if (detail.action === "close") {
        setPopups((list) =>
          list.filter((p) => {
            if (detail.id) return p.id !== detail.id;
            if (detail.appId) return p.appId !== detail.appId;
            return true;
          }),
        );
      }
    };
    window.addEventListener(APP_POPUP_EVENT, onEvt as EventListener);
    return () => window.removeEventListener(APP_POPUP_EVENT, onEvt as EventListener);
  }, []);

  // Esc cierra la de arriba.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || popups.length === 0) return;
      const top = popups.reduce((a, b) => (a.z > b.z ? a : b));
      close(top.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popups, close]);

  // Arrastre por la cabecera.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setPopups((list) => list.map((p) => (p.id === d.id ? { ...p, x: e.clientX - d.dx, y: e.clientY - d.dy } : p)));
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (e: React.PointerEvent, p: LivePopup) => {
    drag.current = { id: p.id, dx: e.clientX - p.x, dy: e.clientY - p.y };
    focus(p.id);
  };

  if (!mounted || popups.length === 0) return null;

  return createPortal(
    <>
      {popups.map((p) => {
        const size = SIZES[p.size] || SIZES.md;
        const Icon = iconFor(p.icon || "Package");
        return (
          <div
            key={p.id}
            role="dialog"
            aria-label={p.title}
            onPointerDown={() => focus(p.id)}
            className="fixed rounded-2xl border border-white/10 bg-[#0b0713]/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
            style={{ left: p.x, top: p.y, width: size.w, height: size.h, zIndex: p.z }}
          >
            {/* Cabecera arrastrable */}
            <div
              onPointerDown={(e) => startDrag(e, p)}
              className="flex items-center gap-2 px-3 h-10 shrink-0 border-b border-white/10 bg-white/[0.04] cursor-grab active:cursor-grabbing select-none"
            >
              <span className="h-6 w-6 rounded-lg grid place-items-center border border-[#007FFF]/25 bg-[#007FFF]/10 text-[#3aa0ff] shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-white/90 truncate leading-tight">{p.title}</p>
                <p className="text-[9px] text-white/40 truncate leading-tight">{p.appName}</p>
              </div>
              <GripHorizontal className="w-3.5 h-3.5 text-white/25 shrink-0" />
              <button
                onClick={() => close(p.id)}
                className="h-6 w-6 rounded-lg grid place-items-center text-white/50 hover:text-white hover:bg-white/10 shrink-0 cursor-pointer transition-colors"
                title="Cerrar"
                aria-label="Cerrar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Contenido */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {p.route ? (
                <iframe
                  src={p.route}
                  title={p.title}
                  data-app-id={p.appId}
                  className="w-full h-full border-0 bg-white/[0.02]"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              ) : p.html ? (
                <iframe
                  srcDoc={p.html}
                  title={p.title}
                  className="w-full h-full border-0 bg-white"
                  // Aislado: allow-scripts SIN allow-same-origin ⇒ no accede al padre.
                  sandbox="allow-scripts"
                />
              ) : (
                <div className="w-full h-full overflow-auto p-4 text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                  {p.text}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>,
    document.body,
  );
}

export default AppPopupHost;
