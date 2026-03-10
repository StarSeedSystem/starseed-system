'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    SunDim, Sparkles, ShieldCheck, ShieldAlert, Zap, Info, EyeOff,
    Radiation, Activity, Maximize2, Shield, Sun, Flame, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherUvWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Ionizing Radiation HUD (Solar Core)
 * - Kinetic Photon Emission (Radiant particles)
 * - Heliotropic Protection Matrix
 * - Ozone Integrity Analysis
 */
export function WeatherUvWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted && json.terrestrial?.current) {
                    setData(json.terrestrial);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching UV data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const uvIndex = data?.daily?.uv_index_max?.[0] || 6;
    const ozone = 295; // Dobson Units (Approx)

    const uvState = useMemo(() => {
        if (uvIndex <= 2) return { id: 'low', label: 'Minimal', color: 'text-emerald-400', tone: '#10b981', icon: ShieldCheck, advisory: 'Safe Exposure' };
        if (uvIndex <= 5) return { id: 'moderate', label: 'Moderate', color: 'text-yellow-400', tone: '#fbbf24', icon: Sun, advisory: 'Seek Shade' };
        if (uvIndex <= 7) return { id: 'high', label: 'Intense', color: 'text-orange-500', tone: '#f97316', icon: ShieldAlert, advisory: 'Protection Req.' };
        return { id: 'extreme', label: 'Critical', color: 'text-[#f90650]', tone: '#f90650', icon: AlertTriangle, advisory: 'Extreme Risk' };
    }, [uvIndex]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[450px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-orange-500/30">

            {/* Solar Flare Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    uvIndex > 5 ? "opacity-20 bg-[radial-gradient(circle_at_50%_0%,#f9731633,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_0%,#fbbf2422,transparent_70%)]"
                )} />

                {/* Kinetic Photon Emission */}
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{
                            x: [0, (Math.random() - 0.5) * 400],
                            y: [0, (Math.random() - 0.5) * 400],
                            opacity: [0, 0.4, 0],
                            scale: [0, 1.5, 0],
                        }}
                        transition={{
                            duration: 3 + Math.random() * 5,
                            repeat: Infinity,
                            ease: "easeOut",
                            delay: Math.random() * 5
                        }}
                        className={cn("absolute size-1.5 rounded-full blur-[2.5px] top-1/2 left-1/2", uvState.color)}
                        style={{ backgroundColor: uvState.tone }}
                    />
                ))}
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            "group-hover:border-orange-500/40 text-orange-400"
                        )}>
                            <Radiation className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Helio.Sensor.v9</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Solar Flux Node
                                <div className={cn("size-1 rounded-full", uvIndex > 7 ? "bg-[#f90650] animate-ping" : "bg-yellow-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Zap className="size-3 text-orange-500" />
                        FLUX: {Math.round(uvIndex * 85)} W/m²
                    </div>
                </div>

                {/* Main UV HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative py-4">
                    <div className="relative group/main">
                        {/* Radiant HUD Rings */}
                        <div className="relative size-64 @md:size-80 flex items-center justify-center">
                            <svg className="absolute inset-0 size-full">
                                <circle cx="50%" cy="50%" r="48%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                <motion.circle
                                    cx="50%" cy="50%" r="48%"
                                    fill="none"
                                    stroke={uvState.tone}
                                    strokeWidth="1.5"
                                    strokeDasharray="4 12"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
                                    className="opacity-20"
                                />
                                {/* Pulsing Glow Ring */}
                                <motion.circle
                                    cx="50%" cy="50%" r="40%"
                                    fill="none"
                                    stroke={uvState.tone}
                                    strokeWidth="0.5"
                                    animate={{
                                        scale: [1, 1.15, 1],
                                        opacity: [0.1, 0.4, 0.1]
                                    }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />
                            </svg>

                            {/* Center Value */}
                            <div className="flex flex-col items-center z-10">
                                <motion.div
                                    key={uvIndex}
                                    initial={{ opacity: 0, scale: 0.9, rotate: -15 }}
                                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                    className={cn("text-[100px] @md:text-[130px] font-black leading-none tracking-tighter text-white", uvState.color)}
                                    style={{ textShadow: `0 0 40px ${uvState.tone}66` }}
                                >
                                    {uvIndex}
                                </motion.div>
                                <span className="text-[10px] font-black tracking-[0.5em] uppercase text-white/40 -mt-2">UV Index Level</span>

                                <div className={cn(
                                    "mt-6 px-4 py-1.5 rounded-full border-2 text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-2",
                                    "bg-white/5 backdrop-blur-xl border-white/10",
                                    uvState.color
                                )}>
                                    <uvState.icon className="size-3" />
                                    {uvState.label} Risk
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Heliotropic Matrix */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-4 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/metric hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-2">
                            <Shield className="size-3 text-emerald-400 opacity-60" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Ozone_Layer</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{ozone}</span>
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">DU (Dobson)</span>
                        </div>
                        <div className="flex gap-1 h-1.5">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className={cn("flex-1 rounded-full bg-white/5", i < 4 && "bg-emerald-500/40 shadow-[0_0_8px_#10b98133]")} />
                            ))}
                        </div>
                    </div>

                    <div className="p-4 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/metric hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-2">
                            <Flame className="size-3 text-orange-400 opacity-60" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Heat_Flux</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{(uvIndex * 1.4).toFixed(1)}</span>
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">DEG/HR</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(uvIndex / 11) * 100}%` }}
                                className="h-full bg-orange-500 shadow-[0_0_10px_#f97316]"
                            />
                        </div>
                    </div>
                </div>

                {/* Directive HUD */}
                <div className="mt-4 p-4 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex items-center gap-5">
                    <div className={cn(
                        "size-12 rounded-2xl flex items-center justify-center transition-all shadow-2xl relative overflow-hidden",
                        "bg-white/5 border border-white/10"
                    )}>
                        <motion.div
                            animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.2, 1] }}
                            transition={{ duration: 3, repeat: Infinity }}
                            className={cn("absolute inset-0", uvState.color.replace('text-', 'bg-'))}
                        />
                        <Activity className={cn("size-5 relative z-10", uvState.color)} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Heliotropic Directive</span>
                        <span className="text-[13px] font-black text-white tracking-widest uppercase">
                            {uvState.advisory}
                        </span>
                    </div>
                </div>
            </div>

            {/* Scanning Laser Overlay */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-400/30 to-transparent z-50 pointer-events-none shadow-[0_0_15px_#f9731644]"
            />
        </Card>
    );
}
