"use client";

import React from "react";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

export function GlobalEnvironment() {
    const { config } = useAppearance();
    const { environment } = config.background;

    if (!environment?.enabled) return null;

    const intensity = environment.intensity ?? 0.5;

    return (
        <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
            {/* Orbs Environment */}
            {environment.type === "orbs" && (
                <div className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: intensity }}>
                    <div className="orb orb-1" />
                    <div className="orb orb-2" />
                    <div className="orb orb-3" />
                </div>
            )}

            {/* Grid Environment */}
            {environment.type === "grid" && (
                <div
                    className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"
                    style={{
                        opacity: intensity * 0.5,
                        maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)"
                    }}
                />
            )}

            {/* Abstract Environment */}
            {environment.type === "abstract" && (
                <div className="absolute inset-0 transition-opacity duration-1000" style={{ opacity: intensity }}>
                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-blob mix-blend-multiply filter" />
                    <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-blob animation-delay-2000 mix-blend-multiply filter" />
                    <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl animate-blob animation-delay-4000 mix-blend-multiply filter" />
                </div>
            )}
        </div>
    );
}
