'use client';

// ════════════════════════════════════════════════════════════════
// OSWindow — chrome reutilizable de ventana flotante del OS
// ----------------------------------------------------------------
// Ventana arrastrable por la cabecera, con acento StarSeed, backdrop,
// cierre por Escape, acciones de cabecera y opcional barra inferior.
// La usan AppWindow (launcher) y ContentWindow (abridor universal).
// Render: el llamador la porta a document.body (vía createPortal).
// SOP: architecture/dashboard-launcher-apps-y-archivos.md
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OSWindowProps {
    title: string;
    subtitle?: string;
    icon: LucideIcon;
    accent: string;
    onClose: () => void;
    /** Botones extra de cabecera (a la izquierda del cierre). */
    actions?: React.ReactNode;
    /** Barra inferior opcional (acciones universales del contenido). */
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    /** Anchura/altura del marco (clases Tailwind). */
    sizeClass?: string;
    /** El cuerpo no recibe padding (visores a sangre). Default: true. */
    bare?: boolean;
}

export function OSWindow({
    title, subtitle, icon: Icon, accent, onClose, actions, toolbar, children,
    sizeClass = "w-[min(94vw,1100px)] h-[min(86vh,760px)]", bare = true,
}: OSWindowProps) {
    const [offset, setOffset] = useState({ dx: 0, dy: 0 });
    const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const d = dragRef.current;
            if (!d) return;
            setOffset({ dx: d.ox + (e.clientX - d.x), dy: d.oy + (e.clientY - d.y) });
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, []);

    const startDrag = (e: React.PointerEvent) => {
        dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.dx, oy: offset.dy };
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            {/* Capa de arrastre centrada por el flex padre. El transform de arrastre va
                aquí (div plano), NO en el hijo animado → la animación de Framer ya no pisa
                el centrado y la ventana SIEMPRE abre centrada. */}
            <div className="relative max-w-full max-h-full" style={{ transform: `translate(${offset.dx}px, ${offset.dy}px)` }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 26 }}
                    className={cn(
                        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl",
                        sizeClass,
                    )}
                >
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] z-20 opacity-80"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

                <header
                    onPointerDown={startDrag}
                    className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border/40 cursor-grab active:cursor-grabbing select-none"
                >
                    <span className="grid place-items-center size-8 rounded-xl border border-white/15 shadow"
                        style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 40%, transparent))` }}>
                        <Icon className="size-4 text-white drop-shadow" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black tracking-tight truncate leading-tight">{title}</h3>
                        {subtitle && (
                            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 truncate font-semibold">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {actions}
                    <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar ventana"
                        className="grid place-items-center size-8 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer">
                        <X className="size-4" />
                    </button>
                </header>

                <div className={cn("relative flex-1 min-h-0 bg-black/20", !bare && "overflow-auto p-4")}>
                    {children}
                </div>

                {toolbar && (
                    <footer className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border/40 bg-card/60">
                        {toolbar}
                    </footer>
                )}
                </motion.div>
            </div>
        </div>
    );
}
