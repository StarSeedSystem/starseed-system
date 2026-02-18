import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface StitchButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
    variant?: "primary" | "secondary" | "ghost";
    theme?: "default" | "liquid" | "organic" | "glass" | "neon" | "brutal";
    size?: "sm" | "md" | "lg" | "xl";
    glow?: boolean;
    styleConfig?: {
        cornerRadius?: number;
        blur?: number;
        primaryColor?: string;
        secondaryColor?: string;
        glowIntensity?: number;
        fontFamily?: string;
        borderWidth?: number;
        focusRingColor?: string;
    };
    children: React.ReactNode;
}

export function StitchButton({
    className,
    variant = "primary",
    theme = "glass",
    size = "md",
    glow = true,
    styleConfig,
    children,
    ...props
}: StitchButtonProps) {

    // Base styles
    const baseStyles = "relative inline-flex items-center justify-center font-medium overflow-hidden transition-all duration-300 isolate";

    // Size styles
    const sizeStyles = {
        sm: "px-3 py-1.5 text-[10px] tracking-tight",
        md: "px-5 py-2.5 text-xs tracking-normal",
        lg: "px-7 py-3.5 text-sm tracking-wide",
        xl: "px-10 py-5 text-base tracking-widest uppercase font-bold",
    };

    // Theme-specific styles
    const getThemeStyles = () => {
        const primary = styleConfig?.primaryColor || "#8B5CF6";
        const secondary = styleConfig?.secondaryColor || "#3B82F6";
        const blur = styleConfig?.blur ?? 12;

        if (theme === "liquid") {
            return cn(
                "text-white shadow-xl group/liquid",
                variant === "primary" ? "bg-gradient-to-br from-white/10 to-white/5" : "bg-white/5",
                "border border-white/20"
            );
        }
        if (theme === "organic") {
            return cn(
                "bg-emerald-500/10 border border-emerald-400/30 text-emerald-300",
                "shadow-[0_0_15px_rgba(16,185,129,0.1)]",
                "hover:bg-emerald-400/20 hover:border-emerald-400/50 hover:text-emerald-100",
            );
        }
        if (theme === "neon") {
            return cn(
                "bg-transparent border-2 text-cyan-400",
                "shadow-[0_0_10px_rgba(34,211,238,0.2)]",
                "hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:text-cyan-200"
            );
        }
        if (theme === "brutal") {
            return cn(
                "bg-white text-black border-2 border-black",
                "shadow-[4px_4px_0px_#000] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
            );
        }
        if (theme === "default") {
            return cn(
                "bg-white text-black hover:bg-white/90 border-transparent",
                "shadow-lg active:shadow-inner"
            );
        }
        // Default Glass
        return cn(
            "bg-white/5 border border-white/10 text-white/80",
            "hover:bg-white/10 hover:border-white/20 hover:text-white",
            glow && "hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]"
        );
    };

    return (
        <motion.button
            whileHover={{
                scale: 1.02,
                y: -1,
                transition: { type: "spring", stiffness: 400, damping: 10 }
            }}
            whileTap={{
                scale: 0.96,
                y: 1,
                rotate: [0, -0.5, 0.5, 0],
                transition: { duration: 0.2 }
            }}
            className={cn(baseStyles, sizeStyles[size], getThemeStyles(), className)}
            style={{
                borderRadius: styleConfig?.cornerRadius ? `${styleConfig.cornerRadius}px` : (theme === "brutal" ? "0px" : "12px"),
                backdropFilter: styleConfig?.blur ? `blur(${styleConfig.blur}px)` : (theme === "glass" || theme === "liquid" ? "blur(16px)" : undefined),
                fontFamily: styleConfig?.fontFamily,
                borderColor: theme === "neon" ? (styleConfig?.focusRingColor || styleConfig?.primaryColor) : undefined,
                borderWidth: styleConfig?.borderWidth,
                boxShadow: (theme !== "brutal" && styleConfig?.focusRingColor) ? `0 0 0 2px ${styleConfig.focusRingColor}44` : undefined,
                ...props.style
            }}
            {...(props as any)}
        >
            {/* Liquid Background Effect */}
            {theme === "liquid" && (
                <>
                    <motion.div
                        className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-rose-500/20 opacity-40"
                        animate={{
                            background: [
                                "radial-gradient(circle at 0% 0%, var(--tw-gradient-from), transparent)",
                                "radial-gradient(circle at 100% 100%, var(--tw-gradient-from), transparent)",
                                "radial-gradient(circle at 0% 0%, var(--tw-gradient-from), transparent)",
                            ]
                        }}
                        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 opacity-0 group-hover/liquid:opacity-100 transition-opacity duration-700 bg-[radial-gradient(circle_at_var(--x,50%)_var(--y,50%),rgba(255,255,255,0.15)_0%,transparent_50%)]" />
                </>
            )}

            {/* Shimmer Effect */}
            {glow && theme !== "brutal" && (
                <div className={cn(
                    "absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-1000",
                    "bg-gradient-to-r from-transparent via-white/[0.05] to-transparent",
                    "-translate-x-full hover:translate-x-full transition-transform duration-1000 ease-in-out"
                )} />
            )}

            <span className="relative z-10 flex items-center gap-2.5">
                {children}
            </span>
        </motion.button>
    );
}

