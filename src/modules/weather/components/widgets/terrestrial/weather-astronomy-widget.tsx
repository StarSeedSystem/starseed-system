'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    MoonStar, Compass, ExternalLink, Sun, Stars,
    Orbit, Sunrise, Sunset, Sparkles, Navigation,
    Milestone, Telescope, Map, MoveUpRight, Zap, Globe
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherAstronomyWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Celestial Mechanics HUD (3D Moon Reconstruction)
 * - Kinetic Starfield Alpha (Parallax simulation)
 * - Zenith & Nadir Vector Tracking
 * - Solar/Lunar Flux Projection
 */
export function WeatherAstronomyWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted && json.astronomical) {
                    setData(json.astronomical);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching astronomy data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const moonPhaseRaw = data?.moon_phase || 0.45;
    const sunrise = data?.sunrise || "06:12";
    const sunset = data?.sunset || "18:45";

    const moonPhaseInfo = useMemo(() => {
        if (moonPhaseRaw < 0.05) return { name: "NEW MOON", color: "text-slate-500", tone: "#64748b" };
        if (moonPhaseRaw < 0.25) return { name: "WAXING CRESCENT", color: "text-indigo-300", tone: "#a5b4fc" };
        if (moonPhaseRaw < 0.45) return { name: "FIRST QUARTER", color: "text-indigo-400", tone: "#818cf8" };
        if (moonPhaseRaw < 0.65) return { name: "FULL MOON", color: "text-white", tone: "#ffffff" };
        return { name: "WANING GIBBOUS", color: "text-indigo-400", tone: "#818cf8" };
    }, [moonPhaseRaw]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[500px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-indigo-500/30">

            {/* Cosmic Background Shell */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#1e1b4b_0%,transparent_100%)] opacity-40" />

                {/* Kinetic Starfield */}
                {[...Array(40)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{
                            opacity: [0.1, 0.8, 0.1],
                            scale: [0.5, 1.2, 0.5],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 5,
                            repeat: Infinity,
                            delay: Math.random() * 10
                        }}
                        className="absolute size-1 bg-white rounded-full blur-[0.5px]"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`,
                            opacity: 0.1 + Math.random() * 0.5
                        }}
                    />
                ))}

                {/* Nebula Pulse */}
                <motion.div
                    animate={{
                        opacity: [0.05, 0.15, 0.05],
                        scale: [1, 1.2, 1]
                    }}
                    transition={{ duration: 20, repeat: Infinity }}
                    className="absolute inset-x-0 -top-1/2 h-full bg-indigo-500/20 blur-[150px] rounded-full"
                />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            "group-hover:border-indigo-500/40 text-indigo-400"
                        )}>
                            <Orbit className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Celestial.Mechanics.v1</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Astra Telemetry Node
                                <div className="size-1 rounded-full bg-indigo-500 animate-pulse" />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Compass className="size-3 text-indigo-400 opacity-50" />
                        ZENITH: 42.1°
                    </div>
                </div>

                {/* Celestial Body HUD - 3D Moon Simulation */}
                <div className="flex-1 flex flex-col items-center justify-center relative py-8">
                    <div className="relative group/celestial">
                        {/* Orbital HUD Rings */}
                        <div className="relative size-64 @md:size-80 flex items-center justify-center">
                            {/* Rotation Indicator */}
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border border-white/5 rounded-full border-dashed opacity-20"
                            />

                            {/* Moon Body Shell */}
                            <div className="relative size-48 @md:size-60 rounded-full bg-slate-900 border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,1)] group-hover/celestial:shadow-[0_0_100px_rgba(99,102,241,0.2)] transition-all duration-700">
                                {/* Surface Detail (Grain) */}
                                <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

                                {/* Volumetric Lighting */}
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_60%)] z-10" />

                                {/* Phase Geometry */}
                                <motion.div
                                    className="absolute inset-0 bg-white"
                                    style={{
                                        clipPath: moonPhaseRaw <= 0.5
                                            ? `circle(100% at ${30 + (moonPhaseRaw * 100)}% 50%)`
                                            : `circle(100% at ${130 - (moonPhaseRaw * 100)}% 50%)`
                                    }}
                                    animate={{ opacity: [0.9, 1, 0.9] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />

                                {/* Crater Shadows */}
                                <div className="absolute top-1/4 left-1/3 size-12 rounded-full bg-black/40 blur-lg" />
                                <div className="absolute bottom-1/3 right-1/4 size-16 rounded-full bg-black/30 blur-xl" />
                            </div>

                            {/* Phase Label HUD */}
                            <div className="absolute -bottom-4 px-6 py-2 rounded-2xl bg-black/60 border border-white/10 backdrop-blur-3xl flex flex-col items-center shadow-2xl">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-1 leading-none">Lunar Mode</span>
                                <span className={cn("text-lg font-black tracking-tight uppercase leading-none", moonPhaseInfo.color)}>
                                    {moonPhaseInfo.name}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Astral Flux Grid */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-4 group/solar hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sunrise className="size-4 text-orange-400" />
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Ignition</span>
                            </div>
                            <span className="text-sm font-black text-white/40">AM</span>
                        </div>
                        <div className="text-4xl font-black text-white tracking-tighter">{sunrise}</div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: '85%' }}
                                className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                            />
                        </div>
                    </div>

                    <div className="p-5 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col gap-4 group/lunar hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sunset className="size-4 text-indigo-400" />
                                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Descent</span>
                            </div>
                            <span className="text-sm font-black text-white/40">PM</span>
                        </div>
                        <div className="text-4xl font-black text-white tracking-tighter">{sunset}</div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: '65%' }}
                                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                            />
                        </div>
                    </div>
                </div>

                {/* Sub-Telemetry Cluster */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                        { label: 'Visib.', val: '99%', icon: Sparkles, color: 'text-yellow-400' },
                        { label: 'Azimuth', val: '284°', icon: Navigation, color: 'text-indigo-400' },
                        { label: 'Flux', val: '1.2k', icon: Zap, color: 'text-cyan-400' }
                    ].map((m, i) => (
                        <div key={i} className="py-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center">
                            <m.icon className={cn("size-3 mb-1.5 opacity-50", m.color)} />
                            <span className="text-[11px] font-black text-white tracking-widest">{m.val}</span>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-tighter">{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Kinetic Horizon Sweep */}
            <motion.div
                animate={{ left: ['-10%', '110%'] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent z-40 pointer-events-none"
            />
        </Card>
    );
}
