"use client";

/*
 * TrinityFab — botón flotante de acceso a los 4 menús cardinales Trinity
 * (Zenith=guía IA, Horizon=lienzo de creación, Logic=centro de control,
 * Anchor=OmniDock) para pantallas táctiles, donde los gestos de borde del
 * sistema (atrás, control center…) impiden usar los sensores de perímetro.
 *
 * - NO duplica lógica: cada pétalo hace toggle con el MISMO
 *   `usePerimeter().setActiveEdge` que usan los sensores de borde y atajos.
 * - Visibilidad: localStorage 'os.trinity.fab' = 'auto' | 'on' | 'off'
 *   (auto = puntero grueso o viewport ≤1024px). En desktop fino no se renderiza.
 * - Draggable: se ancla al borde izquierdo/derecho más cercano; posición
 *   persistida en 'os.trinity.fab.pos'.
 *
 * SOP: architecture/integracion-portal-starseed-os.md · "Trinity Móvil · Bloque 2".
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePerimeter, PerimeterEdge } from "@/context/perimeter-context";
import { Sparkles, Layout, Settings2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./trinity-fab.module.css";

export type TrinityFabPref = "auto" | "on" | "off";

export const TRINITY_FAB_PREF_KEY = "os.trinity.fab";
export const TRINITY_FAB_POS_KEY = "os.trinity.fab.pos";
export const TRINITY_FAB_PREF_EVENT = "starseed:trinity-fab-pref";

export function readTrinityFabPref(): TrinityFabPref {
    if (typeof window === "undefined") return "auto";
    try {
        const v = window.localStorage.getItem(TRINITY_FAB_PREF_KEY);
        return v === "on" || v === "off" ? v : "auto";
    } catch {
        return "auto";
    }
}

/** Persiste la preferencia y avisa a los TrinityFab montados (mismo tab). */
export function writeTrinityFabPref(value: TrinityFabPref) {
    try { window.localStorage.setItem(TRINITY_FAB_PREF_KEY, value); } catch { }
    window.dispatchEvent(new CustomEvent(TRINITY_FAB_PREF_EVENT, { detail: value }));
}

/** ¿Aplica el modo auto en este dispositivo/viewport? */
export function trinityFabAutoEligible(): boolean {
    if (typeof window === "undefined") return false;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    return coarse || window.innerWidth <= 1024;
}

/**
 * Flag global informativo: el Orbe de Aurora (aurora-widget) es el ACCESO
 * TRINITY UNIVERSAL — vive en el layout RAÍZ y existe en TODAS las rutas
 * (mantener pulsado el orbe abre el menú Trinity centrado). Por eso este FAB
 * clásico CEDE SIEMPRE por defecto y solo se renderiza si el usuario lo fuerza
 * expresamente a "on" en Ajustes. El flag/evento se conservan para cualquier
 * superficie que quiera saber si el orbe está montado.
 */
export const AURORA_TRINITY_FLAG = "__STARSEED_AURORA_TRINITY_MOUNTED__";
export const AURORA_TRINITY_EVENT = "starseed:aurora-trinity-mounted";

interface FabPosition {
    side: "left" | "right";
    bottom: number; // px sobre el safe-area
}

const DEFAULT_POS: FabPosition = { side: "right", bottom: 112 };
const FAB_SIZE = 56;
const TAP_SLOP_PX = 10;

function readPos(): FabPosition {
    try {
        const raw = window.localStorage.getItem(TRINITY_FAB_POS_KEY);
        if (!raw) return DEFAULT_POS;
        const p = JSON.parse(raw);
        if ((p.side === "left" || p.side === "right") && typeof p.bottom === "number") {
            return { side: p.side, bottom: p.bottom };
        }
    } catch { }
    return DEFAULT_POS;
}

