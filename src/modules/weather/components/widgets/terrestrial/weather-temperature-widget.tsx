'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Thermometer, ThermometerSnowflake, ThermometerSun,
    Sparkles, Droplets, AlertCircle, ExternalLink,
    ArrowUp, ArrowDown, MapPin, Activity, ShieldCheck, Info, Flame, Waves
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherTemperatureWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Thermal Flux HUD (Molecular Resonance)
 * - Homeostatic Efficiency Index
 * - Kinetic Heat/Cold Aura Shimmer
 * - High-Precision Thermal Telemetry
 */
export function WeatherTemperatureWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted && json.terrestrial) {
                    setData(json.terrestrial);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const currentTemp = data?.current?.temperature_2m ?? 24.5;
    const feelsLike = data?.current?.apparent_temperature ?? 26.2;
    const dailyMin = data?.daily?.temperature_2m_min?.[0] ?? 18.4;
    const dailyMax = data?.daily?.temperature_2m_max?.[0] ?? 31.1;

    // Homeostatic Efficiency (Ideal: 22°C)
    const efficiency = Math.max(0, 100 - Math.abs(currentTemp - 22) * 4);

    const thermalStatus = useMemo(() => {
        if (currentTemp >= 30) return { id: 'hyper', label: 'Hyperthermal', color: 'text-orange-400', tone: '#f97316', icon: Flame, desc: 'High kinetic energy' };
        if (currentTemp <= 12) return { id: 'hypo', label: 'Hypothermal', color: 'text-blue-400', tone: '#3b82f6', icon: ThermometerSnowflake, desc: 'Low molecular motion' };
        return { id: 'homeo', label: 'Homeostatic', color: 'text-emerald-400', tone: '#10b981', icon: Activity, desc: 'Optimal equilibrium' };
    }, [currentTemp]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[450px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-emerald-500/30">

            {/* Thermal Flux Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    thermalStatus.id === 'hyper' ? "opacity-20 bg-[radial-gradient(circle_at_50%_40%,#f9731611,transparent_70%)]" :
                        thermalStatus.id === 'hypo' ? "opacity-20 bg-[radial-gradient(circle_at_50%_40%,#3b82f611,transparent_70%)]" :
                            "opacity-10 bg-[radial-gradient(circle_at_50%_40%,#10b98111,transparent_70%)]"
                )} />

                {/* Kinetic Molecular Particles */}
                {[...Array(15)].map((_, i) => (
                    <motion.div
                        key={i}
                        className={cn("absolute rounded-full blur-[1px]", thermalStatus.color.replace('text-', 'bg-') + '/20')}
                        style={{
                            width: 3 + Math.random() * 5,
                            height: 3 + Math.random() * 5,
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`
                        }}
                        animate={{
                            y: [0, -30, 0],
                            x: [0, 15, 0],
                            scale: [1, 1.2, 1],
                            opacity: [0.1, 0.4, 0.1]
                        }}
                        transition={{
                            duration: (thermalStatus.id === 'hyper' ? 2 : thermalStatus.id === 'hypo' ? 8 : 4) + Math.random() * 5,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                ))}

                {/* Heat Wave Shimmer Overlay */}
                <motion.div
                    animate={{
                        opacity: [0.05, 0.1, 0.05],
                        scale: [1, 1.1, 1],
                        y: ["-5%", "5%"]
                    }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.03),transparent_50%)]"
                />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            "group-hover:border-emerald-500/40 text-emerald-400"
                        )}>
                            <thermalStatus.icon className={cn("size-5", thermalStatus.id === 'hyper' && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Thermal.Resonance.v2</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Temperature Node
                                <div className={cn("size-1 rounded-full", thermalStatus.id === 'hyper' ? "bg-orange-500 animate-ping" : "bg-emerald-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Waves className="size-3 text-emerald-500" />
                        FLUX: {currentTemp > 25 ? 'High' : 'Normal'}
                    </div>
                </div>

                {/* Main Temperature HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative group/temp">
                        {/* Thermal Orbital Ring */}
                        <svg className="size-64 @md:size-72 -rotate-90 overflow-visible">
                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                            <motion.circle
                                cx="50%" cy="50%" r="45%"
                                fill="none"
                                stroke={thermalStatus.tone}
                                strokeWidth="12"
                                strokeDasharray="100 300"
                                initial={{ strokeDashoffset: 300 }}
                                animate={{ strokeDashoffset: 300 - (Math.min(currentTemp, 50) / 50) * 300 }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                strokeLinecap="round"
                                style={{ filter: `drop-shadow(0 0 10px ${thermalStatus.tone}66)` }}
                            />
                        </svg>

                        {/* Centered Temperature Value */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="flex items-baseline relative">
                                <motion.span
                                    key={currentTemp}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={cn("text-[100px] @md:text-[120px] font-black leading-none tracking-tighter text-white", thermalStatus.color)}
                                >
                                    {Math.round(currentTemp)}
                                </motion.span>
                                <span className="text-4xl @md:text-5xl font-black text-white/20 ml-1">°</span>
                            </div>
                            <span className="text-[12px] font-black tracking-[0.4em] uppercase text-white/40 -mt-2">Celsius Telemetry</span>

                            <div className={cn(
                                "mt-4 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase flex items-center gap-2",
                                "bg-white/5 border-white/10 text-white/60"
                            )}>
                                {thermalStatus.label}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Thermal Matrix HUD */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: 'Feels Like', val: feelsLike.toFixed(1), unit: '°', icon: Thermometer, color: 'text-emerald-400' },
                        { label: 'Peak Day', val: dailyMax.toFixed(1), unit: '°', icon: ArrowUp, color: 'text-orange-400' },
                        { label: 'Floor Day', val: dailyMin.toFixed(1), unit: '°', icon: ArrowDown, color: 'text-blue-400' }
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

                {/* Homeostatic Efficiency Index */}
                <div className="mt-4 flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Homeostatic Accuracy Matrix</span>
                        <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">{efficiency.toFixed(0)}% Optimal</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden p-0.5">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${efficiency}%` }}
                            className="h-full bg-emerald-400 rounded-full shadow-[0_0_10px_#10b981]"
                        />
                    </div>
                    <div className="flex justify-between mt-1 px-1">
                        <span className="text-[6px] font-black text-white/10 uppercase tracking-widest">Molecular Floor</span>
                        <span className="text-[6px] font-black text-white/10 uppercase tracking-widest">Excitation Peak</span>
                    </div>
                </div>
            </div>

            {/* Corner Markers */}
            <div className="absolute top-0 right-0 p-3 opacity-20 pointer-events-none">
                <Info className="size-3 text-white" />
            </div>
        </Card>
    );
}
