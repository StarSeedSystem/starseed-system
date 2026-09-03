"use client";

/*
 * TrinityEdgeAccess — Trinity Móvil · Bloque 4.
 * ----------------------------------------------------------------------
 * En pantallas táctiles abrir los 4 menús cardinales con los SENSORES de
 * perímetro (hover/dwell de ratón) es imposible, y los gestos de borde del
 * SO (atrás, centro de control) chocan con cualquier swipe pegado a la
 * orilla. Este componente ofrece DOS vías 100% configurables y aditivas:
 *
 *   1) ASAS DE BORDE — una píldora fina, no intrusiva, centrada en cada
 *      orilla (color cardinal). Un toque abre/cierra ese menú. Longitud,
 *      grosor y opacidad en reposo se ajustan en Ajustes → Trinity.
 *
 *   2) DESLIZAR DESDE LA ORILLA — empezar el dedo en los ~24px del borde y
 *      arrastrar hacia dentro: superado el umbral, el menú se abre con un
 *      destello de confirmación. Umbral configurable.
 *
 * No duplica lógica: ambas vías hacen toggle con el MISMO
 * `usePerimeter().setActiveEdge` que usan los sensores de ratón, el
 * TrinityFab y los atajos. El ratón nunca pasa por aquí (solo eventos
 * touch). Nada de esto sustituye a los sensores existentes ni al FAB.
 *
 * SOP: architecture/integracion-portal-starseed-os.md · "Trinity Móvil · Bloque 4".
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePerimeter, PerimeterEdge } from "@/context/perimeter-context";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import { useRitoActivo } from "@/lib/ui/rito-activo";
import styles from "./trinity-edge-access.module.css";

type Edge = Exclude<PerimeterEdge, null>;

const EDGE_META: Record<Edge, { side: "top" | "bottom" | "left" | "right"; color: string; label: string }> = {
    zenith: { side: "top", color: "#007FFF", label: "Zenith · Guía IA y explorador" },
    anchor: { side: "bottom", color: "#DC143C", label: "Anchor · Dock Trinity" },
    horizon: { side: "left", color: "#39FF14", label: "Horizon · Lienzo de creación" },
    logic: { side: "right", color: "#FFBF00", label: "Logic · Centro de control" },
};

const EDGE_HOTZONE_PX = 24; // banda desde la orilla donde nace el deslizamiento
const SWIPE_CANCEL_PERP = 0.6; // si el gesto es demasiado paralelo al borde, no abre

interface EdgeAccessConfig {
    mode: "auto" | "on" | "off";
    edges: Record<Edge, { handle: boolean; swipe: boolean }>;
    handleLength: number;
    handleThickness: number;
    handleOpacity: number;
    swipeThreshold: number;
}

const FALLBACK: EdgeAccessConfig = {
    mode: "auto",
    edges: {
        zenith: { handle: true, swipe: true },
        horizon: { handle: true, swipe: true },
        logic: { handle: true, swipe: true },
        anchor: { handle: true, swipe: true },
    },
    handleLength: 28,
    handleThickness: 5,
    handleOpacity: 0.22,
    swipeThreshold: 56,
};

function eligibleAuto(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 1024;
}

export function TrinityEdgeAccess() {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const { config } = useAppearance();
    const cfg: EdgeAccessConfig = { ...FALLBACK, ...(config?.trinity?.edgeAccess as EdgeAccessConfig | undefined) };

    const [mounted, setMounted] = useState(false);
    const [autoOk, setAutoOk] = useState(false);
    const [ghost, setGhost] = useState<{ edge: Edge; x: number; y: number } | null>(null);

    // refs vivas para los listeners globales (no re-suscribir al cambiar ajustes)
    const cfgRef = useRef(cfg);
    const activeRef = useRef(activeEdge);
    useEffect(() => { cfgRef.current = cfg; });
    useEffect(() => { activeRef.current = activeEdge; }, [activeEdge]);

    useEffect(() => {
        setMounted(true);
        const evalAuto = () => setAutoOk(eligibleAuto());
        evalAuto();
        const mq = window.matchMedia("(pointer: coarse)");
        window.addEventListener("resize", evalAuto);
        try { mq.addEventListener("change", evalAuto); } catch { /* Safari viejo */ }
        return () => {
            window.removeEventListener("resize", evalAuto);
            try { mq.removeEventListener("change", evalAuto); } catch { /* noop */ }
        };
    }, []);

    // (Ola 228 · R1F) Rito de verdad en primer plano: ni asas ni gestos de
    // borde pueden disparar un menú cardinal mientras haya un rito activo.
    const rito = useRitoActivo();

    const enabled = !rito && mounted && cfg.mode !== "off" && (cfg.mode === "on" || autoOk);

    // ── Deslizamiento desde cada orilla ─────────────────────────────
    const gestureRef = useRef<{
        edge: Edge;
        startX: number;
        startY: number;
        fired: boolean;
    } | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const detectEdge = (x: number, y: number): Edge | null => {
            const w = window.innerWidth, h = window.innerHeight;
            const c = cfgRef.current;
            if (y <= EDGE_HOTZONE_PX && c.edges.zenith.swipe) return "zenith";
            if (h - y <= EDGE_HOTZONE_PX && c.edges.anchor.swipe) return "anchor";
            if (x <= EDGE_HOTZONE_PX && c.edges.horizon.swipe) return "horizon";
            if (w - x <= EDGE_HOTZONE_PX && c.edges.logic.swipe) return "logic";
            return null;
        };

        const onStart = (e: TouchEvent) => {
            if (gestureRef.current) return;
            if (activeRef.current) return; // ya hay un menú abierto
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            const edge = detectEdge(t.clientX, t.clientY);
            if (!edge) return;
            gestureRef.current = { edge, startX: t.clientX, startY: t.clientY, fired: false };
        };

        const onMove = (e: TouchEvent) => {
            const g = gestureRef.current;
            if (!g || g.fired) return;
            const t = e.touches[0];
            if (!t) return;
            const dx = t.clientX - g.startX;
            const dy = t.clientY - g.startY;
            const meta = EDGE_META[g.edge];
            let inward = 0, perp = 0;
            if (meta.side === "top") { inward = dy; perp = Math.abs(dx); }
            else if (meta.side === "bottom") { inward = -dy; perp = Math.abs(dx); }
            else if (meta.side === "left") { inward = dx; perp = Math.abs(dy); }
            else { inward = -dx; perp = Math.abs(dy); } // right
            if (inward <= 0) return;
            // gesto demasiado paralelo al borde → probablemente scroll, no abrir
            if (perp > inward && perp > inward * (1 + SWIPE_CANCEL_PERP)) { gestureRef.current = null; return; }
            if (inward >= cfgRef.current.swipeThreshold) {
                g.fired = true;
                setActiveEdge(g.edge);
                try { (navigator as any).vibrate?.(8); } catch { /* opcional */ }
                setGhost({ edge: g.edge, x: t.clientX, y: t.clientY });
                window.setTimeout(() => setGhost(null), 520);
            }
        };

        const onEnd = () => { gestureRef.current = null; };

        window.addEventListener("touchstart", onStart, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd, { passive: true });
        window.addEventListener("touchcancel", onEnd, { passive: true });
        return () => {
            window.removeEventListener("touchstart", onStart);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
            window.removeEventListener("touchcancel", onEnd);
        };
    }, [enabled, setActiveEdge]);

    const toggle = useCallback((edge: Edge) => {
        setActiveEdge(activeRef.current === edge ? null : edge);
    }, [setActiveEdge]);

    if (!enabled) return null;

    const len = `${Math.min(Math.max(cfg.handleLength, 10), 60)}%`;
    const thick = `${Math.min(Math.max(cfg.handleThickness, 3), 12)}px`;
    const gap = "max(8px, env(safe-area-inset-top, 0px))";

    const handleStyle = (edge: Edge): React.CSSProperties => {
        const { side, color } = EDGE_META[edge];
        const common: React.CSSProperties = {
            ["--pc" as any]: color,
            ["--rest-opacity" as any]: String(cfg.handleOpacity),
        };
        if (side === "top") return { ...common, top: "max(6px, env(safe-area-inset-top,0px))", left: "50%", transform: "translateX(-50%)", width: len, height: thick };
        if (side === "bottom") return { ...common, bottom: "max(6px, env(safe-area-inset-bottom,0px))", left: "50%", transform: "translateX(-50%)", width: len, height: thick };
        if (side === "left") return { ...common, left: "max(6px, env(safe-area-inset-left,0px))", top: "50%", transform: "translateY(-50%)", height: len, width: thick };
        return { ...common, right: "max(6px, env(safe-area-inset-right,0px))", top: "50%", transform: "translateY(-50%)", height: len, width: thick };
    };

    return (
        <>
            {(Object.keys(EDGE_META) as Edge[]).map((edge) =>
                cfg.edges[edge]?.handle ? (
                    <button
                        key={edge}
                        type="button"
                        aria-label={`${EDGE_META[edge].label} (toca o desliza desde el borde)`}
                        title={EDGE_META[edge].label}
                        data-trinity-edge={edge}
                        data-trinity-edge-handle={edge}
                        className={cn(styles.handle, activeEdge === edge && styles.handleActive)}
                        style={handleStyle(edge)}
                        onClick={() => toggle(edge)}
                    >
                        <span className={styles.pill} aria-hidden />
                    </button>
                ) : null
            )}

            {ghost && (
                <span
                    className={styles.swipeGhost}
                    style={{
                        ["--pc" as any]: EDGE_META[ghost.edge].color,
                        left: ghost.x - 40,
                        top: ghost.y - 40,
                        width: 80,
                        height: 80,
                    }}
                    aria-hidden
                />
            )}
        </>
    );
}