const NODES: Array<{
    edge: Exclude<PerimeterEdge, null>;
    label: string;
    color: string;
    Icon: React.ComponentType<{ className?: string }>;
    petalClass: "petalN" | "petalE" | "petalS" | "petalW";
}> = [
        { edge: "zenith", label: "Zenith · Guía IA y explorador", color: "#007FFF", Icon: Sparkles, petalClass: "petalN" },
        { edge: "logic", label: "Logic · Centro de control", color: "#FFBF00", Icon: Settings2, petalClass: "petalE" },
        { edge: "anchor", label: "Anchor · Dock Trinity", color: "#DC143C", Icon: LayoutGrid, petalClass: "petalS" },
        { edge: "horizon", label: "Horizon · Lienzo de creación", color: "#39FF14", Icon: Layout, petalClass: "petalW" },
    ];

/** Según el ángulo del dedo respecto al centro del orbe, devuelve el pétalo
 * cardinal más cercano (selección radial por pulsación larga). En coordenadas
 * de pantalla atan2: 0°=Este · 90°=Sur · 180°=Oeste · 270°(-90°)=Norte.
 *   Este→logic · Sur→anchor · Oeste→horizon · Norte→zenith. Son los cuadrantes
 * exactos del `conic-gradient` del núcleo y de los `--tx/--ty` de los pétalos. */
function nearestPetal(angleDeg: number): Exclude<PerimeterEdge, null> {
    const a = ((angleDeg % 360) + 360) % 360;
    if (a <= 45 || a > 315) return "logic";    // Este (logic)
    if (a <= 135) return "anchor";             // Sur (anchor)
    if (a <= 225) return "horizon";            // Oeste (horizon)
    return "zenith";                            // Norte (zenith)
}

