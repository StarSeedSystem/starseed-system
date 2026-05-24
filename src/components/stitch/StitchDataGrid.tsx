"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getStitchTheme } from "@/styles/stitch-themes";
import { ChevronRight, MoreHorizontal, ArrowUpDown } from "lucide-react";

interface DataColumn {
    id: string;
    label: string;
    width?: string;
    align?: "left" | "center" | "right";
}

interface DataRow {
    id: string;
    [key: string]: any;
}

interface StitchDataGridProps {
    theme: "liquid" | "organic" | "liquid-crystal";
    columns: DataColumn[];
    data: DataRow[];
    className?: string;
    styleConfig?: {
        headerBackground?: string;
        rowHoverBackground?: string;
        borderColor?: string;
        textColor?: string;
        fontFamily?: string;
    };
}

export function StitchDataGrid({
    theme = "liquid",
    columns,
    data,
    className,
    styleConfig
}: StitchDataGridProps) {
    const isLiquid = theme === "liquid";

    return (
        <div className={cn(
            "w-full overflow-hidden border",
            isLiquid && "rounded-xl border-cyan-500/20 bg-slate-900/40",
            theme === "liquid-crystal" && "rounded-2xl crystal-panel",
            theme === "organic" && "rounded-2xl border-emerald-500/20 bg-emerald-950/20",
            className
        )}>
            {/* Header */}
            < div className={
                cn(
                    "flex items-center text-xs uppercase tracking-wider font-medium border-b",
                    isLiquid && "text-cyan-400 border-cyan-500/20 bg-cyan-950/30 backdrop-blur-sm",
                    theme === "liquid-crystal" && "text-white/80 border-white/10 bg-white/5 backdrop-blur-xl",
                    theme === "organic" && "text-emerald-400 border-emerald-500/10 bg-emerald-900/20 backdrop-blur-md"
                )} style={{ fontFamily: styleConfig?.fontFamily }}>
                {
                    columns.map((col) => (
                        <div
                            key={col.id}
                            className={cn("px-4 py-3 flex items-center gap-2", col.align === "right" && "justify-end", col.align === "center" && "justify-center")}
                            style={{ width: col.width || `${100 / columns.length}%` }}
                        >
                            {col.label}
                            <ArrowUpDown className="w-3 h-3 opacity-30 hover:opacity-100 cursor-pointer transition-opacity" />
                        </div>
                    ))
                }
            </div >

            {/* Body */}
            < div className="divide-y" style={{
                borderColor: styleConfig?.borderColor || (isLiquid ? "rgba(34,211,238,0.1)" : theme === "liquid-crystal" ? "rgba(255,255,255,0.05)" : "rgba(52,211,153,0.1)")
            }}>
                {
                    data.map((row) => (
                        <div
                            key={row.id}
                            className={cn(
                                "flex items-center text-sm transition-all duration-200 group cursor-default",
                                isLiquid && "hover:bg-cyan-500/5 hover:shadow-[inset_2px_0_0_0_#22d3ee]",
                                theme === "liquid-crystal" && "hover:bg-white/5 hover:shadow-[inset_2px_0_0_0_rgba(255,255,255,0.5)]",
                                theme === "organic" && "hover:bg-emerald-500/5 hover:translate-x-1"
                            )}
                        >
                            {columns.map((col) => (
                                <div
                                    key={col.id}
                                    className={cn(
                                        "px-4 py-3 text-white/70 group-hover:text-white/90",
                                        col.align === "right" && "text-right",
                                        col.align === "center" && "text-center"
                                    )}
                                    style={{
                                        width: col.width || `${100 / columns.length}%`,
                                        fontFamily: styleConfig?.fontFamily
                                    }}
                                >
                                    {renderCell(row[col.id], theme)}
                                </div>
                            ))}
                        </div>
                    ))
                }
            </div >
        </div >
    );
}

// Helper to render special cell types
function renderCell(value: any, theme: "liquid" | "organic" | "liquid-crystal") {
    if (typeof value === "string" && (value === "Active" || value === "Pending" || value === "Offline" || value === "Online" || value === "Warning")) {
        const colors = {
            Active: theme === "liquid" ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : theme === "liquid-crystal" ? "bg-white/10 text-white border-white/20" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
            Online: theme === "liquid-crystal" ? "bg-white/10 text-white border-white/20" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
            Pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
            Warning: "bg-orange-500/20 text-orange-300 border-orange-500/30",
            Offline: "bg-red-500/20 text-red-300 border-red-500/30"
        };
        return (
            <span className={cn(
                "px-2 py-0.5 rounded text-[10px] uppercase font-bold border",
                colors[value as keyof typeof colors]
            )}>
                {value}
            </span>
        );
    }
    return value;
}
