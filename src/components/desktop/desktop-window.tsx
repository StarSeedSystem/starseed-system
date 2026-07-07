'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — DesktopWindowFrame (chrome de ventana del escritorio)
// ----------------------------------------------------------------
// El OSWindow existente es MODAL (backdrop que cierra, una a la vez,
// sin min/max/resize ni z-order), así que el escritorio usa su propio
// chrome multiventana: barra de título con semáforo Trinity (cerrar
// carmesí · minimizar ámbar · maximizar lima), arrastre por cabecera,
// redimensión por los 8 bordes/esquinas, snap a mitades/cuartos con
// vista previa translúcida al arrastrar contra los bordes de pantalla,
// z-order al enfocar y animación líquida al abrir/minimizar (Framer
// Motion, respeta prefers-reduced-motion). En móvil la ventana ocupa
// casi toda la pantalla (swap por chips).
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopWindow, DesktopWindowRect } from "./desktop-store";
import {
    closeWindow, focusWindow, setWindowMinimized, setWindowRect, toggleWindowMaximized,
} from "./desktop-store";
import { resolveSnapZone, snapZoneRect, type SnapZone } from "./desktop-window-snap";

export interface WindowChrome {
    title: string;
    subtitle?: string;
    accent: string;
    iconEl: React.ReactNode;
    /** Enlace externo asociado (botón "abrir en pestaña"). */
    href?: string;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface DragState {
    mode: "move" | "resize";
    handle?: ResizeHandle;
    startX: number;
    startY: number;
    orig: DesktopWindowRect;
}

const MIN_W = 300;
const MIN_H = 220;

// ── Asas de redimensión (bordes + esquinas) ──────────────────────
const EDGE_PX = 6;
const CORNER_PX = 14;

const RESIZE_CURSOR: Record<ResizeHandle, string> = {
    n: "cursor-ns-resize", s: "cursor-ns-resize",
    e: "cursor-ew-resize", w: "cursor-ew-resize",
    ne: "cursor-nesw-resize", sw: "cursor-nesw-resize",
    nw: "cursor-nwse-resize", se: "cursor-nwse-resize",
};

function ResizeEdges({ onBegin }: { onBegin: (e: React.PointerEvent, handle: ResizeHandle) => void }): React.ReactElement {
    return (
        <>
            {/* Bordes rectos */}
            <div onPointerDown={(e) => onBegin(e, "n")} className={cn("absolute inset-x-2 top-0 z-30", RESIZE_CURSOR.n)} style={{ height: EDGE_PX }} />
            <div onPointerDown={(e) => onBegin(e, "s")} className={cn("absolute inset-x-2 bottom-0 z-30", RESIZE_CURSOR.s)} style={{ height: EDGE_PX }} />
            <div onPointerDown={(e) => onBegin(e, "w")} className={cn("absolute inset-y-2 left-0 z-30", RESIZE_CURSOR.w)} style={{ width: EDGE_PX }} />
            <div onPointerDown={(e) => onBegin(e, "e")} className={cn("absolute inset-y-2 right-0 z-30", RESIZE_CURSOR.e)} style={{ width: EDGE_PX }} />
            {/* Esquinas (encima de los bordes rectos) */}
            <div onPointerDown={(e) => onBegin(e, "nw")} className={cn("absolute left-0 top-0 z-30", RESIZE_CURSOR.nw)} style={{ width: CORNER_PX, height: CORNER_PX }} />
            <div onPointerDown={(e) => onBegin(e, "ne")} className={cn("absolute right-0 top-0 z-30", RESIZE_CURSOR.ne)} style={{ width: CORNER_PX, height: CORNER_PX }} />
            <div onPointerDown={(e) => onBegin(e, "sw")} className={cn("absolute left-0 bottom-0 z-30", RESIZE_CURSOR.sw)} style={{ width: CORNER_PX, height: CORNER_PX }} />
            <div onPointerDown={(e) => onBegin(e, "se")} className={cn("absolute right-0 bottom-0 z-30", RESIZE_CURSOR.se)} style={{ width: CORNER_PX, height: CORNER_PX }}>
                <span aria-hidden className="pointer-events-none absolute bottom-[5px] right-[5px] h-px w-2.5 rotate-[-45deg] bg-white/35" />
                <span aria-hidden className="pointer-events-none absolute bottom-[8px] right-[3px] h-px w-1.5 rotate-[-45deg] bg-white/25" />
            </div>
        </>
    );
}

export function DesktopWindowFrame({
    desktopId, win, chrome, isTop, isMobile, topInset, snapEnabled = true, onSnapPreview, headerExtra, children,
}: {
    desktopId: string;
    win: DesktopWindow;
    chrome: WindowChrome;
    isTop: boolean;
    isMobile: boolean;
    /** Altura reservada a la barra superior del escritorio (px). */
    topInset: number;
    /** Si false, el arrastre por cabecera nunca sugiere/aplica snap. */
    snapEnabled?: boolean;
    /** Notifica al lienzo la zona de snap activa (pinta el preview global). */
    onSnapPreview?: (zone: SnapZone | null) => void;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
}): React.ReactElement {
    const reduced = useReducedMotion();
    const dragRef = useRef<DragState | null>(null);
    const liveRef = useRef<DesktopWindowRect | null>(null);
    const [live, setLive] = useState<DesktopWindowRect | null>(null);
    const [dragging, setDragging] = useState(false);
    const pendingSnapRef = useRef<SnapZone | null>(null);

    // ── Arrastre / redimensión con pointer events globales ──
    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: PointerEvent) => {
            const d = dragRef.current;
            if (!d) return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            let next: DesktopWindowRect;
            if (d.mode === "move") {
                next = {
                    ...d.orig,
                    x: Math.min(Math.max(d.orig.x + dx, -(d.orig.w - 140)), vw - 90),
                    y: Math.min(Math.max(d.orig.y + dy, topInset - 6), vh - 70),
                };
                if (snapEnabled) {
                    const zone = resolveSnapZone(e.clientX, e.clientY, vw, vh, topInset);
                    if (zone !== pendingSnapRef.current) {
                        pendingSnapRef.current = zone;
                        onSnapPreview?.(zone);
                    }
                }
            } else {
                const h = d.handle ?? "se";
                let nx = d.orig.x;
                let ny = d.orig.y;
                let nw = d.orig.w;
                let nh = d.orig.h;
                if (h.includes("e")) nw = Math.min(Math.max(d.orig.w + dx, MIN_W), vw - d.orig.x - 4);
                if (h.includes("s")) nh = Math.min(Math.max(d.orig.h + dy, MIN_H), vh - d.orig.y - 4);
                if (h.includes("w")) {
                    const rawW = d.orig.w - dx;
                    nw = Math.min(Math.max(rawW, MIN_W), d.orig.x + d.orig.w + 4);
                    nx = d.orig.x + (d.orig.w - nw);
                }
                if (h.includes("n")) {
                    const rawH = d.orig.h - dy;
                    nh = Math.min(Math.max(rawH, MIN_H), d.orig.y + d.orig.h - topInset + 4);
                    ny = Math.max(topInset - 6, d.orig.y + (d.orig.h - nh));
                }
                next = { x: nx, y: ny, w: nw, h: nh };
            }
            liveRef.current = next;
            setLive(next);
        };
        const onUp = () => {
            const commit = liveRef.current;
            const d = dragRef.current;
            const snapZone = pendingSnapRef.current;
            dragRef.current = null;
            liveRef.current = null;
            pendingSnapRef.current = null;
            setDragging(false);
            setLive(null);
            onSnapPreview?.(null);
            if (d?.mode === "move" && snapEnabled && snapZone) {
                setWindowRect(desktopId, win.id, snapZoneRect(snapZone, window.innerWidth, window.innerHeight, topInset));
                return;
            }
            if (commit) setWindowRect(desktopId, win.id, commit);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [dragging, desktopId, win.id, topInset, snapEnabled, onSnapPreview]);

