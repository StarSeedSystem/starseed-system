'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Tornado, Factory, Activity, ShieldCheck, Wind, Zap, AlertCircle, Microscope, Beaker, Leaf, Info, Droplets, HeartPulse } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherAirQualityWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Pulmonary Integrity HUD (Bio-Resonance)
 * - Molecular Particulate Cloud Visualization
 * - Laser Scanning HUD Analysis
 * - High-Density Pollutant Matrix
 * - 12h Atmospheric Projection
 */
export function WeatherAirQualityWidget() {
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
            .catch(err => {
                console.error("Error fetching air quality data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const aqi = data?.current?.us_aqi || 42;
    const pm25 = data?.current?.pm2_5 || 8.4;
    const pm10 = data?.current?.pm10 || 15.2;
    const so2 = data?.current?.so2 || 0.6;
    const no2 = data?.current?.no2 || 2.1;
    const o3 = data?.current?.o3 || 25.4;

    const hourlyAqi = data?.hourly?.us_aqi?.slice(0, 12) || Array(12).fill(40);
    const hourlyTimes = data?.hourly?.time?.slice(0, 12) || Array(12).fill("00:00");
    const maxAqi = Math.max(...hourlyAqi, 100);

    const aqiState = useMemo(() => {
        if (aqi <= 50) return { id: 'optimal', label: 'Excellent', color: 'text-emerald-400', tone: '#10b981', icon: ShieldCheck, desc: 'Ideal for organic respiration' };
        if (aqi <= 100) return { id: 'stable', label: 'Moderate', color: 'text-yellow-400', tone: '#facc15', icon: Activity, desc: 'Standard atmospheric conditions' };
        if (aqi <= 150) return { id: 'fragile', label: 'Sensitive', color: 'text-orange-400', tone: '#f97316', icon: AlertCircle, desc: 'Potential pulmonary stress' };
        return { id: 'crisis', label: 'Hazardous', color: 'text-rose-400', tone: '#f43f5e', icon: Zap, desc: 'Critical bio-hazard alert' };
    }, [aqi]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[450px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-emerald-500/30">

            {/* Atmospheric Particulate Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    aqi > 100 ? "opacity-20 bg-[radial-gradient(circle_at_50%_40%,#f43f5e11,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_40%,#10b98111,transparent_70%)]"
                )} />

                {/* Floating Particulate Particles */}
                {[...Array(20)].map((_, i) => (
                    <motion.div
                        key={i}
                        className={cn("absolute rounded-full blur-[1px]", aqi > 100 ? "bg-rose-400/20" : "bg-emerald-400/20")}
                        style={{
                            width: 2 + Math.random() * 4,
                            height: 2 + Math.random() * 4,
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`
                        }}
                        animate={{
                            y: [0, -40, 0],
                            x: [0, 20, 0],
                            opacity: [0.1, 0.4, 0.1]
                        }}
                        transition={{ duration: 10 + Math.random() * 20, repeat: Infinity, ease: "easeInOut" }}
                    />
                ))}

                {/* Laser Scanning Line */}
                <motion.div
                    animate={{ top: ['-10%', '110%'] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent z-50 shadow-[0_0_15px_#06b6d466]"
                />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-6 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "size-11 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-xl",
                            aqi > 100 ? "text-rose-500 border-rose-500/40" : "text-emerald-400 border-emerald-500/40"
                        )}>
                            <Microscope className="size-5" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Bio.Atmo.Integrity</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Air Quality Node
                                <div className={cn("size-1 rounded-full", aqi > 100 ? "bg-rose-500 animate-ping" : "bg-emerald-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <HeartPulse className="size-3 text-emerald-500" />
                        SENS: 0.04μm
                    </div>
                </div>

                {/* Main AQI HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative">
                        {/* Circular Progress HUD */}
                        <svg className="size-64 @md:size-72 -rotate-90 overflow-visible">
                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                            <motion.circle
                                cx="50%" cy="50%" r="45%"
                                fill="none"
                                stroke={aqiState.tone}
                                strokeWidth="12"
                                strokeDasharray="100 300"
                                initial={{ strokeDashoffset: 300 }}
                                animate={{ strokeDashoffset: 300 - (Math.min(aqi, 200) / 200) * 300 }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                strokeLinecap="round"
                                style={{ filter: `drop-shadow(0 0 10px ${aqiState.tone}66)` }}
                            />
                        </svg>

                        {/* Centered AQI Value */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.span
                                key={aqi}
                                className={cn("text-[90px] @md:text-[110px] font-black leading-none tracking-tighter text-white", aqiState.color)}
                            >
                                {aqi}
                            </motion.span>
                            <span className="text-[12px] font-black tracking-[0.4em] uppercase text-white/40 -mt-2">AQI Score</span>

                            <div className={cn(
                                "mt-4 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase flex items-center gap-2",
                                aqi > 50 ? "bg-white/5 border-white/10 text-white/60" : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                            )}>
                                <aqiState.icon className="size-3" />
                                {aqiState.label}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pulmonary Risk HUD */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                        { label: 'PM 2.5', val: pm25, unit: 'μg', icon: Wind, color: 'text-emerald-400' },
                        { label: 'PM 10', val: pm10, unit: 'μg', icon: Tornado, color: 'text-cyan-400' },
                        { label: 'O3 Flux', val: o3, unit: 'ppb', icon: Activity, color: 'text-purple-400' },
                        { label: 'NO2', val: no2, unit: 'ppb', icon: Droplets, color: 'text-blue-400' }
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

                {/* 12h Integrity Projection Chart */}
                <div className="mt-4 flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Atmospheric Forecast Matrix</span>
                        <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">12h Stability</span>
                    </div>
                    <div className="h-12 flex items-end gap-[1.5px] px-1 relative">
                        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/5" />
                        {hourlyAqi.map((val: number, i: number) => {
                            const h = (val / maxAqi) * 100;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(10, h)}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[1px] transition-colors",
                                        val > 100 ? "bg-rose-500 shadow-[0_0_8px_#f43f5e]" : "bg-emerald-500/20"
                                    )}
                                />
                            );
                        })}
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
