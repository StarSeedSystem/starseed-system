import { cn } from "@/lib/utils";
import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "hover" | "active";
    intensity?: "low" | "medium" | "high";
    children: React.ReactNode;
}

export function GlassCard({
    className,
    variant = "default",
    intensity = "medium",
    children,
    ...props
}: GlassCardProps) {

    const intensityStyles = {
        low: "bg-background/20 backdrop-blur-sm border-white/5",
        medium: "bg-background/40 backdrop-blur-md border-white/10",
        high: "bg-background/60 backdrop-blur-xl border-white/20",
    };

    const variantStyles = {
        default: "",
        hover: "hover:bg-background/50 hover:border-white/20 hover:shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)] transition-all duration-300 ease-out hover:-translate-y-1",
        active: "bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]",
    };

    return (
        <div
            className={cn(
                "rounded-xl border shadow-sm relative overflow-hidden group",
                intensityStyles[intensity],
                variantStyles[variant],
                className
            )}
            {...props}
        >
            {/* Iridescent gloss effect on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

            {children}
        </div>
    );
}
