"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter, PerimeterEdge } from "@/context/perimeter-context";
import { cn } from "@/lib/utils";

import { useAppearance } from "@/context/appearance-context";

// --- Configuration ---
const GLOW_COLOR_MAP: Record<string, string> = {
    zenith: "0, 255, 255",   // Cyan (RGB)
    anchor: "255, 0, 0",     // Red
    logic: "251, 191, 36",   // Amber
    horizon: "16, 185, 129"  // Emerald
};

/**
 * Colores cardinales OFICIALES de Trinity (CLAUDE.md §7 / EDGE_META en
 * trinity-edge-access.tsx). Usados SOLO para el indicador sutil de borde en
 * reposo (nuevo, opt-in) — no tocan el glow de hover existente arriba.
 */
const CARDINAL_HEX: Record<string, string> = {
    zenith: "#007FFF",
    horizon: "#39FF14",
    logic: "#FFBF00",
    anchor: "#DC143C",
};

interface EdgeSensorProps {
    edge: PerimeterEdge;
    isVertical?: boolean; // Kept for API compatibility, handled via className
    className: string;
    dwellTime?: number; // Intention threshold in ms
    size?: number; // Dynamic size in pixels
    /** Indicador sutil de borde en reposo (Ajustes → Trinity), opt-in. */
    showIndicator?: boolean;
}

const EdgeSensor = ({ edge, className, dwellTime = 500, size = 24, showIndicator = false }: EdgeSensorProps) => {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const [isHovering, setIsHovering] = useState(false);
    const [hasTriggered, setHasTriggered] = useState(false);

    // Determine dynamic style based on edge type
    // Horizon/Logic (Left/Right) -> modify Width
    // Zenith/Anchor (Top/Bottom) -> modify Height
    const isSide = edge === 'horizon' || edge === 'logic';

    const dynamicStyle = isSide ? { width: `${size}px` } : { height: `${size}px` };

    // Intention Algorithm: Dwell Detection
    useEffect(() => {
        if (!isHovering) return;
        if (activeEdge === edge) return; // Already active
        if (hasTriggered) return; // Already triggered in this hover session

        const timer = setTimeout(() => {
            setActiveEdge(edge);
            setHasTriggered(true);
        }, dwellTime);

        return () => clearTimeout(timer);
    }, [isHovering, activeEdge, edge, setActiveEdge, dwellTime, hasTriggered]);

    // Reset trigger decision state when leaving
    const handleMouseLeave = () => {
        setIsHovering(false);
        setHasTriggered(false);
    };

    const handleClick = () => {
        if (activeEdge === edge) {
            // Closing logic: Toggle OFF
            setActiveEdge(null);
            // Prevent immediate re-trigger by considering it "triggered" until leave
            setHasTriggered(true);
        } else {
            // Manual Open
            setActiveEdge(edge);
            setHasTriggered(true);
        }
    };

    // Derived RGB for the glow
    const colorRgb = GLOW_COLOR_MAP[edge as string] || "255, 255, 255";

    return (
        <motion.div
            className={cn(
                "fixed z-[9999] hover:z-[10000]",
                className
            )}
            style={{ ...dynamicStyle }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            initial={{ opacity: 0 }}
            animate={{
                opacity: 1,
                // Breathing glow effect if hovering
                boxShadow: isHovering
                    ? `0 0 20px 2px rgba(${colorRgb}, 0.6), inset 0 0 10px rgba(${colorRgb}, 0.4)`
                    : `0 0 0px 0px rgba(${colorRgb}, 0)`
            }}
            transition={{ duration: 0.4 }}
        >
            {/* Inner line for "Peek" visibility */}
            <motion.div
                className="w-full h-full bg-transparent"
                animate={{
                    backgroundColor: isHovering ? `rgba(${colorRgb}, 0.1)` : "transparent"
                }}
            />
            {/*
                Indicador sutil de borde (opt-in, Ajustes → Trinity → "Indicadores
                de borde"): una línea muy fina con el color cardinal OFICIAL del
                nodo, visible en reposo para que el usuario sepa dónde está cada
                acceso sin necesidad de pasar el cursor. No intrusiva: 1-2px,
                opacidad baja, se intensifica levemente al pasar por encima.
            */}
            {showIndicator && !isHovering && (
                <span
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute rounded-full transition-opacity duration-300",
                        isSide ? "inset-y-6 w-[2px] left-1/2 -translate-x-1/2" : "inset-x-6 h-[2px] top-1/2 -translate-y-1/2",
                    )}
                    style={{
                        backgroundColor: CARDINAL_HEX[edge as string] ?? "#fff",
                        opacity: 0.28,
                        boxShadow: `0 0 6px ${CARDINAL_HEX[edge as string] ?? "#fff"}55`,
                    }}
                />
            )}
        </motion.div>
    );
};

export function PerimeterInterface() {
    const { config } = useAppearance();
    const { edgeSensitivity = 20, showEdgeIndicators = false } = config?.trinity || {};
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <>
            {/* Zenith (Top) - Blue/Cyan - Persistent Hover (600ms) to unlock AI Curtain */}
            <EdgeSensor
                edge="zenith"
                className="top-0 left-1/2 -translate-x-1/2 w-[60vw] bg-transparent"
                dwellTime={600}
                size={edgeSensitivity}
                showIndicator={showEdgeIndicators}
            />

            {/* Anchor (Bottom) - Red/Gray - Longer Dwell (800ms) to avoid accidental Dock triggers */}
            <EdgeSensor
                edge="anchor"
                className="bottom-0 left-1/2 -translate-x-1/2 w-[60vw] bg-transparent"
                dwellTime={800}
                size={edgeSensitivity}
                showIndicator={showEdgeIndicators}
            />

            {/* Horizon (Left) - Green - Quick Access (400ms) for Creation */}
            <EdgeSensor
                edge="horizon"
                className="top-1/2 -translate-y-1/2 left-0 h-[60vh] bg-transparent"
                dwellTime={400}
                size={edgeSensitivity}
                showIndicator={showEdgeIndicators}
            />

            {/* Logic (Right) - Amber - Quick Access (400ms) for System */}
            <EdgeSensor
                edge="logic"
                className="top-1/2 -translate-y-1/2 right-0 h-[60vh] bg-transparent"
                dwellTime={400}
                size={edgeSensitivity}
                showIndicator={showEdgeIndicators}
            />
        </>
    );
}
