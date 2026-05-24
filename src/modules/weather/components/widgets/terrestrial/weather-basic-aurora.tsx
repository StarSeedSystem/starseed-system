'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Maximize2, Wind, Droplets, Sun, Moon, Cloud, CloudRain,
    Navigation, Sparkles, Zap, Activity, Orbit, Search
} from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

export function WeatherBasicAuroraWidget() {
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

    const cur = data?.current || {};
    const forecastHourly = data?.forecast?.hourly || {};
    const temp = cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : '--';
    const windSpeed = cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : '--';
    const humidity = cur.relative_humidity_2m !== undefined ? Math.round(cur.relative_humidity_2m) : '--';
    const wmo = cur.weather_code || 0;

    const conditionStr = wmo === 0 ? "Clear Cosmic Skies" : wmo < 40 ? "Nebular Clouds" : wmo < 70 ? "Stellar Rain" : "Magnetic Storm";
    const statusLabel = wmo < 40 ? "Stable" : "Active";

    // Parse next few hours for cycle
    const nextHours = [];
    if (forecastHourly.time && forecastHourly.temperature_2m) {
        const currentHourStr = new Date().toISOString().slice(0, 14) + "00";
        const idx = Math.max(0, forecastHourly.time.findIndex((t: string) => t >= currentHourStr));
        for (let i = 0; i < 4; i++) {
            const hIdx = idx + i * 2;
            if (forecastHourly.time[hIdx]) {
                const code = forecastHourly.weather_code?.[hIdx];
                nextHours.push({
                    time: i === 0 ? 'Now' : new Date(forecastHourly.time[hIdx]).toLocaleTimeString([], { hour: '2-digit' }),
                    temp: Math.round(forecastHourly.temperature_2m[hIdx]),
                    icon: code === 0 ? <Sun className="w-4 h-4" /> : code < 50 ? <Cloud className="w-4 h-4" /> : <CloudRain className="w-4 h-4" />
                });
            }
        }
    }

    return (
        <Card className="@container w-full h-full relative overflow-hidden bg-[#0a0a1a]/80 backdrop-blur-3xl border-violet-500/20 group rounded-[2.5rem] transition-all duration-700 hover:border-violet-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">

            {/* Animated Aurora Background */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{
                        opacity: [0.1, 0.3, 0.1],
                        scale: [1, 1.2, 1],
                        rotate: [0, 5, 0]
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] bg-gradient-to-br from-violet-600/30 via-transparent to-cyan-500/20 blur-[100px]"
                />
                <motion.div
                    animate={{
                        opacity: [0.1, 0.2, 0.1],
                        x: [0, 50, 0],
                        y: [0, -30, 0]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.15),transparent_70%)]"
                />
                {/* Star Field Effect */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-screen" />
            </div>

            {/* Content Hub */}
            <div className="relative z-10 w-full h-full p-6 @md:p-8 flex flex-col justify-between">

                {/* Header HUD */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 backdrop-blur-md">
                            <Orbit className="w-5 h-5 text-violet-400 animate-spin-slow" />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-[0.4em] leading-none mb-1.5">Cosmos_Station_01</h3>
                            <p className="text-xl font-display font-medium text-white/90 tracking-tight">{location.name.split(',')[0]}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                            <div className={cn("w-2.5 h-2.5 rounded-full", statusLabel === 'Stable' ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-amber-400 shadow-[0_0_10px_#fbbf24]")} />
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">{statusLabel}</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 grid grid-cols-1 @md:grid-cols-2 gap-8 items-center py-6">

                    {/* Temperature Focal Point */}
                    <div className="flex flex-col items-center @md:items-start justify-center">
                        <div className="relative group/temp">
                            <motion.div
                                animate={{ opacity: [0, 0.5, 0] }}
                                transition={{ duration: 5, repeat: Infinity }}
                                className="absolute -inset-12 bg-violet-600/20 blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                            <div className="relative flex flex-col items-center @md:items-start">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-8xl @md:text-9xl font-black font-display text-white tracking-tighter drop-shadow-[0_0_40px_rgba(139,92,246,0.4)]">
                                        {temp}
                                    </span>
                                    <span className="text-3xl font-light text-violet-400/50">°</span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 backdrop-blur-md">
                                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                                    <span className="text-[11px] font-black text-violet-300 uppercase tracking-[0.3em]">
                                        {conditionStr}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Secondary Metrics & Moon Phase */}
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                            <MetricBox icon={<Wind className="w-4 h-4" />} label="WIND" value={`${windSpeed}k/h`} color="text-emerald-400" />
                            <MetricBox icon={<Droplets className="w-4 h-4" />} label="HUMIDITY" value={`${humidity}%`} color="text-blue-400" />
                        </div>

                        {/* Interactive Moon Phase Visual */}
                        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-600/10 to-indigo-600/10 border border-white/5 p-5 group/moon">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest mb-1">Celestial_Body</span>
                                    <span className="text-sm font-bold text-white tracking-tight">Waxing Crescent</span>
                                </div>
                                <div className="relative size-14 @md:size-16 rounded-full bg-[#111] overflow-hidden shadow-inner preserve-3d group-hover/moon:scale-110 transition-transform duration-500">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuBaP9lDKThomPhS_bxWvuddKkomrL444ywq2OilulUKsgmet61Sqp2TC935ViG9s98g91I3WqLlY9BHbRQWcJz41tV07T_UPk3WNZVjux5IL0H8CRNEZO8E6v3jzQ5zloG9Fxzd3YnUOEOvztmz72-BAVWbxNmqJHPxKzwHmUs9L9Zb4ku-nWBvPy6fmnFj55r5GBOOZ8hHvU_7UN_FFvLtSL-qIV05bcj_LewZtKqEzTNCR4iKqV8dvqBk8qkJF03_QlhONlGNtOc')] bg-cover opacity-60 mix-blend-screen"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent opacity-80" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Hourly Cycle List */}
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Atmospheric_Cycle</h4>
                        <div className="flex gap-1">
                            {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-violet-600/40" />)}
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        {nextHours.map((hr, i) => (
                            <motion.div
                                key={i}
                                whileHover={{ y: -5, scale: 1.05 }}
                                className={cn(
                                    "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300",
                                    i === 0 ? "bg-violet-600/20 border-violet-500/40 shadow-lg shadow-violet-600/20" : "bg-white/5 border-white/5 hover:bg-white/10"
                                )}
                            >
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-2">{hr.time}</span>
                                <div className={cn("mb-2", i === 0 ? "text-violet-400" : "text-white/60")}>
                                    {hr.icon}
                                </div>
                                <span className="text-sm font-bold text-white">{hr.temp}°</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Footer UI */}
                <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20">
                            <Activity className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                        </div>
                        <span className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase">LINK_ESTABLISHED</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link href="/atmosphere" className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-violet-600/20 border border-violet-600/30 text-white hover:bg-violet-600/40 transition-all group/btn active:scale-95 shadow-xl">
                            <span className="text-[10px] font-black uppercase tracking-widest">Deep Scan</span>
                            <Search className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Liquid Shine Overlay */}
            <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear", repeatDelay: 4 }}
                className="absolute top-0 bottom-0 w-40 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 z-20 pointer-events-none"
            />
        </Card>
    );
}

const MetricBox = ({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) => (
    <div className="flex items-center justify-between p-4 rounded-[1.5rem] bg-[#111]/40 border border-white/5 backdrop-blur-sm group/pill relative overflow-hidden">
        <div className="relative z-10 flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1.5">{label}</span>
            <div className="flex items-center gap-2.5">
                <div className={cn("p-1.5 rounded-lg bg-white/5", color)}>
                    {icon}
                </div>
                <span className="text-base font-bold text-white tracking-tight">{value}</span>
            </div>
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-5 scale-150 rotate-12">
            {icon}
        </div>
    </div>
);
