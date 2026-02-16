import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface StitchButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
    variant?: "primary" | "secondary" | "ghost";
    theme?: "liquid" | "organic" | "glass" | "neon";
    size?: "sm" | "md" | "lg";
    glow?: boolean;
    styleConfig?: {
        cornerRadius?: number;
        blur?: number;
        primaryColor?: string;
        glowIntensity?: number;
        fontFamily?: string;
    };
    children: React.ReactNode;
}

export function StitchButton({
    className,
    variant = "primary",
    theme = "liquid",
    size = "md",
    glow = true,
    styleConfig,
    children,
    ...props
}: StitchButtonProps) {

    // Base styles
    const baseStyles = "relative inline-flex items-center justify-center font-medium overflow-hidden transition-all duration-300";

    // Size styles
    const sizeStyles = {
        sm: "px-3 py-1.5 text-xs rounded-lg",
        md: "px-4 py-2 text-sm rounded-xl",
        lg: "px-6 py-3 text-base rounded-2xl",
    };

    // Theme-specific styles
    const getThemeStyles = () => {
        if (theme === "liquid") {
            return cn(
                "bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 backdrop-blur-md",
                "shadow-[0_0_15px_rgba(6,182,212,0.1)]",
                "hover:bg-cyan-400/20 hover:border-cyan-400/50 hover:text-cyan-100",
                "hover:shadow-[0_0_25px_rgba(6,182,212,0.3)]",
                variant === "secondary" && "bg-cyan-900/20 border-cyan-800/30 text-cyan-400/70"
            );
        }
        if (theme === "organic") {
            return cn(
                "bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 backdrop-blur-md",
                "shadow-[0_0_15px_rgba(16,185,129,0.1)] rounded-[20px]", // More rounded for organic
                "hover:bg-emerald-400/20 hover:border-emerald-400/50 hover:text-emerald-100",
                "hover:shadow-[0_0_25px_rgba(16,185,129,0.3)]",
                variant === "secondary" && "bg-emerald-900/20 border-emerald-800/30 text-emerald-400/70"
            );
        }
        if (theme === "neon") {
            return cn(
                "bg-transparent border-2 border-fuchsia-500 text-fuchsia-400",
                "shadow-[0_0_10px_rgba(217,70,239,0.3)]",
                "hover:bg-fuchsia-500/10 hover:shadow-[0_0_20px_rgba(217,70,239,0.5)] hover:text-fuchsia-200"
            );
        }
        // Default Glass
        return cn(
            "bg-white/5 border border-white/10 text-white/80 backdrop-blur-sm",
            "hover:bg-white/10 hover:border-white/20 hover:text-white",
            glow && "hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
        );
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(baseStyles, sizeStyles[size], getThemeStyles(), className)}
            style={{
                borderRadius: styleConfig?.cornerRadius ? `${styleConfig.cornerRadius}px` : undefined,
                backdropFilter: styleConfig?.blur ? `blur(${styleConfig.blur}px)` : undefined,
                fontFamily: styleConfig?.fontFamily,
                // Apply dynamic border/glow if needed, simplified for specific overrides
                ...(styleConfig?.primaryColor ? { borderColor: `${styleConfig.primaryColor}50` } : {})
            }}
            {...props}
        >
            {/* Inner Glow Effect for Liquid/Organic */}
            {(theme === "liquid" || theme === "organic") && (
                <div className={cn(
                    "absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500",
                    "bg-gradient-to-r from-transparent via-white/10 to-transparent",
                    "-translate-x-full hover:animate-shimmer"
                )} />
            )}

            <span className="relative z-10 flex items-center gap-2">
                {children}
            </span>
        </motion.button>
    );
}
