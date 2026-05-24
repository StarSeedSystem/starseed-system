'use client';

import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Activity, Zap, Info, ShieldAlert, Sparkles, Sun, Timer, TrendingUp, Gauge } from "lucide-react";
import { UnifiedSpaceWeather } from "@/modules/weather/services/space/schema";
import { cn } from "@/lib/utils";

interface FlareWidgetProps {
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

export const XRayFlareWidget: React.FC<FlareWidgetProps> = ({ data, loading }) => {
    const latestFlare = useMemo(() => {
        if (!data?.xRayFlux || data.xRayFlux.length === 0) return { classLabel: "A1.0", flux: 1e-8, time: "00:00" };
        return data.xRayFlux[data.xRayFlux.length - 1];
    }, [data]);

    const flareClass = latestFlare.classLabel.charAt(0);

    const intensity = useMemo(() => {
        switch (flareClass) {
            case 'X': return { factor: 1.0, color: "text-fuchsia-500", glow: "shadow-fuchsia-500/50", label: "Extreme", bg: "bg-fuchsia-500/10" };
            case 'M': return { factor: 0.8, color: "text-rose-500", glow: "shadow-rose-500/40", label: "Strong", bg: "bg-rose-500/10" };
            case 'C': return { factor: 0.5, color: "text-orange-500", glow: "shadow-orange-500/30", label: "Moderate", bg: "bg-orange-500/10" };
            case 'B': return { factor: 0.3, color: "text-blue-500", glow: "shadow-blue-500/20", label: "Minor", bg: "bg-blue-500/10" };
            default: return { factor: 0.1, color: "text-white/40", glow: "", label: "Quiet", bg: "bg-white/5" };
        }
    }, [flareClass]);

    const history = data?.xRayFlux || [];

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[400px] bg-[#03060a] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-fuchsia-500/30">

            {/* Solar Eruption Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    flareClass === 'X' ? "opacity-30 bg-[radial-gradient(circle_at_50%_40%,#d946ef44,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_40%,#3b82f633,transparent_70%)]"
                )} />

                {/* Micro-Grid HUD */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:20px_20px]" />

                {/* Logarithmic Scale Reference */}
                <div className="absolute left-4 top-20 bottom-32 w-[1px] bg-white/5 flex flex-col justify-between py-1 text-[7px] font-black text-white/20 uppercase tracking-tighter">
                    {['X', 'M', 'C', 'B', 'A'].map(l => <span key={l}>{l}</span>)}
                </div>
            </div>

            {/* Main Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header Section */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border flex items-center justify-center transition-all duration-500 shadow-xl",
                            intensity.bg,
                            "border-white/10",
                            flareClass === 'X' && "border-fuchsia-500/40 text-fuchsia-400"
                        )}>
                            <Flame className={cn("size-5", flareClass === 'X' && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">GOES-X-RAY.v2</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                X-Ray Flare
                                <div className={cn("size-1 rounded-full", flareClass === 'X' ? "bg-fuchsia-500 animate-ping" : "bg-blue-400")} />
                            </span>
                        </div>
                    </div>

                    <div className={cn(
                        "px-3 py-1.5 rounded-lg border backdrop-blur-md text-[9px] font-black tracking-widest flex items-center gap-2",
                        flareClass === 'X' ? "bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300" : "bg-white/5 border-white/10 text-white/40"
                    )}>
                        <Activity className="size-3" />
                        {flareClass === 'X' ? 'EXTREME EVENT' : 'NOMINAL FLUX'}
                    </div>
                </div>

                {/* Central Value Visualization */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative mb-6">
                        <motion.div
                            animate={{
                                scale: flareClass === 'X' ? [1, 1.1, 1] : 1,
                                opacity: flareClass === 'X' ? [0.4, 0.7, 0.4] : 0.3
                            }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className={cn(
                                "absolute inset-0 blur-[80px] rounded-full",
                                flareClass === 'X' ? "bg-fuchsia-600" : "bg-blue-600"
                            )}
                        />
                        <div className="relative flex flex-col items-center">
                            <motion.span
                                key={latestFlare.classLabel}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "text-[80px] @md:text-[110px] font-black leading-none tracking-tighter drop-shadow-2xl",
                                    flareClass === 'X' ? "text-fuchsia-400" :
                                        flareClass === 'M' ? "text-rose-400" : "text-white"
                                )}
                            >
                                {latestFlare.classLabel}
                            </motion.span>
                            <div className="flex items-center gap-2 mt-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                                <Sparkles className="size-3 text-fuchsia-400" />
                                <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/60">
                                    {intensity.label} Intensity
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Highly Dense Spectral History */}
                    <div className="w-full h-24 mb-4 flex items-end gap-[2px] px-2 overflow-hidden relative">
                        <div className="absolute inset-x-0 top-0 h-[1px] bg-white/5" />
                        {history.map((pt: any, i: number) => {
                            const val = Math.log10(pt.flux) + 8; // Normalized log scale
                            const h = Math.max(8, val * 12);
                            const isExtreme = pt.classLabel.startsWith('X');
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[1px] transition-all",
                                        isExtreme ? "bg-fuchsia-500 shadow-[0_0_15px_#d946ef]" :
                                            pt.classLabel.startsWith('M') ? "bg-rose-500/80" : "bg-blue-500/20"
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Telemetry Bottom Tray */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: 'Total Flux', val: latestFlare.flux.toExponential(2), unit: 'W/m²', icon: Zap, color: 'text-yellow-400' },
                        { label: 'Last Peak', val: latestFlare.time, unit: 'UTC', icon: Timer, color: 'text-blue-400' },
                        { label: 'Delta', val: '+0.12', unit: 'log', icon: TrendingUp, color: 'text-emerald-400' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10 group/item">
                            <m.icon className={cn("size-3 mb-2 opacity-40 group-hover/item:opacity-100 transition-all", m.color)} />
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[11px] font-black text-white">{m.val}</span>
                                <span className="text-[7px] font-bold text-white/30">{m.unit}</span>
                            </div>
                            <span className="text-[6px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Aesthetic Borders */}
            <div className="absolute top-4 left-4 size-4 border-l border-t border-white/20" />
            <div className="absolute top-4 right-4 size-4 border-r border-t border-white/20" />
            <div className="absolute bottom-4 left-4 size-4 border-l border-b border-white/20" />
            <div className="absolute bottom-4 right-4 size-4 border-r border-b border-white/20" />
        </Card>
    );
};
