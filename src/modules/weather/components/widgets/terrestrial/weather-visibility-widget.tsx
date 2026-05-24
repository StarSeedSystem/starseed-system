'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Eye, EyeOff, Navigation, Search,
    Zap, Sparkles, Binary, Scan,
    Telescope, MoveRight, Layers, Maximize
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherVisibilityWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Opto-Atmospheric Clarity HUD (Distance Projection)
 * - Kinetic Ray-Casting Alpha (Light scattering simulation)
 * - Refractive Index Analysis
 * - Horizon Vector Tracking
 */
export function WeatherVisibilityWidget() {
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
                console.error("Error fetching visibility data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const visibility = data?.visibility || 10000; // in meters
    const visibilityKm = (visibility / 1000).toFixed(1);

    const clarityStatus = useMemo(() => {
        if (visibility >= 10000) return { label: "Crystal Clear", color: "text-cyan-400", level: "Optimal" };
        if (visibility >= 5000) return { label: "Standard Aperture", color: "text-sky-400", level: "Good" };
        if (visibility >= 2000) return { label: "Haze Diffusion", color: "text-amber-400", level: "Reduced" };
        return { label: "Obscured Core", color: "text-red-400", level: "Critical" };
    }, [visibility]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[500px] bg-[#050a14] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-cyan-500/30">

            {/* Opto-Atmospheric Background Shell */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(circle_at_50%_100%,#083344_0%,transparent_100%)] opacity-30" />

                {/* Kinetic Ray-Casting */}
                {[...Array(8)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            x: [-100, 1200],
                            opacity: [0, 0.4, 0]
                        }}
                        transition={{
                            duration: 5 + i,
                            repeat: Infinity,
                            delay: i * 0.5,
                            ease: "linear"
                        }}
                        className="absolute h-px w-64 bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent"
                        style={{ top: `${20 + (i * 10)}%`, transform: 'rotate(-15deg)' }}
                    />
                ))}

                {/* Horizon Gradient */}
                <div className="absolute inset-x-0 top-1/2 -bottom-1/2 bg-gradient-to-b from-transparent via-cyan-950/20 to-black/80" />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            "group-hover:border-cyan-500/40 text-cyan-400"
                        )}>
                            <Eye className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Clarity.System.v9</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Opto-Sync Node
                                <div className="size-1 rounded-full bg-cyan-500 animate-pulse" />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Scan className="size-3 text-cyan-400 opacity-50" />
                        LIDAR_SCAN
                    </div>
                </div>

                {/* Visibility Stage - Kinetic Horizon */}
                <div className="flex-1 flex flex-col items-center justify-center relative py-8">
                    <div className="relative w-full @md:max-w-md aspect-video rounded-[3rem] border border-white/10 bg-black/40 backdrop-blur-3xl overflow-hidden shadow-2xl group-hover:border-cyan-500/20 transition-all duration-700">
                        {/* 3D Depth Grid */}
                        <div
                            className="absolute inset-0 opacity-20"
                            style={{
                                backgroundImage: `linear-gradient(to right, #164e63 1px, transparent 1px), linear-gradient(to bottom, #164e63 1px, transparent 1px)`,
                                backgroundSize: '40px 40px',
                                transform: 'perspective(500px) rotateX(60deg) translateY(100px)'
                            }}
                        />

                        {/* Distance Markers */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="relative flex flex-col items-center">
                                <motion.div
                                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                                    transition={{ duration: 3, repeat: Infinity }}
                                    className="absolute inset-0 -m-8 border border-cyan-500/20 rounded-full blur-sm"
                                />

                                <span className="text-8xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                                    {visibilityKm}
                                </span>
                                <span className="text-sm font-black text-cyan-400 tracking-[0.5em] uppercase mt-2">Kilo_Meters</span>
                            </div>
                        </div>

                        {/* Clarity Alert Pill */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2.5 rounded-2xl bg-black/60 border border-white/10 flex items-center gap-3 backdrop-blur-2xl">
                            <Sparkles className={cn("size-4", clarityStatus.color)} />
                            <div className="flex flex-col">
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Atmos_Clarity</span>
                                <span className={cn("text-xs font-black uppercase tracking-tight", clarityStatus.color)}>{clarityStatus.label}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-Telemetry Grid */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-4 group/data hover:bg-white/[0.07] transition-all">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Refraction</span>
                            <Binary className="size-3 text-cyan-400 opacity-50" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white tracking-tighter uppercase leading-none">1.0003</span>
                            <span className="text-[9px] font-bold text-white/20 uppercase underline decoration-cyan-500/40">Index</span>
                        </div>
                    </div>

                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-4 group/data hover:bg-white/[0.07] transition-all">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Rayleigh_S.</span>
                            <Layers className="size-3 text-indigo-400 opacity-50" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-white tracking-tighter uppercase leading-none">High</span>
                            <span className="text-[9px] font-bold text-white/20 uppercase">SCATTER</span>
                        </div>
                    </div>
                </div>

                {/* Footer Horizon Metrics */}
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {[
                        { label: 'HORIZON', val: '14.2km', icon: MoveRight },
                        { label: 'OPACITY', val: '2.1%', icon: Maximize },
                        { label: 'LIDAR', val: 'ACTIVE', icon: Zap }
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

            {/* Kinetic Scanline */}
            <motion.div
                animate={{ left: ['-10%', '110%'] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent z-40 pointer-events-none shadow-[0_0_20px_rgba(34,211,238,0.5)]"
            />
        </Card>
    );
}
