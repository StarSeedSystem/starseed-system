'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Exposé (vista de conjunto de ventanas)
// ----------------------------------------------------------------
// Muestra TODAS las ventanas del escritorio activo en una cuadrícula
// de tarjetas vivas (miniatura del chrome real: título, acento, icono)
// para elegir con un clic. Se activa desde el botón de la barra o con
// el atajo de teclado (ver desktop-canvas). Cierra con Escape, clic
// fuera o al elegir una ventana. Respeta prefers-reduced-motion.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, LayoutGrid, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopWindow } from "./desktop-store";
import { closeWindow, focusWindow, setWindowMinimized } from "./desktop-store";
import { resolveWindowChrome } from "./desktop-window-content";

export function DesktopExpose({
    desktopId, windows, topZ, open, onClose,
}: {
    desktopId: string;
    windows: DesktopWindow[];
    topZ: number;
    open: boolean;
    onClose: () => void;
}): React.ReactElement | null {
    const reduced = useReducedMotion();

    if (!open) return null;

    const select = (win: DesktopWindow) => {
        if (win.minimized) setWindowMinimized(desktopId, win.id, false);
        else focusWindow(desktopId, win.id);
        onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="expose"
                    role="dialog"
                    aria-label="Vista de conjunto de ventanas"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0.1 : 0.2 }}
                    onClick={onClose}
                    className="absolute inset-0 z-[80] flex flex-col bg-black/55 backdrop-blur-2xl"
                >
                    <header className="flex shrink-0 items-center gap-2 px-5 pt-5">
                        <LayoutGrid className="size-4 text-cyan-300" />
                        <h2 className="text-sm font-black tracking-tight text-foreground/90">
                            Vista de conjunto
                        </h2>
                        <span className="text-[11px] font-semibold text-muted-foreground/70">
                            {windows.length} ventana{windows.length === 1 ? "" : "s"}
                        </span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            title="Cerrar (Esc)"
                            aria-label="Cerrar vista de conjunto"
                            className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground/80 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                        >
                            <X className="size-4" />
                        </button>
                    </header>

                    {windows.length === 0 ? (
                        <div className="grid flex-1 place-items-center">
                            <p className="text-sm text-muted-foreground">No hay ventanas abiertas en este escritorio.</p>
                        </div>
                    ) : (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="grid flex-1 auto-rows-min grid-cols-2 gap-4 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4"
                        >
                            {windows.map((win) => {
                                const chrome = resolveWindowChrome(win.contentRef);
                                const active = !win.minimized && win.z === topZ;
                                return (
                                    <motion.button
                                        key={win.id}
                                        type="button"
                                        layout
                                        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
                                        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                                        onClick={() => select(win)}
                                        title={`Ir a ${chrome.title}`}
                                        className={cn(
                                            "group relative flex aspect-[4/3] flex-col overflow-hidden rounded-2xl border text-left shadow-xl transition-transform hover:-translate-y-1 cursor-pointer",
                                            active ? "border-cyan-300/60 ring-2 ring-cyan-300/40" : "border-white/12 hover:border-white/30",
                                            win.minimized && "opacity-60",
                                        )}
                                        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${chrome.accent} 18%, #0B1020), #0B1020 70%)` }}
                                    >
                                        {/* Cabecera falsa (mini chrome) */}
                                        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/[0.05] px-2.5 py-1.5">
                                            <span
                                                className="grid size-4 shrink-0 place-items-center overflow-hidden rounded-md border border-white/15"
                                                style={{ background: `linear-gradient(135deg, ${chrome.accent}, color-mix(in srgb, ${chrome.accent} 35%, transparent))` }}
                                            >
                                                {chrome.iconEl}
                                            </span>
                                            <span className="truncate text-[11px] font-bold text-foreground/90">{chrome.title}</span>
                                            {win.minimized && <Minus className="ml-auto size-3 shrink-0 text-muted-foreground" />}
                                        </div>
                                        {/* Cuerpo: identidad visual (acento + icono grande) — sin re-renderizar el widget real */}
                                        <div className="relative flex flex-1 items-center justify-center">
                                            <span
                                                aria-hidden
                                                className="absolute inset-0 opacity-40"
                                                style={{ background: `radial-gradient(circle at 50% 40%, ${chrome.accent}, transparent 70%)` }}
                                            />
                                            <span
                                                className="relative grid size-14 place-items-center overflow-hidden rounded-2xl border border-white/15 shadow-lg"
                                                style={{ background: `linear-gradient(135deg, ${chrome.accent}, color-mix(in srgb, ${chrome.accent} 30%, transparent))` }}
                                            >
                                                {chrome.iconEl}
                                            </span>
                                        </div>
                                        {/* Cerrar (hover) */}
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); closeWindow(desktopId, win.id); }}
                                            title={`Cerrar ${chrome.title}`}
                                            aria-label={`Cerrar ${chrome.title}`}
                                            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border border-white/20 bg-black/70 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/25 hover:text-red-200 group-hover:opacity-100 cursor-pointer"
                                        >
                                            <X className="size-3.5" strokeWidth={2.5} />
                                        </button>
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}

                    <p className="shrink-0 pb-4 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                        Clic para elegir · Esc para cerrar
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
