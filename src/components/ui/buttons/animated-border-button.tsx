"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

interface AnimatedBorderButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    variant?: "default" | "neon" | "liquid";
}

export function AnimatedBorderButton({ children, className, variant, ...props }: AnimatedBorderButtonProps) {
    const { config } = useAppearance();

    // Only apply if the global setting matches or if explicitly requested via variant
    // If variant is unset, we check global config buttons.style
    const activeStyle = variant || config.buttons.style;

    if (activeStyle === "neon") {
        return (
            <button
                className={cn(
                    "relative inline-flex h-12 overflow-hidden rounded-full p-[1px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50",
                    className
                )}
                {...props}
            >
                <span className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)]" />
                <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-slate-950 px-6 py-1 text-sm font-medium text-white backdrop-blur-3xl transition-all hover:bg-slate-900/90">
                    {children}
                </span>
            </button>
        );
    }

    // Fallback to standard request for "default" or other types for now, 
    // unless we implement the SVG specific logic here.
    // The reference "contorno-animado.html" had SVG paths. Let's adapt that specific style as a "Liquid" variant.

    if (activeStyle === "liquid") {
        return (
            <div className={cn("relative group cursor-pointer", className)}>
                <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-violet-600 rounded-lg blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <button
                    className="relative px-7 py-4 bg-black rounded-lg leading-none flex items-center divide-x divide-gray-600 text-gray-200 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    {...props}
                >
                    <span className="pl-0 pr-4">{children}</span>
                </button>
            </div>
        )
    }

    // Default Shadcn-like button (simplified)
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                "bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2",
                config.buttons.glow && "shadow-[0_0_15px_rgba(var(--primary),0.5)]",
                className
            )}
            style={{ borderRadius: `${config.buttons.radius}rem` }}
            {...props}
        >
            {children}
        </button>
    );
}
