import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface StitchInputProps extends Omit<HTMLMotionProps<"input">, "ref"> {
    theme?: "liquid" | "organic" | "glass";
    label?: string;
}

export function StitchInput({
    className,
    theme = "liquid",
    label,
    ...props
}: StitchInputProps) {

    return (
        <div className="flex flex-col gap-1.5 w-full">
            {label && (
                <span className={cn(
                    "text-[10px] uppercase tracking-wider font-semibold ml-1",
                    theme === "liquid" ? "text-cyan-400" :
                        theme === "organic" ? "text-emerald-400" :
                            "text-white/50"
                )}>
                    {label}
                </span>
            )}
            <div className="relative group">
                <motion.input
                    whileFocus={{ scale: 1.01 }}
                    className={cn(
                        "w-full bg-transparent outline-none transition-all duration-300",
                        "placeholder:text-white/20 text-sm",
                        // Base structure
                        "px-4 py-2.5",

                        // Theme Styles
                        theme === "liquid" && [
                            "rounded-xl border border-cyan-500/20 bg-cyan-950/20 text-cyan-100",
                            "focus:border-cyan-400/60 focus:bg-cyan-900/30 focus:shadow-[0_0_15px_rgba(6,182,212,0.15)]",
                            "group-hover:border-cyan-500/40"
                        ],
                        theme === "organic" && [
                            "rounded-[16px] border border-emerald-500/20 bg-emerald-950/20 text-emerald-100",
                            "focus:border-emerald-400/60 focus:bg-emerald-900/30 focus:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
                            "group-hover:border-emerald-500/40"
                        ],
                        theme === "glass" && [
                            "rounded-lg border border-white/10 bg-white/5 text-white/90",
                            "focus:border-white/30 focus:bg-white/10",
                            "group-hover:border-white/20"
                        ],
                        className
                    )}
                    {...props}
                />

                {/* Focus Indicator Line */}
                <div className={cn(
                    "absolute bottom-0 left-2 right-2 h-[1px] scale-x-0 transition-transform duration-300 origin-left group-focus-within:scale-x-100",
                    theme === "liquid" ? "bg-cyan-400" :
                        theme === "organic" ? "bg-emerald-400" :
                            "bg-white/50"
                )} />
            </div>
        </div>
    );
}
