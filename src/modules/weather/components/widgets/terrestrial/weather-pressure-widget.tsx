'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Gauge, Activity, ArrowUpRight, ArrowDownRight,
    Wind, Waves, Zap, Info, ShieldAlert,
    ChevronUp, ChevronDown, MoveHorizontal
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherPressureWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Barometric Compression HUD (Glass Pulsation)
 * - Kinetic Density Waveform (Sine alignment)
 * - MSL (Mean Sea Level) Sync Status
 * - Atmospheric Stability Matrix
 */
export function WeatherPressureWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted && json.terrestrial) {
                    setData(json.terrestrial.current);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching pressure data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const pressure = data?.surface_pressure || 1013.25;
    const trend = useMemo(() => {
        if (pressure > 1020) return { label: "High Pressure Shell", color: "text-sky-400", bg: "bg-sky-500/10", icon: ShieldAlert };
        if (pressure < 1005) return { label: "Low Pressure Core", color: "text-amber-400", bg: "bg-amber-500/10", icon: Wind };
        return { label: "Stability Matrix", color: "text-emerald-400", bg: "bg-emerald-500/10", icon: Activity };
    }, [pressure]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[500px] bg-[#020810] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-sky-500/30">

            {/* Atmospheric Density Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,#0c4a6e_0%,transparent_100%)] opacity-30" />

                {/* Kinetic Compression Particles */}
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -20, 0],
                            opacity: [0.1, 0.3, 0.1],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            duration: 3 + Math.random() * 4,
                            repeat: Infinity,
                            delay: Math.random() * 5
                        }}
                        className="absolute w-px h-12 bg-sky-500/20"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`
                        }}
                    />
                ))}

                {/* Density Waveform */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-10">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 100">
                        <motion.path
                            animate={{
                                d: [
                                    "M0 50 Q 250 20 500 50 T 1000 50 V 100 H 0 Z",
                                    "M0 50 Q 250 80 500 50 T 1000 50 V 100 H 0 Z",
                                    "M0 50 Q 250 20 500 50 T 1000 50 V 100 H 0 Z"
                                ]
                            }}
                            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                            fill="#0ea5e9"
                        />
                    </svg>
                </div>
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            "group-hover:border-sky-500/40 text-sky-400"
                        )}>
                            <Gauge className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Barometric.Sensor.v7</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                ATMOS CRYO_HUD
                                <div className="size-1 rounded-full bg-sky-500 animate-pulse" />
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                            <Zap className="size-3 text-sky-400 opacity-50" />
                            MSL SYNC
                        </div>
                    </div>
                </div>

                {/* Pressure Compression HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative py-8">
                    <div className="relative group/pressure">
                        {/* Compression Rings */}
                        <div className="absolute inset-0 -m-8 border border-white/5 rounded-full" />
                        <motion.div
                            animate={{ scale: [1, 1.05, 1], rotate: [0, 90, 0] }}
                            transition={{ duration: 10, repeat: Infinity }}
                            className="absolute inset-0 -m-12 border border-sky-500/10 rounded-full border-dashed"
                        />

                        {/* Central Readout Card */}
                        <div className="relative size-64 @md:size-80 rounded-[4rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 backdrop-blur-3xl flex flex-col items-center justify-center shadow-2xl overflow-hidden">
                            {/* Glass Refraction Effect */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/10 via-transparent to-white/5" />

                            {/* Floating Unit Label */}
                            <motion.div
                                animate={{ y: [0, -5, 0] }}
                                transition={{ duration: 4, repeat: Infinity }}
                                className="mb-2 px-3 py-1 rounded-full bg-sky-500/20 border border-sky-500/30 text-[10px] font-black text-sky-300 tracking-[0.3em] uppercase"
                            >
                                Hecto_Pascals
                            </motion.div>

                            <motion.span
                                key={pressure}
                                initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                className="text-7xl @md:text-8xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                            >
                                {Math.round(pressure)}
                            </motion.span>

                            {/* Stability trend indicator */}
                            <div className={cn(
                                "mt-6 px-4 py-2 rounded-2xl flex items-center gap-3 border border-white/5 backdrop-blur-md transition-all duration-500",
                                trend.bg
                            )}>
                                <trend.icon className={cn("size-4", trend.color)} />
                                <span className={cn("text-xs font-black tracking-widest uppercase", trend.color)}>
                                    {trend.label}
                                </span>
                            </div>
                        </div>

                        {/* Kinetic Compass Dial (Small) */}
                        <motion.div
                            animate={{ rotate: pressure }}
                            className="absolute -right-4 top-1/2 -translate-y-1/2 size-16 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl p-3 flex flex-col items-center justify-center opacity-0 group-hover/pressure:opacity-100 transition-opacity"
                        >
                            <span className="text-[8px] font-black text-white/40 uppercase mb-1">ISO</span>
                            <div className="size-1 rounded-full bg-sky-400" />
                        </motion.div>
                    </div>
                </div>

                {/* Sub-Telemetry Cluster */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/data hover:bg-white/[0.06] transition-all">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Stability.Index</span>
                            <ArrowUpRight className="size-3 text-emerald-400 opacity-50" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white tracking-tighter uppercase leading-none">+0.42</span>
                            <span className="text-[9px] font-bold text-white/20 uppercase">MB/hr</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full w-2/3 bg-emerald-500/40" />
                        </div>
                    </div>

                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/data hover:bg-white/[0.06] transition-all">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Density.Core</span>
                            <Waves className="size-3 text-sky-400 opacity-50" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white tracking-tighter uppercase leading-none">1.22</span>
                            <span className="text-[9px] font-bold text-white/20 uppercase">KG/M³</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full w-1/2 bg-sky-500/40" />
                        </div>
                    </div>
                </div>

                {/* Footer Micro-metrics */}
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {[
                        { label: 'MSL_ALT', val: '42m', icon: ChevronUp },
                        { label: 'BARO_REF', val: '1013.2', icon: MoveHorizontal },
                        { label: 'CALIB_ST', val: '98%', icon: Zap }
                    ].map((m, i) => (
                        <div key={i} className="flex-shrink-0 px-4 py-2.5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                            <m.icon className="size-3 text-white/20" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-white tracking-tight leading-none">{m.val}</span>
                                <span className="text-[7px] font-black text-white/20 uppercase tracking-tighter">{m.label}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Kinetic Scan Beam */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent z-40 pointer-events-none"
            />
        </Card>
    );
}
