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
// z-order al enfocar, mosaico (pantalla dividida), pantalla completa y
// animación líquida al abrir/minimizar (Framer Motion, respeta
// prefers-reduced-motion). En móvil ocupa casi toda la pantalla.
//
// ⚠️ REGLA DE ORO DE ESTE ARCHIVO (Adenda 68 · B-1 — causa raíz del bug
// del «difuminado»): el marco NUNCA puede llevar `filter` (ni animado ni
// estático) ni `backdrop-filter` en el MISMO elemento que contiene el
// contenido. Un `filter` no-`none`:
//   1. convierte el elemento en backdrop-root → destroza su propio
//      `backdrop-filter` (el cristal deja de funcionar), y
//   2. fuerza a TODO su subárbol (incluido el <iframe> de la app) a
//      pasar por una pasada de filtro → la ventana entera se ve borrosa
//      y apagada.
// Framer Motion, además, deja el `filter: blur(0px)` FIJO en el estilo
// inline al acabar la animación → el daño era permanente.
// Por eso: el cristal vive en una CAPA PROPIA (`WindowGlass`, hermana y
// por debajo del contenido) y la animación de apertura solo toca
// opacity/scale/y.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X, Minus, Maximize2, Minimize2, Expand, Shrink, Columns2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesktopWindow, DesktopWindowRect } from "./desktop-store";
import {
    closeWindow, focusWindow, setWindowMinimized, setWindowRect, toggleWindowMaximized,
    toggleWindowFullscreen,
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

/**
 * Cristal de la ventana (Crystal Liquid Glass) en una CAPA PROPIA.
 * Lleva el `backdrop-filter` y el fondo, y va DEBAJO del contenido
 * (`-z-10`, sin eventos) → el contenido (incluidos iframes, canvas y
 * vídeo) jamás es descendiente de un elemento con backdrop-filter, que
 * es lo que rompía el compositing y pintaba la ventana borrosa (B-1).
 */
function WindowGlass({ isTop }: { isTop: boolean }): React.ReactElement {
    return (
        <span
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-0 -z-10 rounded-2xl backdrop-blur-2xl",
                isTop ? "bg-card/90" : "bg-card/80",
            )}
        />
    );
}

export function DesktopWindowFrame({
    desktopId, win, chrome, isTop, isMobile, topInset, snapEnabled = true, onSnapPreview,
    tiledRect, headerExtra, children,
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
    /** Rect impuesto por el MOSAICO (B-3). Si viene, la ventana no se mueve a mano. */
    tiledRect?: DesktopWindowRect | null;
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
                    // B-1: nunca por encima del inset → jamás bajo la barra superior.
                    y: Math.min(Math.max(d.orig.y + dy, topInset), vh - 70),
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
                    nh = Math.min(Math.max(rawH, MIN_H), d.orig.y + d.orig.h - topInset);
                    ny = Math.max(topInset, d.orig.y + (d.orig.h - nh));
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

    // El mosaico y la pantalla completa mandan sobre el rect libre.
    const tiled = Boolean(tiledRect);
    const locked = isMobile || win.maximized || win.fullscreen || tiled;

    const beginMove = (e: React.PointerEvent) => {
        if (locked) return;
        if ((e.target as HTMLElement).closest("button, a, input")) return;
        e.preventDefault();
        dragRef.current = { mode: "move", startX: e.clientX, startY: e.clientY, orig: { x: win.x, y: win.y, w: win.w, h: win.h } };
        setDragging(true);
    };

    const beginResize = (e: React.PointerEvent, handle: ResizeHandle) => {
        if (locked) return;
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { mode: "resize", handle, startX: e.clientX, startY: e.clientY, orig: { x: win.x, y: win.y, w: win.w, h: win.h } };
        setDragging(true);
    };

    const focus = () => {
        if (!isTop) focusWindow(desktopId, win.id);
    };

    const rect = live ?? tiledRect ?? { x: win.x, y: win.y, w: win.w, h: win.h };
    const zIndex = 20 + win.z;

    // Pantalla completa: la ventana se saca de la capa del lienzo (el LIENZO la
    // renderiza en su propia capa por encima de la barra superior y del dock).
    const frameStyle: React.CSSProperties = win.fullscreen
        ? { inset: 0, zIndex: 1 }
        : isMobile
            ? { left: 8, right: 8, top: topInset + 4, bottom: 92, zIndex }
            : win.maximized
                ? { left: 8, top: topInset + 4, width: "calc(100% - 16px)", height: `calc(100% - ${topInset + 16}px)`, zIndex }
                : { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex };

    return (
        <motion.div
            // ⚠️ NADA de `filter` aquí (ver cabecera del archivo): solo
            // opacity/scale/y. Framer Motion dejaba `filter: blur(0px)` fijo y
            // eso rompía el cristal y volvía borroso todo el subárbol.
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 18 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 32 }}
            transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 320, damping: 32, mass: 0.85 }}
            onPointerDownCapture={focus}
            style={frameStyle}
            className={cn(
                "absolute flex flex-col overflow-hidden border shadow-2xl",
                win.fullscreen ? "rounded-none" : "rounded-2xl",
                !dragging && "transition-[left,top,width,height] duration-300 ease-[cubic-bezier(0.22,0.9,0.3,1)]",
                dragging && "transition-none",
                // Sin `opacity` ni `saturate` en el marco: ambas crean stacking
                // context / filtro y reintroducirían el bug. La jerarquía visual
                // se transmite solo con borde y sombra.
                isTop ? "border-white/20" : "border-white/[0.08]",
            )}
        >
            {/* Cristal en capa propia (backdrop-filter aislado del contenido). */}
            <WindowGlass isTop={isTop} />
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
                onDoubleClick={() => !isMobile && !tiled && toggleWindowMaximized(desktopId, win.id)}
                className={cn(
                    "relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.04] px-2.5 select-none",
                    !locked && "cursor-grab active:cursor-grabbing",
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
                        disabled={isMobile || tiled || win.fullscreen}
                    >
                        {win.maximized ? (
                            <Minimize2 className="size-2 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                        ) : (
                            <Maximize2 className="size-2 text-black/60 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                        )}
                    </button>
                </div>

                {/* Indicador de mosaico (la ventana la coloca la rejilla) */}
                {tiled && (
                    <span
                        title="En mosaico — arrastra los divisores para repartir el espacio"
                        className="grid size-5 shrink-0 place-items-center rounded-md border border-white/12 text-cyan-200/80"
                    >
                        <Columns2 className="size-3" />
                    </span>
                )}

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

                {/* Pantalla completa (B-3) — cubre barra superior y dock. */}
                <button
                    type="button"
                    onClick={() => toggleWindowFullscreen(desktopId, win.id)}
                    title={win.fullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
                    aria-label={win.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                    className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer"
                >
                    {win.fullscreen ? <Shrink className="size-3" /> : <Expand className="size-3" />}
                </button>
            </header>

            {/* ── Cuerpo ── */}
            <div className="relative z-0 min-h-0 flex-1 bg-black/25">
                {children}
            </div>

            {/* ── Asas de redimensión (los 4 bordes + las 4 esquinas) ── */}
            {!locked && <ResizeEdges onBegin={beginResize} />}
        </motion.div>
    );
}
