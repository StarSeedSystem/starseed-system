"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export type TooltipStyle = "glass" | "solid" | "minimal";

interface StitchTooltipProps {
    content: React.ReactNode;
    style?: TooltipStyle;
    visible?: boolean;
    className?: string;
    styleConfig?: {
        primaryColor?: string;
        blur?: number;
    };
}

export function StitchTooltip({
    content,
    style = "glass",
    visible = true,
    className,
    styleConfig
}: StitchTooltipProps) {
    const baseStyles = cn(
        "pointer-events-none z-[100] px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-500 shadow-2xl",
        style === "glass" && "backdrop-blur-2xl bg-white/5 border-[0.5px]",
        style === "solid" && "bg-zinc-950 border border-white/10 text-white/90 shadow-[0_0_20px_rgba(0,0,0,0.8)]",
        style === "minimal" && "bg-transparent text-white/80 border-none shadow-none",
        className
    );

    const animation = {
        initial: { opacity: 0, scale: 0.9, y: 10, filter: "blur(4px)" },
        animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, scale: 0.9, y: 10, filter: "blur(8px)" },
        transition: {
            type: "spring",
            damping: 20,
            stiffness: 300,
            mass: 0.8
        }
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    {...animation}
                    className={baseStyles}
                    style={{
                        backdropFilter: style === "glass" ? `blur(${styleConfig?.blur || 20}px) saturate(180%)` : "none",
                        borderColor: style === "glass" ? `${styleConfig?.primaryColor || "#ffffff"}44` : undefined,
                        boxShadow: style === "glass" ? `0 8px 32px 0 rgba(0, 0, 0, 0.37), inset 0 0 0 0.5px ${styleConfig?.primaryColor || "#ffffff"}22` : undefined,
                        background: style === "glass" ? `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%)` : undefined,
                    } as any}
                >
                    <span
                        className="relative z-10 block"
                        style={{
                            color: styleConfig?.primaryColor || "#ffffff",
                            textShadow: style === "minimal" ? "none" : `0 0 8px ${(styleConfig?.primaryColor || "#ffffff")}66`,
                            letterSpacing: "0.05em"
                        }}
                    >
                        {content}
                    </span>

                    {style !== "minimal" && (
                        <div
                            className={cn(
                                "absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b z-0",
                                style === "glass" && "bg-white/5",
                                style === "solid" && "bg-zinc-950 border-white/10"
                            )}
                            style={{
                                borderColor: style === "glass" ? `${styleConfig?.primaryColor || "#ffffff"}44` : undefined,
                                backdropFilter: style === "glass" ? `blur(${styleConfig?.blur || 20}px)` : "none",
                            } as any}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
