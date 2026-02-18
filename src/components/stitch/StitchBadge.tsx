"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type BadgeStyle = "pill" | "square" | "dot";

interface StitchBadgeProps {
    children?: React.ReactNode;
    style?: BadgeStyle;
    variant?: "primary" | "secondary" | "accent" | "ghost";
    className?: string;
    styleConfig?: {
        primaryColor?: string;
        secondaryColor?: string;
        glow?: boolean;
    };
}

export function StitchBadge({
    children,
    style = "pill",
    variant = "primary",
    className,
    styleConfig
}: StitchBadgeProps) {
    const isDot = style === "dot";

    const baseStyles = cn(
        "inline-flex items-center justify-center font-bold transition-all duration-300",
        style === "pill" && "px-2 py-0.5 rounded-full text-[9px] min-w-[20px]",
        style === "square" && "px-1.5 py-0.5 rounded-md text-[9px] min-w-[20px]",
        style === "dot" && "w-2.5 h-2.5 rounded-full",
        className
    );

    const variants = {
        primary: {
            bg: "bg-cyan-500/10",
            border: "border-cyan-500/30",
            text: "text-cyan-400",
            glow: "shadow-[0_0_10px_rgba(34,211,238,0.3)]",
            color: styleConfig?.primaryColor || "#22d3ee"
        },
        secondary: {
            bg: "bg-purple-500/10",
            border: "border-purple-500/30",
            text: "text-purple-400",
            glow: "shadow-[0_0_10px_rgba(168,85,247,0.3)]",
            color: styleConfig?.secondaryColor || "#a855f7"
        },
        accent: {
            bg: "bg-rose-500/10",
            border: "border-rose-500/30",
            text: "text-rose-400",
            glow: "shadow-[0_0_10px_rgba(244,63,94,0.3)]",
            color: "#f43f5e"
        },
        ghost: {
            bg: "bg-white/5",
            border: "border-white/10",
            text: "text-white/40",
            glow: "none",
            color: "rgba(255,255,255,0.4)"
        }
    };

    const currentVariant = variants[variant];

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
                baseStyles,
                currentVariant.bg,
                !isDot && "border",
                !isDot && currentVariant.border,
                !isDot && currentVariant.text,
                styleConfig?.glow && currentVariant.glow
            )}
            style={{
                borderColor: !isDot ? `${currentVariant.color}44` : undefined,
                color: !isDot ? currentVariant.color : undefined,
                backgroundColor: isDot ? currentVariant.color : `${currentVariant.color}1a`,
                boxShadow: styleConfig?.glow ? `0 0 10px ${currentVariant.color}44` : "none"
            } as any}
        >
            {!isDot && children}
        </motion.div>
    );
}
