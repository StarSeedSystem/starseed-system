'use client';

import React, { useState, useEffect } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    CloudRain, Wind, ThermometerSun, MapPin, Sparkles,
    Cloud, Sun, History, CalendarClock, Activity,
    Zap, Droplets, ArrowUpRight, ArrowDownRight,
    Navigation, Shield
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type TabType = 'current' | 'forecast' | 'history';

export function WeatherBasicWidget() {
    const { location } = useWeatherLocation();

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('current');
    const [currentTime, setCurrentTime] = useState(new Date());

    // State for random elements to avoid hydration mismatch
    const [rainDrops, setRainDrops] = useState<any[]>([]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted) {
                    setData(json.terrestrial);
                    setLoading(false);
                    // Generate random rain once data is loaded on client
                    setRainDrops([...Array(30)].map((_, i) => ({
                        left: `${Math.random() * 100}%`,
                        duration: 0.5 + Math.random() * 0.3,
                        delay: Math.random() * 2
                    })));
                }
            })
            .catch(err => {
                console.error("Error fetching weather data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    if (loading || !data) {
        return (
            <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-950 text-[#06f9c8] p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,249,200,0.1),transparent_70%)] animate-pulse" />
                <div className="w-16 h-16 border-4 border-[#06f9c8]/20 border-t-[#06f9c8] rounded-full animate-spin mb-6" />
                <span className="text-[10px] uppercase font-black tracking-[0.4em]">Calibrating_Matrix...</span>
            </div>
        );
    }

    const cur = data.current || {};
    const temp = Math.round(cur.temperature_2m || 0);
    const windSpeed = Math.round(cur.wind_speed_10m || 0);
    const humidity = Math.round(cur.relative_humidity_2m || 0);
    const cloudCover = cur.cloud_cover || 0;
    const weatherCode = cur.weather_code || 0;

    // Determine realistic weather visual states
    const isRaining = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode);
    const isCloudy = cloudCover > 50 || [2, 3].includes(weatherCode);
    const isHot = temp > 25;
    const isNight = currentTime.getHours() > 19 || currentTime.getHours() < 6;

    // Daily Forecast Math
    const daily = data.daily || {};
    const forecastMax = Math.round(daily.temperature_2m_max?.[1] || 0);
    const forecastMin = Math.round(daily.temperature_2m_min?.[1] || 0);
    const historyMax = Math.round(daily.temperature_2m_max?.[0] || 0);

    // Enhanced Dynamic Gradient System
    const bgGradient = isRaining
        ? 'from-[#1e293b] via-[#0f172a] to-[#1e1b4b]'
        : isNight
            ? 'from-[#020617] via-[#1e1b4b] to-[#312e81]'
            : isCloudy
                ? 'from-[#475569] via-[#334155] to-[#1e293b]'
                : isHot
                    ? 'from-[#f59e0b] via-[#ef4444] to-[#7f1d1d]'
                    : 'from-[#0ea5e9] via-[#3b82f6] to-[#1e40af]';

    return (
        <Card className={cn(
            "@container w-full h-full relative overflow-hidden bg-slate-950/60 backdrop-blur-[40px] border border-white/10 flex flex-col group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-[#06f9c8]/30",
            "p-6 @sm:p-8"
        )}>
            {/* Liquid Crystal FX Layers */}
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40 transition-colors duration-1000", bgGradient)} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_70%)]" />

            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute -top-[20%] -right-[20%] w-full h-full bg-[#06f9c8]/5 blur-[120px] rounded-full pointer-events-none"
            />

            {/* Weather Specific Particle Systems */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden overflow-hidden">
                {isRaining && (
                    <div className="absolute inset-0 opacity-40">
                        {rainDrops.map((drop, i) => (
                            <motion.div
                                key={i}
                                className="absolute w-[1px] h-12 bg-blue-300/40 rounded-full"
                                style={{ left: drop.left, top: -50 }}
                                animate={{ y: [0, 800], opacity: [0, 1, 0] }}
                                transition={{
                                    duration: drop.duration,
                                    repeat: Infinity,
                                    ease: "linear",
                                    delay: drop.delay
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Header: Atmospheric Status HUD */}
            <div className="flex justify-between items-start z-10 w-full mb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-[#06f9c8] blur-xl opacity-20 animate-pulse" />
                        <div className="relative p-2.5 rounded-[1rem] bg-white/5 border border-white/10 backdrop-blur-3xl shadow-xl">
                            <Activity className="w-4 h-4 text-[#06f9c8]" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black tracking-[0.4em] text-[#06f9c8] uppercase leading-none mb-1.5 opacity-60">Telemetry_Link</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-black tracking-tight text-white leading-none">{location.name.split(',')[0]}</span>
                            <div className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="text-[7px] font-black text-emerald-400 uppercase tracking-tighter">Active</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                    <div className="px-3 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-xl">
                        <span className="text-[9px] font-black text-white/70 tracking-[0.1em] uppercase tabular-nums">
                            {currentTime.toLocaleTimeString([], { hour12: false })}
                        </span>
                    </div>
                    <span className="text-[6px] font-black text-white/20 uppercase tracking-[0.3em]">H_RES_SYNC</span>
                </div>
            </div>

            {/* Main Content: The Core Matrix */}
            <div className="flex-1 flex flex-col z-10 relative overflow-hidden py-4">
                <AnimatePresence mode="wait">
                    {activeTab === 'current' ? (
                        <motion.div
                            key="current"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            className="flex flex-col items-center justify-center h-full"
                        >
                            {/* Hero Temperature Cluster */}
                            <div className="relative flex flex-col items-center">
                                {/* Atmospheric Aura */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#06f9c8]/10 blur-[100px] pointer-events-none group-hover:scale-125 transition-transform duration-1000" />

                                <motion.div
                                    className="relative flex items-start"
                                    animate={{ y: [0, -5, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <span className="text-[9rem] @sm:text-[12rem] font-black leading-none tracking-tighter text-white drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                                        {temp}
                                    </span>
                                    <span className="text-4xl @sm:text-6xl font-black mt-8 text-[#06f9c8] drop-shadow-[0_0_20px_rgba(6,249,200,0.4)] ml-2">°</span>
                                </motion.div>

                                <div className="flex items-center gap-4 mt-2 px-6 py-2 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-md">
                                    <div className="flex items-center gap-1.5">
                                        <ArrowUpRight className="w-3 h-3 text-orange-400" />
                                        <span className="text-[10px] font-black text-white/80 tabular-nums">{forecastMax}°</span>
                                    </div>
                                    <div className="w-px h-3 bg-white/10" />
                                    <div className="flex items-center gap-1.5">
                                        <ArrowDownRight className="w-3 h-3 text-sky-400" />
                                        <span className="text-[10px] font-black text-white/80 tabular-nums">{forecastMin}°</span>
                                    </div>
                                </div>
                            </div>

                            {/* Dense Metric Grid */}
                            <div className="grid grid-cols-2 @[30rem]:grid-cols-4 gap-3 w-full mt-10">
                                <MiniStat icon={<Wind className="w-3 h-3" />} value={`${windSpeed}k`} label="Wind" color="text-sky-400" />
                                <MiniStat icon={<Droplets className="w-3 h-3" />} value={`${humidity}%`} label="Humid" color="text-indigo-400" />
                                <MiniStat icon={<Zap className="w-3 h-3" />} value={`${daily.uv_index_max?.[0] || 0}`} label="UV_I" color="text-yellow-400" />
                                <MiniStat icon={<Shield className="w-3 h-3" />} value="98%" label="S_Ind" color="text-emerald-400" />
                            </div>
                        </motion.div>
                    ) : activeTab === 'forecast' ? (
                        <motion.div
                            key="forecast"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex flex-col gap-4 h-full"
                        >
                            <div className="flex items-center gap-2 px-2">
                                <CalendarClock className="w-4 h-4 text-[#06f9c8]" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#06f9c8]">Projection_Next_72H</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 flex-1">
                                {daily.time?.slice(1, 4).map((day: any, i: number) => (
                                    <div key={day} className="flex flex-col items-center justify-center p-4 rounded-[2rem] bg-white/5 border border-white/5 hover:border-[#06f9c8]/20 transition-all group/day">
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-4">
                                            {new Date(day).toLocaleDateString([], { weekday: 'short' })}
                                        </span>
                                        <div className="mb-4 group-hover/day:scale-110 transition-transform">
                                            <Sun className="w-6 h-6 text-yellow-300/60" />
                                        </div>
                                        <span className="text-2xl font-black text-white tabular-nums">
                                            {Math.round(daily.temperature_2m_max[i + 1])}°
                                        </span>
                                        <div className="w-8 h-0.5 bg-white/10 rounded-full my-2" />
                                        <span className="text-[10px] font-bold text-[#06f9c8]/40">
                                            {Math.round(daily.temperature_2m_min[i + 1])}°
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center justify-center h-full"
                        >
                            <div className="w-full p-8 rounded-[3rem] bg-black/20 border border-white/5 backdrop-blur-3xl flex flex-col items-center relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 to-transparent pointer-events-none" />
                                <History className="w-10 h-10 text-purple-400/60 mb-6 animate-pulse" />
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.5em] mb-4">Archive_D-1_Temporal</span>
                                <div className="flex items-start">
                                    <span className="text-8xl font-black text-white drop-shadow-2xl">{historyMax}</span>
                                    <span className="text-3xl font-black text-purple-400 mt-4 ml-1">°</span>
                                </div>
                                <div className="mt-6 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20">
                                    <span className="text-[9px] font-black text-purple-300 uppercase tracking-widest italic">Stable_Historical</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Navigation: Liquid Pill */}
            <div className="flex justify-center mt-4 z-20 shrink-0">
                <div className="flex bg-black/40 backdrop-blur-3xl rounded-[1.25rem] p-1 border border-white/10 relative w-full shadow-2xl overflow-hidden">
                    <motion.div
                        className="absolute inset-y-1 bg-[#06f9c8] rounded-[0.8rem] shadow-[0_0_20px_rgba(6,249,200,0.5)]"
                        initial={false}
                        animate={{
                            left: activeTab === 'current' ? '4px' : activeTab === 'forecast' ? '33.33%' : '66.66%',
                            width: 'calc(33.33% - 4.5px)'
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                    {['current', 'forecast', 'history'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as TabType)}
                            className={cn(
                                "relative z-10 flex-1 py-2.5 text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-300",
                                activeTab === tab ? "text-slate-950" : "text-white/30 hover:text-white"
                            )}
                        >
                            {tab === 'current' ? 'Live' : tab === 'forecast' ? 'Next' : 'Rec'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Scanning Overlay */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#06f9c8]/20 to-transparent z-50 pointer-events-none"
            />
        </Card>
    );
}

function MiniStat({ icon, value, label, color }: any) {
    return (
        <div className="flex flex-col items-center gap-1.5 p-3 rounded-[1.5rem] bg-white/5 border border-white/5 hover:border-white/10 transition-all group/stat">
            <div className={cn("p-1.5 rounded-lg bg-black/20 border border-white/5", color)}>
                {icon}
            </div>
            <div className="flex flex-col items-center">
                <span className="text-xs font-black text-white tabular-nums leading-none">{value}</span>
                <span className="text-[6px] font-black text-white/20 uppercase tracking-widest mt-1 group-hover/stat:text-white/40 transition-colors uppercase tracking-[0.2em]">{label}</span>
            </div>
        </div>
    );
}
