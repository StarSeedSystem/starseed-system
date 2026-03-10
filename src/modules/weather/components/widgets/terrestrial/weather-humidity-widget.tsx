'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Droplet, Umbrella, Waves, CloudRain, Activity,
    Thermometer, ShieldCheck, Info, Droplets, Zap, Filter
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherHumidityWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Osmotic Purity HUD (Molecular Hydration)
 * - Kinetic Vapor Aura (Rising bio-particles)
 * - Hydro-Stability Matrix (Dew Point & Comfort)
 * - 12h Aqueous Saturation Forecast
 */
export function WeatherHumidityWidget() {
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
                console.error("Error fetching water data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const humidity = data?.current?.relative_humidity_2m || 65;
    const precipProb = data?.hourly?.precipitation_probability?.[0] || 12;
    const dewPoint = (data?.current?.dew_point_2m || 14.2).toFixed(1);

    const hourlyHumidity = data?.hourly?.relative_humidity_2m?.slice(0, 12) || Array(12).fill(65);
    const maxHumid = Math.max(...hourlyHumidity, 100);

    const humidityState = useMemo(() => {
        if (humidity < 30) return { id: 'arid', label: 'Arid', color: 'text-orange-400', tone: '#f97316', status: 'HYPO-HYDRATION' };
        if (humidity < 60) return { id: 'optimal', label: 'Optimal', color: 'text-emerald-400', tone: '#10b981', status: 'HOMEOSTASIS' };
        return { id: 'saturated', label: 'Saturated', color: 'text-cyan-400', tone: '#06b6d4', status: 'HYPER-AQUEOUS' };
    }, [humidity]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[450px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-cyan-500/30">

            {/* Liquid Crystal Overlay */}
            <div className="absolute inset-0 pointer-events-none">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    humidity > 60 ? "opacity-20 bg-[radial-gradient(circle_at_50%_0%,#06b6d422,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_0%,#10b98111,transparent_70%)]"
                )} />

                {/* Kinetic Vapor Particles */}
                {[...Array(15)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ y: "110%", opacity: 0, scale: 0.5 }}
                        animate={{
                            y: "-10%",
                            opacity: [0, 0.4, 0],
                            scale: [0.5, 1.2, 0.5],
                        }}
                        transition={{
                            duration: 5 + Math.random() * 8,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: Math.random() * 5
                        }}
                        className={cn("absolute w-1 h-1 rounded-full blur-[2px]", humidityState.color)}
                        style={{
                            left: `${Math.random() * 100}%`,
                            backgroundColor: humidityState.tone
                        }}
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
                            "group-hover:border-cyan-500/40 text-cyan-400"
                        )}>
                            <Droplets className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Osmotic.Purity.v2</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Aqueous Core Node
                                <div className={cn("size-1 rounded-full", humidity > 80 ? "bg-cyan-500 animate-pulse" : "bg-emerald-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Waves className="size-3 text-cyan-500 opacity-50" />
                        STABILITY: NOMINAL
                    </div>
                </div>

                {/* Main Humidity HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative py-4">
                    <div className="relative group/main">
                        {/* Osmotic HUD Rings */}
                        <div className="relative size-60 @md:size-72 flex items-center justify-center">
                            <svg className="absolute inset-0 size-full -rotate-90">
                                <circle cx="50%" cy="50%" r="48%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                <motion.circle
                                    cx="50%" cy="50%" r="48%"
                                    fill="none"
                                    stroke={humidityState.tone}
                                    strokeWidth="2"
                                    strokeDasharray="1 8"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                                    className="opacity-30"
                                />
                                <motion.circle
                                    cx="50%" cy="50%" r="44%"
                                    fill="none"
                                    stroke={humidityState.tone}
                                    strokeWidth="8"
                                    strokeDasharray="276.46"
                                    initial={{ strokeDashoffset: 276.46 }}
                                    animate={{ strokeDashoffset: 276.46 * (1 - humidity / 100) }}
                                    transition={{ duration: 2, ease: "circOut" }}
                                    strokeLinecap="round"
                                    style={{ filter: `drop-shadow(0 0 12px ${humidityState.tone}44)` }}
                                />
                            </svg>

                            {/* Center Value */}
                            <div className="flex flex-col items-center">
                                <motion.div
                                    key={humidity}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={cn("text-[80px] @md:text-[100px] font-black leading-none tracking-tighter text-white", humidityState.color)}
                                >
                                    {humidity}<span className="text-3xl text-white/20">%</span>
                                </motion.div>
                                <span className="text-[10px] font-black tracking-[0.4em] uppercase text-white/40 -mt-1">Saturation</span>

                                <div className={cn(
                                    "mt-4 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase",
                                    "bg-white/5 border-white/10 text-white/60"
                                )}>
                                    {humidityState.status}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Hydro-Stability Matrix */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="p-4 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/metric hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-2">
                            <Thermometer className="size-3 text-emerald-400 opacity-60" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Dew_Point</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{dewPoint}°</span>
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">CELSIUS</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(parseFloat(dewPoint) / 40) * 100}%` }}
                                className="h-full bg-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="p-4 rounded-[2rem] bg-white/[0.03] border border-white/5 flex flex-col gap-3 group/metric hover:bg-white/[0.07] transition-all">
                        <div className="flex items-center gap-2">
                            <Umbrella className="size-3 text-cyan-400 opacity-60" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Precip_Prob</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{precipProb}%</span>
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">POTENTIAL</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${precipProb}%` }}
                                className="h-full bg-cyan-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Aqueous Forecast Cluster */}
                <div className="mt-4 p-4 rounded-[2rem] bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Saturation Flux</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[7px] font-black text-cyan-500/60 uppercase tracking-widest">Aqueous Forecast</span>
                            <div className="size-1.5 rounded-full bg-cyan-500/30 animate-pulse" />
                        </div>
                    </div>
                    <div className="h-10 flex items-end gap-1.5 px-1">
                        {hourlyHumidity.map((val: number, i: number) => (
                            <motion.div
                                key={i}
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: val / 100 }}
                                className={cn(
                                    "flex-1 h-full rounded-t-sm origin-bottom",
                                    val > 70 ? "bg-cyan-500/40" : "bg-white/10"
                                )}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Scanning Laser Overlay */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#06f9c8]/30 to-transparent z-50 pointer-events-none shadow-[0_0_15px_#06f9c844]"
            />
        </Card>
    );
}