    const beginMove = (e: React.PointerEvent) => {
        if (isMobile || win.maximized) return;
        if ((e.target as HTMLElement).closest("button, a, input")) return;
        e.preventDefault();
        dragRef.current = { mode: "move", startX: e.clientX, startY: e.clientY, orig: { x: win.x, y: win.y, w: win.w, h: win.h } };
        setDragging(true);
    };

    const beginResize = (e: React.PointerEvent, handle: ResizeHandle) => {
        if (isMobile || win.maximized) return;
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode: "resize", handle, startX: e.clientX, startY: e.clientY, orig: { x: win.x, y: win.y, w: win.w, h: win.h } };
        setDragging(true);
    };

    const focus = () => {
        if (!isTop) focusWindow(desktopId, win.id);
    };

    const rect = live ?? { x: win.x, y: win.y, w: win.w, h: win.h };
    const zIndex = 20 + win.z;

    const frameStyle: React.CSSProperties = isMobile
        ? { left: 8, right: 8, top: topInset + 4, bottom: 92, zIndex }
        : win.maximized
            ? { left: 8, top: topInset + 4, width: "calc(100% - 16px)", height: `calc(100% - ${topInset + 16}px)`, zIndex }
            : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex };

    return (
        <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 26, filter: "blur(8px)" }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.86, y: 48, filter: "blur(10px)" }}
            transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 300, damping: 30, mass: 0.9 }}
            onPointerDownCapture={focus}
            style={frameStyle}
            className={cn(
                "absolute flex flex-col overflow-hidden rounded-2xl border shadow-2xl",
                "bg-card/90 backdrop-blur-2xl",
                !dragging && "transition-[left,top,width,height] duration-300 ease-[cubic-bezier(0.22,0.9,0.3,1)]",
                dragging && "transition-none",
                isTop
                    ? "border-white/20"
                    : "border-white/10 opacity-[0.97] saturate-[0.92]",
            )}
        >
            {/* Hairline de acento (identidad de la entidad de la ventana) */}
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px]"
                style={{
                    background: `linear-gradient(90deg, transparent, ${chrome.accent}, transparent)`,
                    opacity: isTop ? 0.9 : 0.45,
                }}
            />
            {/* Halo sutil al enfocar */}
            {isTop && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-px rounded-2xl"
                    style={{ boxShadow: `0 0 26px -8px color-mix(in srgb, ${chrome.accent} 65%, transparent)` }}
                />
            )}

            {/* ── Barra de título ── */}
            <header
                onPointerDown={beginMove}
                onDoubleClick={() => !isMobile && toggleWindowMaximized(desktopId, win.id)}
                className={cn(
                    "relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.04] px-2.5 select-none",
                    !isMobile && !win.maximized && "cursor-grab active:cursor-grabbing",
                )}
            >
                {/* Semáforo Trinity: cerrar · minimizar · maximizar */}
                <div className="group flex items-center gap-1.5 pr-1">
                    <button
                        type="button"
                        onClick={() => closeWindow(desktopId, win.id)}
                        title="Cerrar"
                        aria-label="Cerrar ventana"
                        className="grid size-3.5 place-items-center rounded-full border border-black/30 bg-[#DC143C] transition-transform hover:scale-110 cursor-pointer"
                    >
                        <X className="size-2.5 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setWindowMinimized(desktopId, win.id, true)}
                        title="Minimizar"
                        aria-label="Minimizar ventana"
                        className="grid size-3.5 place-items-center rounded-full border border-black/30 bg-[#FFBF00] transition-transform hover:scale-110 cursor-pointer"
                    >
                        <Minus className="size-2.5 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                    </button>
                    <button
                        type="button"
                        onClick={() => toggleWindowMaximized(desktopId, win.id)}
                        title={win.maximized ? "Restaurar" : "Maximizar"}
                        aria-label={win.maximized ? "Restaurar ventana" : "Maximizar ventana"}
                        className="grid size-3.5 place-items-center rounded-full border border-black/30 bg-[#39FF14] transition-transform hover:scale-110 cursor-pointer disabled:opacity-40"
                        disabled={isMobile}
                    >
                        {win.maximized ? (
                            <Minimize2 className="size-2 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                        ) : (
                            <Maximize2 className="size-2 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                        )}
                    </button>
                </div>

                <span
                    className="grid size-5.5 shrink-0 place-items-center overflow-hidden rounded-md border border-white/15"
                    style={{ background: `linear-gradient(135deg, ${chrome.accent}, color-mix(in srgb, ${chrome.accent} 35%, transparent))`, width: 22, height: 22 }}
                >
                    {chrome.iconEl}
                </span>
                <div className="min-w-0 flex-1 leading-none">
                    <h3 className="truncate text-[12px] font-black tracking-tight text-foreground">{chrome.title}</h3>
                    {chrome.subtitle && (
                        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                            {chrome.subtitle}
                        </p>
                    )}
                </div>
                {headerExtra}
            </header>

            {/* ── Cuerpo ── */}
            <div className="relative z-0 min-h-0 flex-1 bg-black/25">
                {children}
            </div>

            {/* ── Asas de redimensión (los 4 bordes + las 4 esquinas) ── */}
            {!isMobile && !win.maximized && <ResizeEdges onBegin={beginResize} />}
        </motion.div>
    );
}
