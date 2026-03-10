'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Maximize2, Wind, Droplets, Sun, Moon, Waves, Activity, Sparkles, Navigation } from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

export function WeatherBasicFluidWidget() {
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
    const temp = cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : '--';
    const windSpeed = cur.wind_speed_10m !== undefined ? Math.round(cur.wind_speed_10m) : '--';
    const humidity = cur.relative_humidity_2m !== undefined ? Math.round(cur.relative_humidity_2m) : '--';
    const uv = data?.daily?.uv_index_max?.[0] || 0;

    const wmo = cur.weather_code || 0;
    const conditionStr = wmo === 0 ? "Clear Fluid Skies" : wmo < 40 ? "Partly Cloudy" : wmo < 70 ? "Liquid Fall" : wmo < 80 ? "Snow" : "Atmospheric Storm";
    const statusLabel = wmo < 40 ? "Stable" : "Active";

    return (
        <Card className="@container w-full h-full relative overflow-hidden bg-slate-950/40 backdrop-blur-3xl border-white/10 group rounded-[2.5rem] transition-all duration-700 hover:border-blue-400/30 shadow-2xl">
            {/* Fluid Background Layers */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        x: [0, 20, 0],
                        y: [0, -20, 0]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-600/20 blur-[120px] rounded-full"
                />
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        x: [0, -30, 0],
                        y: [0, 30, 0]
                    }}
                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-cyan-500/10 blur-[100px] rounded-full"
                />
            </div>

            {/* Content Hub */}
            <div className="relative z-10 w-full h-full p-5 @md:p-6 flex flex-col justify-between">

                {/* Header HUD */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
                            <Waves className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] leading-none mb-1">Fluid_Atmospere</h3>
                            <p className="text-lg font-display font-medium text-white/90 tracking-tight">{location.name.split(',')[0]}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 backdrop-blur-md">
                            <div className={cn("w-2 h-2 rounded-full animate-pulse", statusLabel === 'Stable' ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 shadow-[0_0_8px_#fbbf24]")} />
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{statusLabel}</span>
                        </div>
                    </div>
                </div>

                {/* Main Temperature Display */}
                <div className="flex-1 flex flex-col items-center justify-center py-6">
                    <div className="relative group/temp">
                        <motion.div
                            animate={{ scale: [1, 1.05, 1], rotate: [0, 2, 0, -2, 0] }}
                            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute -inset-10 bg-blue-500/10 blur-3xl rounded-full opacity-0 group-hover/temp:opacity-100 transition-opacity duration-700"
                        />
                        <div className="relative flex flex-col items-center">
                            <div className="flex items-baseline gap-1">
                                <span className="text-7xl @md:text-8xl font-black font-display text-white tracking-tighter drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                                    {temp}
                                </span>
                                <span className="text-2xl font-light text-blue-400/50">°</span>
                            </div>
                            <span className="text-xs font-black text-blue-400 uppercase tracking-[0.4em] -mt-2 drop-shadow-glow">
                                {conditionStr}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Floating Metrics Pills */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <MetricPill icon={<Wind className="w-3 h-3" />} label="WIND" value={`${windSpeed}k/h`} color="text-emerald-400" />
                    <MetricPill icon={<Droplets className="w-3 h-3" />} label="HUMIDITY" value={`${humidity}%`} color="text-blue-400" />
                    <MetricPill icon={<Sun className="w-3 h-3" />} label="UV_INDEX" value={`${uv} Idx`} color="text-amber-400" />
                    <MetricPill icon={<Sparkles className="w-3 h-3" />} label="SYNC" value="Active" color="text-purple-400" />
                </div>

                {/* Footer HUD */}
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2">
                        <Navigation className="w-3 h-3 text-white/20" />
                        <span className="text-[8px] font-mono text-white/30 tracking-[0.2em] uppercase">STATION_ACTIVE</span>
                    </div>
                    <Link href="/atmosphere" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/20 border border-blue-600/30 text-white hover:bg-blue-600/30 transition-all group/btn active:scale-95">
                        <span className="text-[10px] font-black uppercase tracking-widest">Deep Scan</span>
                        <Maximize2 className="w-3 h-3 group-hover/btn:scale-125 transition-transform" />
                    </Link>
                </div>
            </div>

            {/* Liquid Shine Overlay */}
            <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
                className="absolute top-0 bottom-0 w-32 bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 z-20 pointer-events-none"
            />
        </Card>
    );
}

const MetricPill = ({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) => (
    <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm group/pill cursor-default">
        <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg bg-black/20", color)}>
                {icon}
            </div>
            <div className="flex flex-col">
                <span className="text-[7px] font-black text-white/20 uppercase tracking-widest transition-colors group-hover/pill:text-white/40">{label}</span>
                <span className="text-xs font-bold text-white tracking-tight">{value}</span>
            </div>
        </div>
    </div>
);
