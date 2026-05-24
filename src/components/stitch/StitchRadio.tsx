"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface StitchRadioProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    labelPosition?: "left" | "right";
    size?: number;
    activeColor?: string;
    disabled?: boolean;
    className?: string;
}

export function StitchRadio({
    checked,
    onChange,
    label,
    labelPosition = "left",
    size = 18,
    activeColor = "#007FFF",
    disabled = false,
    className
}: StitchRadioProps) {

    return (
        <label
            className={cn(
                "group relative flex items-center gap-3 cursor-pointer select-none",
                label ? "w-full justify-between" : "w-fit",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {label && labelPosition === "left" && (
                <span className="text-xs font-medium text-white/70 group-hover:text-white transition-colors duration-300">
                    {label}
                </span>
            )}

            <div className="relative flex items-center justify-center w-[44px]">
                <div
                    className="relative isolate"
                    onClick={() => !disabled && onChange(!checked)}
                >
                    {/* Outer Circle */}
                    <motion.div
                        className="relative rounded-full transition-all duration-300 flex items-center justify-center"
                        animate={{
                            backgroundColor: checked ? `${activeColor}22` : "rgba(255,255,255,0.05)",
                            borderColor: checked ? activeColor : "rgba(255,255,255,0.2)",
                            boxShadow: checked ? `0 0 15px ${activeColor}44` : "none"
                        }}
                        style={{
                            width: size,
                            height: size,
                            border: "1px solid"
                        }}
                    >
                        {/* Inner Dot */}
                        <AnimatePresence>
                            {checked && (
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    className="flex items-center justify-center"
                                >
                                    <motion.div
                                        className="rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                        style={{
                                            width: size * 0.45,
                                            height: size * 0.45
                                        }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Hover Effect */}
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    </motion.div>

                    {/* Ring detail */}
                    <div className="absolute -inset-1 border border-white/5 rounded-full pointer-events-none opacity-50" />
                </div>
            </div>

            {label && labelPosition === "right" && (
                <span className="text-xs font-medium text-white/70 group-hover:text-white transition-colors duration-300">
                    {label}
                </span>
            )}
        </label>
    );
}
