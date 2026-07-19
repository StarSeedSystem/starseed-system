'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Sun, Cloud, CloudRain, CloudLightning, Wind,
    Thermometer, Calendar, MapPin, ChevronRight,
    ArrowUp, ArrowDown, Droplets, Clock, LayoutGrid,
    Activity, Zap, Compass, ShieldCheck, Gauge,
    Orbit, Sparkles, Binary, Scan, Maximize
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherForecastWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Planetary Outlook HUD (Multi-Vector Projection)
 * - Temporal Flux Matrix (24H Kinetic Flow)
 * - Atmospheric Cycle Outlook (7D Prediction)
 * - Homeostatic Equilibrium HUD
 */
export function WeatherForecastWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [forecastMode, setForecastMode] = useState<'temp' | 'precip' | 'wind'>('temp');
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

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
                console.error("Error fetching forecast:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const current = data?.current || {};
    const daily = data?.daily || {};
    const hourly = data?.hourly || {};

    const weatherIcon = useMemo(() => {
        const code = current.weather_code || 0;
        if (code === 0) return <Sun className="size-20 text-amber-300 drop-shadow-[0_0_40px_rgba(251,191,36,0.8)]" />;
        if (code < 3) return <Cloud className="size-20 text-slate-100 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)]" />;
        if (code < 70) return <CloudRain className="size-20 text-blue-300 drop-shadow-[0_0_40px_rgba(96,165,250,0.7)]" />;
        return <CloudLightning className="size-20 text-purple-300 drop-shadow-[0_0_40px_rgba(168,85,247,0.7)]" />;
    }, [current.weather_code]);

    const getHourlyValue = (i: number) => {
        if (forecastMode === 'precip') return `${hourly.precipitation_probability?.[i] || 0}%`;
        if (forecastMode === 'wind') return `${Math.round(hourly.wind_speed_10m?.[i] || 0)}kv`;
        return `${Math.round(hourly.temperature_2m?.[i] || 0)}°`;
    };

    const getConditionIcon = (code: number, className = "size-5") => {
        if (code === 0) return <Sun className={cn(className, "text-amber-300")} />;
        if (code < 3) return <Cloud className={cn(className, "text-slate-200")} />;
        if (code < 70) return <CloudRain className={cn(className, "text-blue-300")} />;
        return <CloudLightning className={cn(className, "text-purple-300")} />;
    };

    if (loading || !data) {
        return (
            <div className="w-full h-full min-h-[600px] flex items-center justify-center bg-[#020508] rounded-[3rem] border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,249,200,0.05),transparent_70%)] animate-pulse" />
                <div className="flex flex-col items-center gap-6">
                    <div className="size-16 border-4 border-[#06f9c8]/20 border-t-[#06f9c8] rounded-full animate-spin" />
                    <span className="text-[10px] font-black tracking-[0.6em] uppercase text-[#06f9c8]">Syncing_Planetary_Grid</span>
                </div>
            </div>
        );
    }

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[700px] bg-[#020812] border border-white/10 group rounded-[3rem] shadow-2xl transition-all duration-700 hover:border-[#06f9c8]/30">

            {/* Liquid Crystal Background Shell */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,#0c2a42_0%,transparent_100%)] opacity-40" />

                {/* Kinetic Matrix Particles */}
                {[...Array(30)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -40, 0],
                            opacity: [0.1, 0.3, 0.1],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            duration: 4 + Math.random() * 6,
                            repeat: Infinity,
                            delay: Math.random() * 5
                        }}
                        className="absolute size-px bg-[#06f9c8]/20"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`
                        }}
                    />
                ))}

                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-1/2 -right-1/2 w-full h-full bg-[#06f9c8]/5 blur-[200px] rounded-full"
                />
            </div>

            {/* Content Interface */}
            <div className="relative z-10 h-full p-8 flex flex-col">

                {/* Header HUD */}
                <div className="flex justify-between items-start mb-10">
                    <div className="flex items-center gap-6">
                        <div className="relative">
                            <motion.div
                                animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
                                transition={{ duration: 4, repeat: Infinity }}
                                className="absolute inset-0 bg-[#06f9c8] blur-2xl rounded-lg"
                            />
                            <div className="relative size-14 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-2xl group-hover:border-[#06f9c8]/40">
                                <Orbit className="size-7 text-[#06f9c8]" />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-[#06f9c8]/60 leading-none mb-2">Planetary.Outlook.v11</h2>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl font-black tracking-tighter text-white uppercase leading-none">
                                    {location.name.split(',')[0]}
                                </span>
                                <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black text-emerald-400 tracking-widest">
                                    NODE: NOMINAL
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="px-4 py-2 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl text-xs font-black tracking-widest text-[#06f9c8]/60 flex items-center gap-3 shadow-inner">
                            <Clock className="size-4" />
                            {currentTime.toLocaleTimeString([], { hour12: false })}
                        </div>
                    </div>
                </div>

                {/* Main Forecast Matrix */}
                <div className="grid grid-cols-1 @4xl:grid-cols-[1.6fr_1fr] gap-10 flex-1">

                    {/* Left: Real-time Flux HUD */}
                    <div className="flex flex-col gap-10">
                        <div className="relative p-10 rounded-[3.5rem] bg-gradient-to-br from-white/[0.05] to-transparent border border-white/10 backdrop-blur-3xl overflow-hidden group/hero shadow-2xl">
                            {/* Glass Refraction */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#06f9c8]/10 via-transparent to-white/5 opacity-0 group-hover/hero:opacity-100 transition-opacity duration-1000" />

                            <div className="grid @[30rem]:grid-cols-2 gap-12 items-center relative z-10">
                                <div className="flex flex-col items-center @[30rem]:items-start">
                                    <motion.div
                                        animate={{ y: [0, -10, 0] }}
                                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                        className="mb-8"
                                    >
                                        {weatherIcon}
                                    </motion.div>
                                    <div className="flex items-baseline gap-2 relative">
                                        <span className="text-[8rem] @sm:text-[10rem] font-black text-white tracking-tighter leading-none drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                            {Math.round(current.temperature_2m || 0)}
                                        </span>
                                        <span className="text-4xl font-black text-[#06f9c8] drop-shadow-[0_0_20px_rgba(6,249,200,0.4)] ml-1">°</span>
                                    </div>
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.5em] mt-2">Thermal_Equilibrium</span>
                                </div>

                                <div className="space-y-4">
                                    <TelemetryLine icon={<Activity />} label="Flux Status" value="Stable" color="text-[#06f9c8]" />
                                    <TelemetryLine icon={<Zap />} label="UV Radiation" value={`${daily.uv_index_max?.[0] || 0} I`} color="text-amber-400" />
                                    <TelemetryLine icon={<Droplets />} label="Saturation" value={`${Math.round(current.relative_humidity_2m || 0)}%`} color="text-blue-400" />
                                    <TelemetryLine icon={<Wind />} label="Kinetic Flow" value={`${Math.round(current.wind_speed_10m || 0)}km/h`} color="text-sky-400" />
                                </div>
                            </div>
                        </div>

                        {/* 24H Forecast Stream */}
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-3">
                                    <Binary className="size-4 text-[#06f9c8]/50" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#06f9c8]">Temporal_Flow_24H</span>
                                </div>
                                <div className="flex bg-black/60 p-1 rounded-xl border border-white/10 backdrop-blur-xl shadow-2xl">
                                    {['temp', 'precip', 'wind'].map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setForecastMode(mode as any)}
                                            className={cn(
                                                "px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                                forecastMode === mode ? "bg-[#06f9c8] text-slate-950 shadow-[0_0_15px_rgba(6,249,200,0.4)]" : "text-white/20 hover:text-white"
                                            )}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar px-2">
                                {hourly.time?.slice(0, 24).map((time: string, i: number) => (
                                    <div
                                        key={i}
                                        className="flex flex-col items-center gap-5 min-w-[120px] p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/5 backdrop-blur-2xl hover:bg-white/[0.08] hover:border-[#06f9c8]/30 transition-all cursor-pointer group/node shadow-xl"
                                    >
                                        <span className="text-[10px] font-black text-white/20 tracking-widest uppercase">
                                            {(() => {
                                                const d = new Date(time);
                                                if (!isNaN(d.getTime())) return `${d.getHours()}:00`;
                                                return time; // Fallback for "00:00" strings
                                            })()}
                                        </span>
                                        <div className="bg-black/20 p-3 rounded-2xl group-hover/node:bg-[#06f9c8]/10 transition-colors">
                                            {getConditionIcon(hourly.weather_code?.[i] || 0, "size-6 opacity-40 group-hover/node:opacity-100")}
                                        </div>
                                        <span className="text-xl font-black text-white tabular-nums tracking-tighter">
                                            {getHourlyValue(i)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: 7-Cycle Prognosis */}
                    <div className="flex flex-col bg-black/40 border border-white/10 backdrop-blur-3xl rounded-[3.5rem] p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none">
                            <Calendar className="size-96" />
                        </div>

                        <div className="flex items-center justify-between mb-8 relative z-10">
                            <div className="flex items-center gap-3">
                                <Sparkles className="size-4 text-indigo-400" />
                                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400">Atmos_Cycle_7D</span>
                            </div>
                            <Scan className="size-4 text-white/10" />
                        </div>

                        <div className="flex-1 flex flex-col gap-2 relative z-10 overflow-y-auto no-scrollbar">
                            {daily.time?.slice(0, 7).map((time: string, i: number) => (
                                <motion.div
                                    key={i}
                                    whileHover={{ x: 8 }}
                                    className="flex items-center justify-between p-4 rounded-3xl bg-white/[0.02] border border-transparent hover:border-white/10 hover:bg-white/[0.05] transition-all duration-300 group/day"
                                >
                                    <div className="flex items-center gap-5">
                                        <span className="w-10 text-[10px] font-black text-white/30 tracking-widest uppercase">
                                            {i === 0 ? 'Now' : new Date(time).toLocaleDateString([], { weekday: 'short' })}
                                        </span>
                                        <div className="p-2.5 rounded-xl bg-white/5 group-hover/day:bg-[#06f9c8]/10">
                                            {getConditionIcon(daily.weather_code?.[i] || 0, "size-5 text-white/20 group-hover/day:text-[#06f9c8]")}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl font-black text-white tabular-nums">
                                                    {Math.round(daily.temperature_2m_max?.[i] || 0)}°
                                                </span>
                                                <div className="w-px h-3 bg-white/10" />
                                                <span className="text-xl font-black text-white/20 tabular-nums">
                                                    {Math.round(daily.temperature_2m_min?.[i] || 0)}°
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <Droplets className="size-2 text-blue-400/40" />
                                                <span className="text-[8px] font-bold text-white/10 uppercase tracking-tighter">
                                                    P: {daily.precipitation_probability_max?.[i] || 0}%
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="size-4 text-white/5" />
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Prognosis HUD Footer */}
                        <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <Gauge className="size-4 text-[#06f9c8]/40" />
                                <div className="flex flex-col">
                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest mb-1">Predictive.Confidence</span>
                                    <span className="text-[9px] font-black text-[#06f9c8] tracking-widest">STABLE_ISO_SYNC</span>
                                </div>
                            </div>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map(v => (
                                    <div key={v} className={cn("w-1 h-4 rounded-full bg-white/5", v <= 4 && "bg-[#06f9c8] shadow-[0_0_10px_#06f9c8]")} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Kinetic Scan Beam */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#06f9c8]/20 to-transparent z-40 pointer-events-none"
            />
        </Card>
    );
}

function TelemetryLine({ icon, label, value, color }: any) {
    return (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-all group/node">
            <div className="flex items-center gap-4">
                <div className={cn("p-2 rounded-xl bg-white/5", color)}>
                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "size-4" })}
                </div>
                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{label}</span>
            </div>
            <span className="text-sm font-black text-white tracking-widest uppercase">{value}</span>
        </div>
    );
}
