'use client';

import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, AlertTriangle, Shield, Zap, Activity, Radio, Magnet, Gauge, ZapOff, Info } from "lucide-react";
import { UnifiedSpaceWeather } from "@/modules/weather/services/space/schema";
import { cn } from "@/lib/utils";

interface KpIndexWidgetProps {
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

export const KpIndexWidget: React.FC<KpIndexWidgetProps> = ({ data, loading }) => {
    const currentKp = useMemo(() => {
        if (!data?.kpIndex || data.kpIndex.length === 0) return 3;
        return data.kpIndex[data.kpIndex.length - 1].value;
    }, [data]);

    const history = data?.kpIndex || [];

    const severity = useMemo(() => {
        if (currentKp >= 6) return { color: "text-red-500", label: "G3 Storm", gScale: "G3", tone: "#ef4444" };
        if (currentKp >= 5) return { color: "text-orange-500", label: "G1 Storm", gScale: "G1", tone: "#f97316" };
        if (currentKp >= 4) return { color: "text-yellow-400", label: "Active", gScale: "G0", tone: "#facc15" };
        return { color: "text-emerald-400", label: "Optimal", gScale: "G0", tone: "#10b981" };
    }, [currentKp]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[400px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-emerald-500/30">

            {/* Geomagnetic Flux Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    currentKp >= 5 ? "opacity-30 bg-[radial-gradient(circle_at_50%_30%,#ef444422,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_30%,#10b98122,transparent_70%)]"
                )} />

                {/* Magnetic Field Lines (Aurora Effect) */}
                <svg className="absolute inset-0 w-full h-full opacity-20 filter blur-xl">
                    {[...Array(3)].map((_, i) => (
                        <motion.ellipse
                            key={i}
                            cx="50%" cy="10%" rx="120%" ry="60%"
                            fill="none"
                            stroke={severity.tone}
                            strokeWidth="20"
                            animate={{
                                rx: ["100%", "140%", "100%"],
                                opacity: [0.1, 0.3, 0.1]
                            }}
                            transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
                            style={{ filter: `blur(${40 + i * 10}px)` }}
                        />
                    ))}
                </svg>

                {/* HUD Grid Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[length:30px_30px]" />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border flex items-center justify-center transition-all duration-500 shadow-xl bg-white/[0.03] border-white/10",
                            currentKp >= 5 && "border-red-500/40 text-red-500 shadow-red-500/20"
                        )}>
                            <Magnet className={cn("size-5", currentKp >= 5 && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">G-Magnetosphere.v2</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Planetary K-Index
                                <div className={cn("size-1 rounded-full", currentKp >= 5 ? "bg-red-500 animate-ping" : "bg-emerald-500")} />
                            </span>
                        </div>
                    </div>

                    <div className={cn(
                        "px-3 py-1.5 rounded-lg border backdrop-blur-md text-[9px] font-black tracking-widest flex items-center gap-2",
                        currentKp >= 5 ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-white/5 border-white/10 text-white/40"
                    )}>
                        <Activity className="size-3" />
                        {currentKp >= 6 ? 'STORM EMERGENCY' : currentKp >= 5 ? 'STORM ALERT' : 'QUIET STATUS'}
                    </div>
                </div>

                {/* Main Gauge / Value */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative">
                        {/* Circular HUD Ring */}
                        <svg className="size-56 @md:size-72 -rotate-90 overflow-visible">
                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                            <motion.circle
                                cx="50%" cy="50%" r="45%"
                                fill="none"
                                stroke={severity.tone}
                                strokeWidth="8"
                                strokeDasharray="100 300"
                                initial={{ strokeDashoffset: 300 }}
                                animate={{ strokeDashoffset: 300 - (currentKp / 9) * 300 }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                                strokeLinecap="round"
                                className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                                style={{ filter: `drop-shadow(0 0 8px ${severity.tone}66)` }}
                            />
                            {/* Inner Decoration Ticks */}
                            {[...Array(10)].map((_, i) => (
                                <line
                                    key={i}
                                    x1="50%" y1="6%" x2="50%" y2="2%"
                                    stroke="white" strokeWidth="1" strokeOpacity="0.1"
                                    transform={`rotate(${i * 36}, 50%, 50%)`}
                                />
                            ))}
                        </svg>

                        {/* Centered Large Value */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.span
                                key={currentKp}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={cn("text-[80px] @md:text-[100px] font-black leading-none tracking-tighter text-white drop-shadow-2xl", severity.color)}
                            >
                                {currentKp.toFixed(1)}
                            </motion.span>
                            <span className="text-[10px] font-black tracking-[0.4em] uppercase text-white/40 mt-1">Kp-Index</span>

                            <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 mt-4 flex items-center gap-2">
                                <span className={cn("text-[9px] font-black uppercase text-white/60", severity.color)}>{severity.label}</span>
                                <div className="w-[1px] h-3 bg-white/10" />
                                <span className="text-[9px] font-black uppercase text-white/40">{severity.gScale}</span>
                            </div>
                        </div>
                    </div>

                    {/* Highly Dense 24h Histogram */}
                    <div className="w-full h-16 mt-8 flex items-end gap-[1.5px] px-4 relative">
                        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/5" />
                        {history.map((pt: any, i: number) => {
                            const h = (pt.value / 9) * 100;
                            const isHigh = pt.value >= 5;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(10, h)}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[1px] transition-colors",
                                        isHigh ? "bg-red-500 shadow-[0_0_10px_#ef4444]" : "bg-emerald-500/20"
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Secondary Indicators */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                        { label: 'Shield', val: (Math.max(0, 100 - currentKp * 10)), unit: '%', icon: Shield, color: 'text-emerald-400' },
                        { label: 'Neural', val: (currentKp * 1.2).toFixed(1), unit: 'ψ', icon: Activity, color: 'text-purple-400' },
                        { label: 'G-Induced', val: (currentKp * 2.5).toFixed(1), unit: 'A', icon: Zap, color: 'text-yellow-400' },
                        { label: 'Comm Risk', val: currentKp >= 6 ? 'High' : 'Low', unit: '', icon: Radio, color: 'text-rose-400' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10 group/item">
                            <m.icon className={cn("size-3 mb-2 opacity-40 group-hover/item:opacity-100 transition-opacity", m.color)} />
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[11px] font-black text-white">{m.val}</span>
                                <span className="text-[7px] font-bold text-white/30">{m.unit}</span>
                            </div>
                            <span className="text-[6px] font-black text-white/20 uppercase tracking-widest mt-1 truncate w-full text-center">
                                {m.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Micro-Markers */}
            <div className="absolute top-2 right-2 p-2 opacity-20 pointer-events-none">
                <Info className="size-3 text-white" />
            </div>
        </Card>
    );
};
