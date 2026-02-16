import React from "react";
import { cn } from "@/lib/utils";
import { SystemElement, getElementsByCategory } from "@/config/system-elements";
import { StitchIconWrapper } from "./StitchIconWrapper";
import { motion } from "framer-motion";

interface StitchNetworkControlsProps {
    className?: string;
    theme?: "liquid" | "organic";
}

export function StitchNetworkControls({ className, theme = "liquid" }: StitchNetworkControlsProps) {
    const actionIcons = getElementsByCategory("action").slice(0, 4); // Get first 4 action icons

    return (
        <div className={cn(
            "flex items-center gap-3 p-2 backdrop-blur-md rounded-2xl border",
            theme === "liquid" ? "bg-cyan-950/30 border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]" :
                "bg-emerald-950/30 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
            className
        )}>
            {actionIcons.map((el, index) => (
                <motion.button
                    key={el.id}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative group p-1.5 rounded-lg transition-colors hover:bg-white/5"
                >
                    <StitchIconWrapper
                        theme={theme}
                        className="w-8 h-8"
                    >
                        <el.icon className="w-4 h-4" />
                    </StitchIconWrapper>

                    {/* Tooltip hint */}
                    <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-white/0 group-hover:text-white/70 transition-all opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                        {el.label}
                    </span>
                </motion.button>
            ))}
        </div>
    );
}
