'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Waves, Activity, RadioTower, Database, Zap, Share2, Activity as ActivityIcon, Info, RefreshCw, BarChart4 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function SpaceEnergySchumannWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const wData = await fetchWeatherData(location.lat, location.lon);
            setData(wData);
            setLoading(false);
        };
        loadData();
    }, [location]);

    // Resonance Harmonics (Standard Earth constants)
    const harmonics = [7.83, 14.1, 20.3, 27.3, 33.8];

    const metrics = useMemo(() => {
        if (!data?.energetic?.schumann) return null;
        const s = data.energetic.schumann;
        return {
            current: s.current,
            history: s.history || [],
            isElevated: s.current.status === 'elevated' || s.current.amplitude > 30,
            qFactor: 1.42 + (s.current.fluctuation * 0.5)
        };
    }, [data]);

    if (loading || !metrics) {
        return (
            <Card className="relative overflow-hidden w-full h-full min-h-[300px] bg-[#020508] border border-white/5 rounded-[2rem] flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-teal-500/5 to-transparent opacity-30" />
                <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.4, 0.2] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="size-20 rounded-full border border-teal-500/20"
                />
            </Card>
        );
    }

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[420px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-teal-500/30">

            {/* Liquid Crystal Ionospheric Grid */}
            <div className="absolute inset-0 pointer-events-none">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    metrics.isElevated ? "opacity-30 bg-[radial-gradient(circle_at_50%_50%,#2dd4bf22,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_50%,#3b82f622,transparent_70%)]"
                )} />

                {/* Micro Scanlines */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:100%_4px]" />

                {/* Harmonic Markers */}
                <div className="absolute left-6 top-24 bottom-24 w-[1px] bg-white/10 flex flex-col justify-between py-2 text-[6px] font-black text-white/20 uppercase tracking-tighter">
                    {harmonics.map((h, i) => <span key={i} className="px-2">{h}Hz</span>)}
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border flex items-center justify-center transition-all duration-500 shadow-lg",
                            metrics.isElevated
                                ? "bg-teal-500/10 border-teal-500/40 text-teal-400 shadow-teal-500/20"
                                : "bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-blue-500/10"
                        )}>
                            <RadioTower className={cn("w-5 h-5", metrics.isElevated && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">ELF Ionospherics</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Schumann Resonance
                                <div className={cn("size-1 rounded-full", metrics.isElevated ? "bg-teal-400 animate-pulse" : "bg-blue-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                            <ActivityIcon className="size-3 text-teal-500 animate-pulse" />
                            RES_LIVE
                        </div>
                    </div>
                </div>

                {/* Primary Resonant HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative mb-4">
                        <motion.div
                            animate={{
                                scale: metrics.isElevated ? [1, 1.05, 1] : 1,
                                opacity: [0.3, 0.5, 0.3]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className={cn(
                                "absolute inset-0 blur-3xl rounded-full",
                                metrics.isElevated ? "bg-teal-500" : "bg-blue-500"
                            )}
                        />
                        <div className="relative flex flex-col items-center">
                            <div className="flex items-baseline gap-2">
                                <span className="text-[72px] @md:text-[96px] font-black leading-none tracking-tighter text-white drop-shadow-2xl">
                                    {metrics.current.base_frequency}
                                </span>
                                <span className="text-xl font-black text-teal-500/60">Hz</span>
                            </div>
                            <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mt-2 flex items-center gap-3">
                                <Waves className={cn("size-3.5", metrics.isElevated ? "text-teal-400" : "text-blue-400")} />
                                <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/60">
                                    {metrics.isElevated ? 'High Harmonic' : 'Nominal Flux'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Spectral Visualization Area */}
                    <div className="w-full h-24 mt-6 flex items-end gap-[3px] px-2 overflow-hidden relative">
                        {/* Spectrogram Grid overlay */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />

                        {metrics.history.map((point: any, i: number) => {
                            const isHigh = point.amplitude > 30;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(10, (point.amplitude / 80) * 100)}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[1px] transition-colors duration-500",
                                        isHigh ? "bg-teal-500 shadow-[0_0_15px_#2dd4bf]" : "bg-blue-500/20"
                                    )}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* Quantitative Telemetry Tray */}
                <div className="grid grid-cols-3 gap-2 mt-6">
                    {[
                        { label: 'Amplitude', val: metrics.current.amplitude, unit: 'pT', icon: Zap, color: 'text-yellow-400' },
                        { label: 'Q-Factor', val: metrics.qFactor.toFixed(2), unit: 'δ', icon: BarChart4, color: 'text-teal-400' },
                        { label: 'Fluct', val: metrics.current.fluctuation.toFixed(2), unit: 'Δ', icon: Share2, color: 'text-purple-400' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10 group/item">
                            <m.icon className={cn("size-3 mb-2 opacity-40 group-hover/item:opacity-100 transition-opacity", m.color)} />
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-white">{m.val}</span>
                                <span className="text-[8px] font-bold text-white/30">{m.unit}</span>
                            </div>
                            <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Corner Decorative Elements */}
            <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                <Info className="size-3 text-white" />
            </div>

            {/* HUD Status Bar */}
            <div className="absolute bottom-1 right-8 left-8 h-[1px] bg-white/5">
                <motion.div
                    animate={{ x: ['0%', '100%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-full bg-teal-500/40 blur-[1px]"
                />
            </div>
        </Card>
    );
}
