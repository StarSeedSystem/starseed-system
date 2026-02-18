"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export interface StitchCheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: string;
    labelPosition?: "left" | "right";
    style?: "round" | "square";
    activeColor?: string;
    disabled?: boolean;
    className?: string;
}

export function StitchCheckbox({
    checked,
    onChange,
    label,
    labelPosition = "left",
    style = "round",
    activeColor = "#007FFF",
    disabled = false,
    className
}: StitchCheckboxProps) {

    const checkmarkVariants = {
        unchecked: {
            pathLength: 0,
            opacity: 0,
            scale: 0.8
        },
        checked: {
            pathLength: 1,
            opacity: 1,
            scale: 1,
            transition: {
                pathLength: { type: "spring", stiffness: 300, damping: 20 } as any,
                opacity: { duration: 0.2 }
            }
        }
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
                    {/* Box */}
                    <motion.div
                        className={cn(
                            "relative w-[18px] h-[18px] transition-all duration-300 flex items-center justify-center",
                            style === "round" ? "rounded-full" : "rounded-md"
                        )}
                        animate={{
                            backgroundColor: checked ? activeColor : "rgba(255,255,255,0.05)",
                            borderColor: checked ? activeColor : "rgba(255,255,255,0.2)",
                            boxShadow: checked ? `0 0 15px ${activeColor}44` : "none"
                        }}
                        style={{ border: "1px solid" }}
                    >
                        {/* Check Mark */}
                        <AnimatePresence>
                            {checked && (
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    className="flex items-center justify-center p-0.5"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="white"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="w-full h-full"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Hover Effect */}
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    </motion.div>

                    {/* Refractive border overlay */}
                    <div className={cn(
                        "absolute inset-0 pointer-events-none border border-white/5 opacity-40",
                        style === "round" ? "rounded-full" : "rounded-md"
                    )} />
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
