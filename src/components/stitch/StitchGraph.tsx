"use client";

import React from "react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine
} from "recharts";
import { cn } from "@/lib/utils";
import { getStitchTheme } from "@/styles/stitch-themes";
import type { CanvasState } from "@/components/design-canvas/DesignIntegrationCanvas";

interface StitchGraphProps {
    theme: "liquid" | "organic";
    data?: any[];
    className?: string;
    showGrid?: boolean;
    height?: number;
    colorOverride?: string;
    styleConfig?: {
        fontFamily?: string;
        fontSize?: string;
        gridColor?: string;
        axisColor?: string;
    };
}

const defaultData = [
    { name: '00:00', value: 400, secondary: 240 },
    { name: '04:00', value: 300, secondary: 139 },
    { name: '08:00', value: 200, secondary: 980 },
    { name: '12:00', value: 278, secondary: 390 },
    { name: '16:00', value: 189, secondary: 480 },
    { name: '20:00', value: 239, secondary: 380 },
    { name: '24:00', value: 349, secondary: 430 },
];

const CustomTooltip = ({ active, payload, label, theme }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className={cn(
                "px-3 py-2 rounded-lg border backdrop-blur-md shadow-xl",
                theme === "liquid"
                    ? "bg-slate-900/80 border-cyan-500/30 text-cyan-50"
                    : "bg-emerald-900/80 border-emerald-500/30 text-emerald-50"
            )}>
                <p className="text-xs font-mono mb-1 opacity-70">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} className="text-sm font-bold" style={{ color: entry.color }}>
                        {entry.name === "value" ? "Primary" : "Secondary"}: {entry.value}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export function StitchGraph({
    theme = "liquid",
    data = defaultData,
    className,
    showGrid = true,
    height = 200,
    colorOverride,
    styleConfig
}: StitchGraphProps) {
    const stitchTheme = getStitchTheme(theme === "liquid" ? "stitch-liquid" : "stitch-organic");

    // Theme-specific configuration
    const config = theme === "liquid" ? {
        stroke: colorOverride || "#22d3ee", // Cyan-400
        secondaryStroke: "#a855f7", // Purple-500
        fill: "url(#liquidGradient)",
        secondaryFill: "url(#liquidGradientSecondary)",
        grid: "rgba(34, 211, 238, 0.1)",
        type: "monotone" as const, // Sharp-ish or linear could also work
        activeDot: { r: 6, strokeWidth: 0, fill: "#fff" }
    } : {
        stroke: colorOverride || "#34d399", // Emerald-400
        secondaryStroke: "#facc15", // Yellow-400
        fill: "url(#organicGradient)",
        secondaryFill: "url(#organicGradientSecondary)",
        grid: "rgba(52, 211, 153, 0.1)",
        type: "monotone" as const, // Smooth curves
        activeDot: { r: 4, strokeWidth: 4, stroke: "#34d399", fill: "#064e3b" }
    };

    return (
        <div className={cn("w-full relative", className)} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        {/* Liquid Gradients - Sharp & Techy */}
                        <linearGradient id="liquidGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={config.stroke} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={config.stroke} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="liquidGradientSecondary" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={config.secondaryStroke} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={config.secondaryStroke} stopOpacity={0} />
                        </linearGradient>

                        {/* Organic Gradients - Soft & Natural */}
                        <linearGradient id="organicGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={config.stroke} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={config.stroke} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="organicGradientSecondary" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={config.secondaryStroke} stopOpacity={0.4} />
                            <stop offset="95%" stopColor={config.secondaryStroke} stopOpacity={0.05} />
                        </linearGradient>

                        {/* Filters for Glow Effects */}
                        <filter id="neonGlow" height="130%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                            <feFlood floodColor={config.stroke} floodOpacity="0.5" result="color" />
                            <feComposite in="color" in2="blur" operator="in" result="shadow" />
                            <feMerge>
                                <feMergeNode in="shadow" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {showGrid && (
                        <CartesianGrid
                            strokeDasharray={theme === "liquid" ? "3 3" : "0"}
                            vertical={false}
                            stroke={styleConfig?.gridColor || config.grid}
                        />
                    )}

                    <XAxis
                        dataKey="name"
                        tick={{ fill: styleConfig?.axisColor || 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: styleConfig?.fontFamily }}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                    />
                    <YAxis
                        tick={{ fill: styleConfig?.axisColor || 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: styleConfig?.fontFamily }}
                        axisLine={false}
                        tickLine={false}
                    />

                    <Tooltip content={<CustomTooltip theme={theme} />} cursor={{ stroke: config.grid, strokeWidth: 1 }} />

                    <Area
                        type={config.type}
                        dataKey="value"
                        stroke={config.stroke}
                        strokeWidth={theme === "liquid" ? 2 : 3}
                        fill={config.fill}
                        filter={theme === "liquid" ? "url(#neonGlow)" : undefined}
                        activeDot={config.activeDot}
                        animationDuration={1500}
                    />
                    <Area
                        type={config.type}
                        dataKey="secondary"
                        stroke={config.secondaryStroke}
                        strokeWidth={2}
                        fill={config.secondaryFill}
                        strokeDasharray={theme === "liquid" ? "5 5" : undefined}
                        animationDuration={1500}
                        animationBegin={300}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
