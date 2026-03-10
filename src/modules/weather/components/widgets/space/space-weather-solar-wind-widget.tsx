'use client';

import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, Thermometer, Database, Zap, ArrowRight, Gauge, Radio, Info, Activity, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedSpaceWeather } from "@/modules/weather/services/space/schema";

interface SolarWindWidgetProps {
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

export const SolarWindWidget: React.FC<SolarWindWidgetProps> = ({ data, loading }) => {
    const windSpeed = data?.solarWind?.speed || 420.5;
    const density = data?.solarWind?.density || 5.2;
    const temp = data?.solarWind?.temperature || 120500;
    const bz = data?.solarWind?.bz || -2.4;
    const phi = data?.solarWind?.phi || 135; // Parker spiral angle

    const speedNormalized = Math.max(0.2, Math.min(3, windSpeed / 400));

    const severity = useMemo(() => {
        if (windSpeed > 600 || bz < -10) return { color: "text-red-500", label: "STORM EVENT", tone: "#ef4444" };
        if (windSpeed > 500 || bz < -5) return { color: "text-orange-500", label: "ACTIVE STREAM", tone: "#f97316" };
        return { color: "text-amber-400", label: "NOMINAL FLOW", tone: "#fbbf24" };
    }, [windSpeed, bz]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[400px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-orange-500/30">

            {/* Plasma Stream Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    windSpeed > 500 ? "opacity-20 bg-[radial-gradient(circle_at_20%_50%,#f9731622,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_20%_50%,#fbbf2411,transparent_70%)]"
                )} />

                {/* Kinetic Particle Flow */}
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ x: "-20%", opacity: 0 }}
                        animate={{
                            x: "120%",
                            opacity: [0, 0.4, 0],
                            scale: [0.5, 1, 0.5]
                        }}
                        transition={{
                            duration: (2 + Math.random() * 3) / speedNormalized,
                            repeat: Infinity,
                            ease: "linear",
                            delay: Math.random() * 5
                        }}
                        className="absolute h-[1px] bg-gradient-to-r from-transparent via-orange-400 to-transparent blur-[0.5px]"
                        style={{
                            top: `${Math.random() * 100}%`,
                            width: `${150 + Math.random() * 300}px`,
                        }}
                    />
                ))}

                {/* Turbulent Heat Blobs */}
                <motion.div
                    animate={{
                        opacity: [0.05, 0.1, 0.05],
                        scale: [1, 1.2, 1],
                        x: ["-10%", "10%"]
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_0%_50%,#f9731633,transparent_60%)] filter blur-3xl"
                />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            windSpeed > 500 ? "text-orange-500 border-orange-500/40" : "text-amber-400"
                        )}>
                            <Flame className={cn("size-5", windSpeed > 500 && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Kinetic.Plasma.v4</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Solar Wind
                                <div className={cn("size-1 rounded-full", windSpeed > 500 ? "bg-orange-500 animate-ping" : "bg-amber-400")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Radio className="size-3 text-orange-500" />
                        L1: DSCOVR_SAT
                    </div>
                </div>

                {/* Main Velocity HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative group/speed">
                        {/* Speed Circle Gauge */}
                        <svg className="size-64 @md:size-72 -rotate-90 overflow-visible">
                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                            <motion.circle
                                cx="50%" cy="50%" r="45%"
                                fill="none"
                                stroke={severity.tone}
                                strokeWidth="12"
                                strokeDasharray="100 300"
                                initial={{ strokeDashoffset: 300 }}
                                animate={{ strokeDashoffset: 300 - (Math.min(windSpeed, 1000) / 1000) * 300 }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                strokeLinecap="round"
                                style={{ filter: `drop-shadow(0 0 10px ${severity.tone}66)` }}
                            />
                            {/* Segmented Ticks */}
                            {[...Array(20)].map((_, i) => (
                                <line
                                    key={i}
                                    x1="50%" y1="8%" x2="50%" y2="2%"
                                    stroke="white" strokeWidth="1" strokeOpacity="0.05"
                                    transform={`rotate(${i * 18}, 50%, 50%)`}
                                />
                            ))}
                        </svg>

                        {/* Centered Speed Value */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.span
                                key={windSpeed}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-[80px] @md:text-[100px] font-black leading-none tracking-tighter text-white"
                            >
                                {windSpeed.toFixed(0)}
                            </motion.span>
                            <span className="text-[12px] font-black tracking-[0.4em] uppercase text-white/40 -mt-2">Velocity km/s</span>

                            <div className={cn(
                                "mt-4 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase",
                                windSpeed > 500 ? "bg-orange-500/20 border-orange-500/40 text-orange-300" : "bg-white/5 border-white/10 text-white/40"
                            )}>
                                {severity.label}
                            </div>
                        </div>

                        {/* IMF Vector HUD Mini-Orbital */}
                        <div className="absolute -right-8 top-0 p-4 rounded-full border border-white/10 bg-[#020508]/80 backdrop-blur-xl shadow-2xl flex flex-col items-center border-dashed">
                            <div className="relative size-12 flex items-center justify-center">
                                <div className="absolute inset-0 rounded-full border border-white/10 flex items-center justify-center">
                                    <div className="size-1 bg-white/20 rounded-full" />
                                </div>
                                <motion.div
                                    animate={{ rotate: phi }}
                                    className="absolute inset-1 border-t-2 border-orange-500 rounded-full"
                                />
                                <ArrowRight className="size-3 text-white/20" style={{ transform: `rotate(${phi}deg)` }} />
                            </div>
                            <span className="text-[6px] font-black text-white/30 uppercase tracking-widest mt-1">IMF Φ Angle</span>
                        </div>
                    </div>
                </div>

                {/* Sub-Telemetry Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: 'Density', val: density.toFixed(2), unit: 'p/cm³', icon: Database, color: 'text-blue-400' },
                        { label: 'Temperature', val: (temp / 1000).toFixed(1), unit: 'kK', icon: Thermometer, color: 'text-red-400' },
                        { label: 'IMF Bz', val: bz.toFixed(1), unit: 'nT', icon: Gauge, color: bz < -5 ? 'text-red-500' : 'text-emerald-400' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10">
                            <m.icon className={cn("size-3 mb-2 opacity-50", m.color)} />
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[11px] font-black text-white">{m.val}</span>
                                <span className="text-[7px] font-bold text-white/30">{m.unit}</span>
                            </div>
                            <span className="text-[6px] font-black text-white/20 uppercase tracking-widest mt-1 text-center w-full">
                                {m.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Shock Indicator */}
                <div className="mt-4 flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg border",
                            windSpeed > 600 ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-white/5 text-white/20 border-white/5"
                        )}>
                            <Activity className="size-3" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Dynamics Monitor</span>
                            <span className="text-[10px] font-black text-white uppercase">{windSpeed > 600 ? 'SHOCK FRONT DETECTED' : 'STEADY FLOW'}</span>
                        </div>
                    </div>
                    <div className="size-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                </div>
            </div>

            {/* Micro-Markers */}
            <div className="absolute top-2 right-2 p-2 opacity-20 pointer-events-none">
                <Info className="size-3 text-white" />
            </div>
        </Card>
    );
};
