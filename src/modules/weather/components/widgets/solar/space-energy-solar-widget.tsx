'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Sun, Activity, Zap, ShieldAlert, Target, Globe, Radiation, Wind, Thermometer, Waves, Timer, Orbit, Gauge } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function SpaceEnergySolarWidget() {
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

    // Extracted and derived metrics
    const metrics = useMemo(() => {
        if (!data) return null;

        const solar = data.solar || {};
        const energetic = data.energetic?.solar_activity || {};
        const interplanetary = data.interplanetary || {};

        return {
            ssn: solar.sunspot_number || 0,
            sfi: solar.solar_flux_index || 0,
            xray: solar.x_ray_flux?.current_class || 'A0.0',
            flare: energetic.flare_class || 'Quiet',
            cme_speed: energetic.cme_speed_kms || 0,
            proton: interplanetary.proton_density || 0,
            temp: interplanetary.plasma_temperature || 0,
            isCrisis: (energetic.cme_active || (energetic.flare_class && energetic.flare_class.startsWith('X')))
        };
    }, [data]);

    if (loading || !metrics) {
        return (
            <Card className="relative overflow-hidden w-full h-full min-h-[300px] bg-[#020408] border border-white/5 rounded-[2rem] flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent opacity-50" />
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="relative size-20 rounded-full border border-dashed border-orange-500/20 flex items-center justify-center"
                >
                    <Sun className="w-8 h-8 text-orange-500/40 animate-pulse" />
                </motion.div>
            </Card>
        );
    }

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[400px] bg-[#020408] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-orange-500/30">

            {/* Liquid Crystal Background Layer */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 bg-gradient-to-tr transition-colors duration-1000 opacity-20",
                    metrics.isCrisis ? "from-red-900/40 via-transparent to-transparent" : "from-orange-900/30 via-transparent to-transparent"
                )} />

                {/* Orbital Hud Rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] opacity-10">
                    {[...Array(3)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                            transition={{ duration: 20 + i * 10, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 rounded-full border border-white/[0.05]"
                            style={{ margin: `${i * 60}px` }}
                        />
                    ))}
                </div>

                {/* Plasma Filaments */}
                <svg className="absolute inset-0 w-full h-full opacity-20 mix-blend-screen">
                    <defs>
                        <filter id="plasma-glow-solar">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>
                    {[...Array(3)].map((_, i) => (
                        <motion.path
                            key={i}
                            d={`M -100 ${200 + i * 100} Q ${200} ${150 + i * 50} 800 ${250 + i * 80}`}
                            stroke={metrics.isCrisis ? "#ef4444" : "#f97316"}
                            strokeWidth="1"
                            fill="none"
                            filter="url(#plasma-glow-solar)"
                            animate={{
                                d: [
                                    `M -100 ${200 + i * 100} Q ${200 + Math.random() * 100} ${150 + i * 50} 800 ${250 + i * 80}`,
                                    `M -100 ${250 + i * 100} Q ${300 + Math.random() * 100} ${200 + i * 50} 800 ${200 + i * 80}`,
                                    `M -100 ${200 + i * 100} Q ${200 + Math.random() * 100} ${150 + i * 50} 800 ${250 + i * 80}`
                                ]
                            }}
                            transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                    ))}
                </svg>
            </div>

            {/* Main Interface Layout */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Compact Header HUD */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border flex items-center justify-center transition-all duration-500 shadow-lg",
                            metrics.isCrisis
                                ? "bg-red-500/10 border-red-500/40 text-red-500 shadow-red-500/20"
                                : "bg-orange-500/10 border-orange-500/30 text-orange-500 shadow-orange-500/10"
                        )}>
                            <Sun className={cn("w-5 h-5", metrics.isCrisis && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Heliosphere v3.0</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Solar Telemetry
                                <div className="size-1 rounded-full bg-orange-500 animate-ping" />
                            </span>
                        </div>
                    </div>

                    <div className={cn(
                        "px-3 py-1.5 rounded-lg border backdrop-blur-md text-[9px] font-black tracking-[0.2em] flex items-center gap-2",
                        metrics.isCrisis ? "bg-red-500/20 border-red-500/40 text-red-400" : "bg-white/5 border-white/10 text-white/40"
                    )}>
                        {metrics.isCrisis ? <ShieldAlert className="size-3" /> : <Activity className="size-3" />}
                        {metrics.isCrisis ? 'CRITICAL EVENT' : 'NOMINAL'}
                    </div>
                </div>

                {/* Center Core Visualization */}
                <div className="flex-1 relative flex items-center justify-center py-2">
                    <div className="relative">
                        {/* Sun Surface */}
                        <motion.div
                            animate={{ scale: [1, 1.02, 1] }}
                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            className={cn(
                                "relative size-32 @md:size-44 rounded-full transition-all duration-1000 shadow-[0_0_100px_rgba(249,115,22,0.3)]",
                                metrics.isCrisis
                                    ? "bg-gradient-to-br from-orange-400 via-red-600 to-black"
                                    : "bg-gradient-to-br from-yellow-300 via-orange-500 to-[#1a0a00]"
                            )}
                        >
                            {/* Inner Info Overlay */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-1">X-Flux</span>
                                <span className={cn(
                                    "text-2xl @md:text-4xl font-black tracking-tighter drop-shadow-md transition-colors",
                                    metrics.xray.startsWith('X') ? "text-red-400" : "text-white"
                                )}>
                                    {metrics.xray}
                                </span>
                            </div>

                            {/* Dynamic Spots */}
                            {[...Array(6)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                                    transition={{ duration: 3 + i, repeat: Infinity }}
                                    className="absolute size-1.5 bg-black/50 rounded-full blur-[1.5px]"
                                    style={{
                                        top: `${25 + Math.random() * 50}%`,
                                        left: `${25 + Math.random() * 50}%`,
                                    }}
                                />
                            ))}
                        </motion.div>

                        {/* Interactive HUD Gauges around Sun */}
                        <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[250%] opacity-20 pointer-events-none overflow-visible">
                            <circle cx="50%" cy="50%" r="48%" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2 10" />
                            <circle cx="50%" cy="50%" r="52%" fill="none" stroke="orange" strokeWidth="1" strokeDasharray="100 200" className="animate-[spin_40s_linear_infinite]" />
                        </svg>
                    </div>

                    {/* Left/Right Critical Stats */}
                    <div className="absolute inset-0 flex items-center justify-between px-2 @md:px-4 pointer-events-none">
                        <div className="flex flex-col gap-6">
                            {[
                                { label: 'SSN', val: metrics.ssn, icon: Target, color: 'text-orange-400' },
                                { label: 'SFI', val: metrics.sfi, icon: Activity, color: 'text-yellow-400' }
                            ].map((s, i) => (
                                <motion.div key={i} className="flex flex-col items-start bg-black/40 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <s.icon className={cn("size-3", s.color)} />
                                        <span className="text-[7px] font-bold text-white/30 tracking-[0.2em] uppercase">{s.label}</span>
                                    </div>
                                    <span className="text-[14px] font-black text-white leading-none">{s.val}</span>
                                </motion.div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-6 items-end">
                            {[
                                { label: 'PROTON', val: metrics.proton, icon: Radiation, color: 'text-rose-400' },
                                { label: 'CME VEL', val: metrics.cme_speed, icon: Waves, color: 'text-blue-400' }
                            ].map((s, i) => (
                                <motion.div key={i} className="flex flex-col items-end bg-black/40 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="text-[7px] font-bold text-white/30 tracking-[0.2em] uppercase">{s.label}</span>
                                        <s.icon className={cn("size-3", s.color)} />
                                    </div>
                                    <span className="text-[14px] font-black text-white leading-none">{s.val}</span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Data Grid */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                        { icon: Wind, val: metrics.cme_speed, unit: 'km/s', label: 'Wind Vel' },
                        { icon: Thermometer, val: (metrics.temp / 1000).toFixed(1), unit: 'kK', label: 'Plasma T' },
                        { icon: Timer, val: metrics.flare, unit: '', label: 'Coronal' },
                        { icon: Gauge, val: metrics.proton, unit: 'p/cm³', label: 'Density' }
                    ].map((m, i) => (
                        <div key={i} className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center transition-all hover:bg-white/[0.08] hover:border-white/10">
                            <m.icon className="size-3 text-white/40 mb-2" />
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[12px] font-black text-white">{m.val}</span>
                                <span className="text-[7px] font-bold text-white/40">{m.unit}</span>
                            </div>
                            <span className="text-[6px] font-black text-white/20 uppercase tracking-widest mt-1 truncate w-full text-center">
                                {m.label}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Micro-HUD Markers */}
            <div className="absolute top-4 left-4 size-4 border-l border-t border-white/20" />
            <div className="absolute top-4 right-4 size-4 border-r border-t border-white/20" />
            <div className="absolute bottom-4 left-4 size-4 border-l border-b border-white/20" />
            <div className="absolute bottom-4 right-4 size-4 border-r border-b border-white/20" />
        </Card>
    );
}
