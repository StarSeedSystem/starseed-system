"use client";

/**
 * ── BadgeRing — Anillo de progreso SVG para insignias ────────────────────────
 * Anillo circular con pista + progreso coloreado y el icono de la insignia en el
 * centro. Accesible (role=img + aria-label). Transiciones 150-300ms.
 */

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BadgeRing({
    icon: Icon,
    progressPct,
    color,
    size = 76,
    stroke = 6,
    dim = false,
    ariaLabel,
}: {
    icon: LucideIcon;
    progressPct: number;
    color: string;
    size?: number;
    stroke?: number;
    dim?: boolean;
    ariaLabel?: string;
}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, progressPct));
    const offset = c * (1 - pct / 100);
    const center = size / 2;

    return (
        <div
            className="relative shrink-0"
            style={{ width: size, height: size }}
            role="img"
            aria-label={ariaLabel}
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden>
                <circle
                    cx={center} cy={center} r={r}
                    fill="none" stroke="currentColor"
                    className="text-white/10"
                    strokeWidth={stroke}
                />
                <circle
                    cx={center} cy={center} r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    style={{
                        transition: "stroke-dashoffset 300ms cubic-bezier(0.4,0,0.2,1)",
                        filter: dim ? "none" : `drop-shadow(0 0 6px ${color}66)`,
                    }}
                />
            </svg>
            <span
                className={cn(
                    "absolute inset-0 grid place-items-center transition-opacity duration-200",
                    dim ? "opacity-45" : "opacity-100",
                )}
            >
                <Icon className="h-6 w-6" style={{ color: dim ? "#94a3b8" : color }} />
            </span>
        </div>
    );
}

export default BadgeRing;
