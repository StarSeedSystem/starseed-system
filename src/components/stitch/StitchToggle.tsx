"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface StitchToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    style?: "standard" | "cyber" | "fluid";
    size?: "sm" | "md" | "lg";
    activeColor?: string;
    inactiveColor?: string;
    disabled?: boolean;
    className?: string;
}

export function StitchToggle({
    checked,
    onChange,
    label,
    style = "standard",
    size = "md",
    activeColor = "#007FFF", // Zenith Blue
    inactiveColor = "rgba(255,255,255,0.1)",
    disabled = false,
    className
}: StitchToggleProps) {

    const sizeConfig = {
        sm: { width: 32, height: 18, knob: 14, padding: 2 },
        md: { width: 44, height: 24, knob: 20, padding: 2 },
        lg: { width: 56, height: 32, knob: 26, padding: 3 }
    }[size];

    const springConfig = {
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 1
    };

    return (
        <label
            className={cn(
                "group relative flex items-center gap-3 cursor-pointer select-none",
                label ? "w-full justify-between" : "w-fit",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {label && (
                <span className="text-xs font-medium text-white/70 group-hover:text-white transition-colors duration-300">
                    {label}
                </span>
            )}

            <div
                className="relative isolate"
                onClick={() => !disabled && onChange(!checked)}
            >
                {/* Centered Control Container */}
                <div className="relative flex items-center justify-center w-[44px]">
                    {/* Switch Track */}
                    <motion.div
                        className={cn(
                            "relative flex items-center p-0.5 transition-colors duration-300 isolate",
                            style === "standard" && "rounded-full",
                            style === "cyber" && "rounded-sm clip-path-cyber-toggle",
                            style === "fluid" && "rounded-2xl"
                        )}
                        style={{
                            width: sizeConfig.width,
                            height: sizeConfig.height,
                            backgroundColor: checked ? `${activeColor}22` : inactiveColor,
                            border: "1px solid rgba(255,255,255,0.1)",
                            backdropFilter: "blur(8px)"
                        }}
                        onClick={() => !disabled && onChange(!checked)}
                    >
                        {/* Active Glow Overlay */}
                        <AnimatePresence>
                            {checked && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0"
                                    style={{
                                        background: `linear-gradient(90deg, transparent, ${activeColor}33, transparent)`,
                                        filter: "blur(4px)"
                                    }}
                                />
                            )}
                        </AnimatePresence>
                        {/* Knob Glow */}
                        <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300"
                            style={{ background: `radial-gradient(circle, ${activeColor}, transparent 70%)` }}
                        />

                        {/* Knob (Moved inside Track for perfect centering) */}
                        <motion.div
                            className={cn(
                                "absolute z-10 flex items-center justify-center",
                                style === "standard" && "rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]",
                                style === "cyber" && "rounded-[2px]",
                                style === "fluid" && "rounded-xl"
                            )}
                            animate={{
                                x: checked
                                    ? sizeConfig.width - sizeConfig.knob - sizeConfig.padding * 2
                                    : 0,
                                backgroundColor: checked ? activeColor : "rgba(255,255,255,0.8)",
                                boxShadow: checked ? `0 0 15px ${activeColor}88` : "0 0 5px rgba(255,255,255,0.2)"
                            }}
                            transition={springConfig as any}
                            style={{
                                width: sizeConfig.knob,
                                height: sizeConfig.knob,
                                left: sizeConfig.padding,
                                top: "50%",
                                marginTop: -(sizeConfig.knob / 2),
                                backgroundColor: "white",
                                border: "1px solid rgba(255,255,255,0.2)"
                            }}
                        >
                            {/* Inner detail for cyber style */}
                            {style === "cyber" && (
                                <div className="w-[1px] h-1/2 bg-black/20" />
                            )}

                            {/* Liquid detail for fluid style */}
                            {style === "fluid" && checked && (
                                <motion.div
                                    animate={{ scale: [0.8, 1.1, 0.8] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="w-1.5 h-1.5 rounded-full bg-white/40 blur-[1px]"
                                />
                            )}
                        </motion.div>
                    </motion.div>

                    {/* Refractive Borders (Modern Glass Effect) */}
                    <div className="absolute inset-0 pointer-events-none rounded-inherit border border-white/10 opacity-20" />
                </div>
            </div>
        </label>
    );
}
