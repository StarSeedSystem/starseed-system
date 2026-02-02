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

interface EdgeSensorProps {
    edge: PerimeterEdge;
    isVertical?: boolean; // Kept for API compatibility, handled via className
    className: string;
    dwellTime?: number; // Intention threshold in ms
    size?: number; // Dynamic size in pixels
}

const EdgeSensor = ({ edge, className, dwellTime = 500, size = 24 }: EdgeSensorProps) => {
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
        </motion.div>
    );
};

export function PerimeterInterface() {
    const { config } = useAppearance();
    const { edgeSensitivity = 20 } = config?.trinity || {};
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
                className="top-0 left-0 w-full bg-transparent"
                dwellTime={600}
                size={edgeSensitivity}
            />

            {/* Anchor (Bottom) - Red/Gray - Longer Dwell (800ms) to avoid accidental Dock triggers */}
            <EdgeSensor
                edge="anchor"
                className="bottom-0 left-0 w-full bg-transparent"
                dwellTime={800}
                size={edgeSensitivity}
            />

            {/* Horizon (Left) - Green - Quick Access (400ms) for Creation */}
            <EdgeSensor
                edge="horizon"
                className="top-0 left-0 h-full bg-transparent"
                dwellTime={400}
                size={edgeSensitivity}
            />

            {/* Logic (Right) - Amber - Quick Access (400ms) for System */}
            <EdgeSensor
                edge="logic"
                className="top-0 right-0 h-full bg-transparent"
                dwellTime={400}
                size={edgeSensitivity}
            />
        </>
    );
}
