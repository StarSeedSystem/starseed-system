"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter, PerimeterEdge } from "@/context/perimeter-context";
import { cn } from "@/lib/utils";

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
}

const EdgeSensor = ({ edge, className, dwellTime = 500 }: EdgeSensorProps) => {
    const { activeEdge, setActiveEdge } = usePerimeter();
    const [isHovering, setIsHovering] = useState(false);
    const [hasTriggered, setHasTriggered] = useState(false);

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
    return (
        <>
            {/* Zenith (Top) - Blue/Cyan - Persistent Hover (600ms) to unlock AI Curtain */}
            <EdgeSensor
                edge="zenith"
                className="top-0 left-0 w-full h-6 bg-transparent"
                dwellTime={600}
            />

            {/* Anchor (Bottom) - Red/Gray - Longer Dwell (800ms) to avoid accidental Dock triggers */}
            <EdgeSensor
                edge="anchor"
                className="bottom-0 left-0 w-full h-6 bg-transparent"
                dwellTime={800}
            />

            {/* Horizon (Left) - Green - Quick Access (400ms) for Creation */}
            <EdgeSensor
                edge="horizon"
                className="top-0 left-0 w-6 h-full bg-transparent"
                dwellTime={400}
            />

            {/* Logic (Right) - Amber - Quick Access (400ms) for System */}
            <EdgeSensor
                edge="logic"
                className="top-0 right-0 w-6 h-full bg-transparent"
                dwellTime={400}
            />
        </>
    );
}