export function TrinityFab() {
    const { activeEdge, setActiveEdge } = usePerimeter();

    const [mounted, setMounted] = useState(false);
    const [pref, setPref] = useState<TrinityFabPref>("auto");
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<FabPosition>(DEFAULT_POS);
    const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const coreRef = useRef<HTMLButtonElement | null>(null);
    const activeRef = useRef(activeEdge);
    useEffect(() => { activeRef.current = activeEdge; }, [activeEdge]);
    const gestureRef = useRef<{
        pointerId: number;
        startX: number;
        startY: number;
        moved: boolean;
        fromCore: boolean;
        held: boolean;       // superó la pulsación larga → modo selección radial
        hoverPetal: Exclude<PerimeterEdge, null> | null;
    } | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const [selecting, setSelecting] = useState(false);
    const [hoverPetal, setHoverPetal] = useState<Exclude<PerimeterEdge, null> | null>(null);
    // Evita el doble disparo tras la selección radial: al soltar sobre un pétalo,
    // `finish` ya abre el menú. Este flag suprime el `click` del pétalo que le
    // seguiría y lo cerraría solo.
    const justSelectedRef = useRef(false);

    // ── visibilidad (solo preferencia explícita, reactiva) ──────────
    useEffect(() => {
        setMounted(true);
        setPref(readTrinityFabPref());
        setPos(readPos());

        const onPref = (e: Event) => {
            const d = (e as CustomEvent).detail;
            setPref(d === "on" || d === "off" ? d : "auto");
        };
        const onStorage = (e: StorageEvent) => {
            if (e.key === TRINITY_FAB_PREF_KEY) setPref(readTrinityFabPref());
        };

        window.addEventListener(TRINITY_FAB_PREF_EVENT, onPref);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(TRINITY_FAB_PREF_EVENT, onPref);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    // ── drag + selección radial por pulsación larga ─────────────────
    // El orbe soporta DOS gestos en el núcleo:
    //   · TAP corto (sin mover, liberar rápido) → abre/cierra los pétalos.
    //   · MANTENER PULSADO (~260 ms) → entra en modo selección radial:
    //     los pétalos se abren y el dedo puede DESLIZAR por el ángulo hasta
    //     la opción que quiera (resaltada en vivo); al soltar se abre ese
    //     menú. En móvil (iOS/Android) esto reemplaza la selección de texto
    //     nativa del long-press.
    const LONG_PRESS_MS = 260;

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        if (gestureRef.current) return;
        const target = e.target as HTMLElement;
        const el = rootRef.current;
        const core = coreRef.current;
        gestureRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
            fromCore: !target.closest(`.${styles.petal}`),
            held: false,
            hoverPetal: null,
        };

        // Pulsación larga SÓLO si empieza en el núcleo (no en un pétalo).
        if (core && el && !target.closest(`.${styles.petal}`)) {
            if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
            longPressTimer.current = window.setTimeout(() => {
                const g = gestureRef.current;
                if (!g || g.moved) return;
                // entrada en modo selección radial: abrimos pétalos y seguimos al dedo
                gestureRef.current = { ...g, held: true };
                setOpen(true);
                setSelecting(true);
                // primer hover según la posición inicial del dedo sobre el anillo
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const ang = (Math.round((Math.atan2(g.startY - cy, g.startX - cx) * 180) / Math.PI) + 360) % 360;
                const petal = nearestPetal(ang);
                gestureRef.current = { ...gestureRef.current, hoverPetal: petal };
                setHoverPetal(petal);
            }, LONG_PRESS_MS);
        }

        const onMove = (ev: PointerEvent) => {
            const g = gestureRef.current;
            if (!g || ev.pointerId !== g.pointerId) return;
            const dx = ev.clientX - g.startX;
            const dy = ev.clientY - g.startY;
            if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) {
                g.moved = true;
                // si aún no había entrado el long-press, cancelamos el timer (es un drag)
                if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
            }
            if (g.moved && !g.held) {
                setDragOffset({ dx, dy });
                return;
            }
            // Modo selección radial: el dedo marca el pétalo por ángulo.
            if (g.held && el) {
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const ang = (Math.round((Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI) + 360) % 360;
                const petal = nearestPetal(ang);
                if (petal !== g.hoverPetal) {
                    g.hoverPetal = petal;
                    setHoverPetal(petal);
                }
            }
        };

        const finish = (ev: PointerEvent) => {
            const g = gestureRef.current;
            if (!g || ev.pointerId !== g.pointerId) return;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
            gestureRef.current = null;

            if (g.held) {
                // Pulsación larga → abrimos el pétalo sobre el que estaba el dedo.
                setSelecting(false);
                setHoverPetal(null);
                if (g.hoverPetal) {
                    // El `click` del pétalo que viene detrás NO debe re-hacer el
                    // toggle (lo cerraría). Se suprime con un flag transitorio.
                    justSelectedRef.current = true;
                    setActiveEdge(activeRef.current === g.hoverPetal ? null : g.hoverPetal);
                    setOpen(false);
                    window.setTimeout(() => { justSelectedRef.current = false; }, 120);
                }
                // si soltó sobre el núcleo sin tocar ningún pétalo, mantenemos la flor abierta
                return;
            }
            if (g.moved) {
                // ancla al borde más cercano y persiste
                setDragOffset(null);
                setPos(prev => {
                    const side: FabPosition["side"] =
                        ev.clientX < window.innerWidth / 2 ? "left" : "right";
                    const dy = ev.clientY - g.startY;
                    const bottom = Math.min(
                        Math.max(prev.bottom - dy, 84),
                        Math.max(window.innerHeight - 220, 160)
                    );
                    const next = { side, bottom: Math.round(bottom) };
                    try { window.localStorage.setItem(TRINITY_FAB_POS_KEY, JSON.stringify(next)); } catch { }
                    return next;
                });
            } else if (g.fromCore && ev.type === "pointerup") {
                // tap en el núcleo → abre/cierra los pétalos
                setOpen(o => !o);
            }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
    }, []);

    // ── toggle de cada nodo: MISMA API que sensores de borde/atajos ─
    const toggleEdge = useCallback((edge: Exclude<PerimeterEdge, null>) => {
        // Tras una selección radial recién aceptada, el click del pétalo es un
        // eco del pointerup que YA abrió el menú: no debe volver a hacer toggle.
        if (justSelectedRef.current) return;
        setActiveEdge(activeEdge === edge ? null : edge);
        setOpen(false);
    }, [activeEdge, setActiveEdge]);

    // El Orbe de Aurora es el acceso Trinity UNIVERSAL (todas las rutas): este
    // FAB CEDE SIEMPRE por defecto ("auto" y "off" no se renderizan) y solo
    // aparece si el usuario lo fuerza expresamente a "on" en Ajustes.
    const visible = mounted && pref === "on";
    if (!visible) return null;

    // Al abrir la flor anclada a un borde, desplaza el núcleo hacia el centro
    // para que el pétalo lateral (E/O) no caiga fuera del viewport.
    const openShift = open ? (pos.side === "right" ? -64 : 64) : 0;
    const transform = dragOffset
        ? `translate3d(${dragOffset.dx}px, ${dragOffset.dy}px, 0)`
        : openShift
            ? `translate3d(${openShift}px, 0, 0)`
            : undefined;

    return (
        <div
            ref={rootRef}
            data-trinity-fab
            role="group"
            aria-label="Acceso Trinity (Zenith, Horizon, Logic, Anchor)"
            className={cn(styles.root, dragOffset && styles.rootDragging, open && styles.open)}
            style={{
                bottom: `calc(${pos.bottom}px + env(safe-area-inset-bottom, 0px))`,
                ...(pos.side === "left"
                    ? { left: "calc(0.75rem + env(safe-area-inset-left, 0px))", right: "auto" }
                    : { right: "calc(0.75rem + env(safe-area-inset-right, 0px))", left: "auto" }),
                transform,
            }}
            onPointerDown={onPointerDown}
            onContextMenu={(e) => {
                // iOS/Android: el long-press sobre el orbe es la selección radial
                // de Trinity, NO el menú contextual del navegador ni el callout
                // de selección de texto. Lo bloqueamos por completo.
                e.preventDefault();
                e.stopPropagation();
            }}
            onTouchMove={(e) => {
                // iOS: durante la pulsación larga el navegador hace scroll o
                // intenta la "selección de texto". Como el orbe ya usa
                // `touch-action: none` + pointer events, solo blindamos el
                // evento nativo para que un long-press NO abra la lupa.
                if (selecting) e.preventDefault();
            }}
        >
            {open && (
                <button
                    type="button"
                    aria-label="Cerrar acceso Trinity"
                    className={styles.scrim}
                    onPointerDown={(e) => { e.stopPropagation(); setOpen(false); }}
                />
            )}

            {NODES.map(({ edge, label, color, Icon, petalClass }) => (
                <button
                    key={edge}
                    type="button"
                    title={label}
                    aria-label={label}
                    data-trinity-petal={edge}
                    className={cn(
                        styles.petal,
                        styles[petalClass],
                        activeEdge === edge && styles.petalActive,
                        // Selección radial: resalta en vivo el pétalo sobre el que
                        // pasa el dedo mientras mantiene pulsado el orbe.
                        selecting && hoverPetal === edge && styles.petalHover
                    )}
                    style={{ "--pc": color } as React.CSSProperties}
                    onClick={() => toggleEdge(edge)}
                >
                    <Icon className="w-5 h-5" />
                </button>
            ))}

            <button
                type="button"
                ref={coreRef}
                // Material StarSeed: halo neón 4-colores respirando suave (4s,
                // solo opacidad — ver src/styles/starseed-materials.css)
                className={cn(styles.core, "ss-neon-breathe", "ss-neon-breathe--trinity")}
                aria-expanded={open}
                aria-label={open ? "Cerrar pétalos Trinity" : "Abrir pétalos Trinity"}
                title="Trinity"
                onClick={(e) => {
                    // Solo teclado (Enter/Espacio → detail 0): el tap táctil/ratón
                    // ya se gestiona en pointerup para no duplicar el toggle.
                    if (e.detail === 0) setOpen(o => !o);
                }}
            >
                <span className={styles.coreGlass}>
                    {/* sigil: 4 gemas en cruz con los colores cardinales */}
                    <svg className={styles.sigil} viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="4.6" r="3" fill="#007FFF" />
                        <circle cx="19.4" cy="12" r="3" fill="#FFBF00" />
                        <circle cx="12" cy="19.4" r="3" fill="#DC143C" />
                        <circle cx="4.6" cy="12" r="3" fill="#39FF14" />
                        <circle cx="12" cy="12" r="1.6" fill="rgba(255,255,255,0.85)" />
                    </svg>
                </span>
            </button>
        </div>
    );
}
