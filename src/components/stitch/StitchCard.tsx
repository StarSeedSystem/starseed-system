import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface StitchCardProps extends Omit<HTMLMotionProps<"div">, "ref"> {
    theme?: "liquid" | "organic" | "glass" | "neon";
    variant?: "default" | "hoverable";
    styleConfig?: {
        cornerRadius?: number;
        blur?: number;
        borderColor?: string;
        backgroundColor?: string;
        boxShadow?: string;
        borderWidth?: string;
    };
    children: React.ReactNode;
}

export function StitchCard({
    className,
    theme = "liquid",
    variant = "default",
    styleConfig,
    children,
    ...props
}: StitchCardProps) {

    // Base styles
    const baseStyles = "relative overflow-hidden backdrop-blur-md transition-all duration-300";

    // Theme-specific styles
    const getThemeStyles = () => {
        if (theme === "liquid") {
            return cn(
                "bg-cyan-950/30 border border-cyan-500/20 rounded-xl",
                "shadow-[0_0_20px_rgba(6,182,212,0.05)]",
                variant === "hoverable" && "hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] group"
            );
        }
        if (theme === "organic") {
            return cn(
                "bg-emerald-950/30 border border-emerald-500/20 rounded-[24px]",
                "shadow-[0_0_20px_rgba(16,185,129,0.05)]",
                variant === "hoverable" && "hover:border-emerald-400/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] group"
            );
        }
        if (theme === "neon") {
            return cn(
                "bg-black/80 border border-fuchsia-500/50 rounded-lg",
                "shadow-[0_0_15px_rgba(217,70,239,0.1)]",
                variant === "hoverable" && "hover:border-fuchsia-400 hover:shadow-[0_0_25px_rgba(217,70,239,0.3)]"
            );
        }
        // Default Glass
        return cn(
            "bg-white/5 border border-white/10 rounded-xl",
            variant === "hoverable" && "hover:bg-white/10 hover:border-white/20 hover:shadow-lg"
        );
    };

    // Style override logic
    // If styleConfig provides a background color, it should take precedence.
    // However, purely relying on inline styles might be cleaner for the override.

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(baseStyles, getThemeStyles(), className)}
            style={{
                borderRadius: styleConfig?.cornerRadius ? `${styleConfig.cornerRadius}px` : undefined,
                backdropFilter: styleConfig?.blur ? `blur(${styleConfig.blur}px)` : undefined,
                borderColor: styleConfig?.borderColor,
                // Use !important logic equivalent via inline style precedence for critical overrides
                backgroundColor: styleConfig?.backgroundColor,
                boxShadow: styleConfig?.boxShadow,
                borderWidth: styleConfig?.borderWidth,
            }}
            {...props}
        >
            {/* Decorator Line for Liquid/Organic */}
            {(theme === "liquid" || theme === "organic") && (
                <div className={cn(
                    "absolute top-0 left-0 right-0 h-[1px]",
                    "bg-gradient-to-r from-transparent via-white/20 to-transparent",
                    "opacity-50"
                )} />
            )}

            {children}

            {/* Hover Glow Effect */}
            {variant === "hoverable" && (
                <div className={cn(
                    "absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    theme === "liquid" ? "bg-gradient-to-tr from-cyan-500/5 to-transparent" :
                        theme === "organic" ? "bg-gradient-to-tr from-emerald-500/5 to-transparent" :
                            "bg-gradient-to-tr from-white/5 to-transparent"
                )} />
            )}
        </motion.div>
    );
}
