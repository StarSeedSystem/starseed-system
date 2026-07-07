'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Barra de tareas / Dock del escritorio
// ----------------------------------------------------------------
// Dock inferior estilo computadora con TODAS las ventanas abiertas
// (visibles y minimizadas) como pastillas: clic enfoca/restaura, con
// indicador de foco, punto de acento por entidad y botón de cierre al
// pasar el ratón. Táctil y ratón. Cristal líquido, aparición suave.
// Se oculta si no hay ventanas. Presentacional (recibe la lista).
// ════════════════════════════════════════════════════════════════

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopWindow } from "./desktop-store";
import {
    closeWindow, focusWindow, setWindowMinimized,
} from "./desktop-store";
import { resolveWindowChrome } from "./desktop-window-content";

export function DesktopTaskbar({
    desktopId, windows, topZ, isMobile,
}: {
    desktopId: string;
    windows: DesktopWindow[];
    /** z de la ventana enfocada (para marcar la activa). */
    topZ: number;
    isMobile: boolean;
}): React.ReactElement | null {
    const reduced = useReducedMotion();
    // En móvil ya existe el swap por chips; el dock sería redundante.
    if (isMobile || windows.length === 0) return null;

    // Orden estable por creación (z no sirve porque cambia al enfocar).
    const ordered = [...windows].sort((a, b) => a.id.localeCompare(b.id));

    const activate = (win: DesktopWindow) => {
        if (win.minimized) setWindowMinimized(desktopId, win.id, false);
        else focusWindow(desktopId, win.id);
    };

    return (
        <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[38] flex justify-center pb-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
            <AnimatePresence>
                <motion.div
                    key="dock"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                    transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 300, damping: 28 }}
                    className="pointer-events-auto flex max-w-[92vw] items-end gap-1.5 overflow-x-auto rounded-2xl border border-white/12 bg-black/45 p-1.5 shadow-2xl backdrop-blur-2xl"
                >
                    <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
                    {ordered.map((win) => {
                        const c = resolveWindowChrome(win.contentRef);
                        const active = !win.minimized && win.z === topZ;
                        return (
                            <div key={win.id} className="group relative flex flex-col items-center">
                                <button
                                    type="button"
                                    onClick={() => activate(win)}
                                    title={win.minimized ? `Restaurar ${c.title}` : c.title}
                                    className={cn(
                                        "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-all duration-200 cursor-pointer",
                                        active
                                            ? "border-white/25 bg-white/15 text-foreground shadow-[0_0_16px_rgba(255,255,255,0.12)]"
                                            : win.minimized
                                                ? "border-white/10 bg-white/[0.03] text-muted-foreground/80 hover:bg-white/[0.09] hover:text-foreground"
                                                : "border-white/12 bg-white/[0.06] text-foreground/85 hover:bg-white/[0.12]",
                                    )}
                                >
                                    <span
                                        className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-md border border-white/15"
                                        style={{ background: `linear-gradient(135deg, ${c.accent}, color-mix(in srgb, ${c.accent} 35%, transparent))` }}
                                    >
                                        {c.iconEl}
                                    </span>
                                    <span className="max-w-[110px] truncate">{c.title}</span>
                                    {win.minimized && <Minus className="size-3 shrink-0 opacity-70" />}
                                </button>
                                {/* Punto indicador de estado */}
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mt-0.5 h-1 rounded-full transition-all",
                                        active ? "w-4 bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]" : "w-1 bg-white/30",
                                    )}
                                />
                                {/* Cerrar (hover) */}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); closeWindow(desktopId, win.id); }}
                                    title={`Cerrar ${c.title}`}
                                    aria-label={`Cerrar ${c.title}`}
                                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-white/20 bg-black/80 text-muted-foreground opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100 cursor-pointer"
                                >
                                    <X className="size-2.5" strokeWidth={3} />
                                </button>
                            </div>
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
