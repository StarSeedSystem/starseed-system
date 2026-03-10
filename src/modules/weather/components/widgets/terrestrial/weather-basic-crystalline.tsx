'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Maximize2, Activity, Wind, Droplets, Sun, Moon, Zap, Cpu, Shield, Box } from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

export function WeatherBasicCrystallineWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted) {
                    setData(json);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching weather data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const cur = data?.terrestrial?.current || {};
    const temp = cur.temperature_2m !== undefined ? Math.round(cur.temperature_2m) : 0;
    const windSpeed = cur.wind_speed_10m || 0;
    const humidity = cur.relative_humidity_2m || 0;
    const uv = data?.terrestrial?.daily?.uv_index_max?.[0] || 0;
    const moonPhaseStr = data?.astronomical?.moon_phase > 0.5 ? 'WANING' : 'WAXING';

    const hologramFlicker: Variants = {
        initial: { opacity: 0, scaleY: 0.8, filter: 'brightness(2) contrast(2)' },
        animate: {
            opacity: [0, 1, 0.9, 1],
            scaleY: 1,
            filter: 'brightness(1) contrast(1)',
            transition: { duration: 0.6, times: [0, 0.2, 0.4, 1], ease: "easeOut" }
        }
    };

    return (
        <Card className="@container w-full h-full relative overflow-hidden bg-slate-950/80 backdrop-blur-2xl border-white/10 group rounded-[2rem] transition-all duration-500 shadow-2xl">
            {/* Prism Background Effects */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
                <div className="absolute top-[-20%] left-[-10%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_center,rgba(0,127,255,0.05)_0%,transparent_50%)]" />
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,#007FFF05,transparent,#39FF1405,transparent,#FFbf0005,transparent)]"
                />
            </div>

            <AnimatePresence>
                {!loading && (
                    <motion.div
                        variants={hologramFlicker}
                        initial="initial"
                        animate="animate"
                        className="relative z-10 w-full h-full flex flex-col p-5 @md:p-6"
                    >
                        {/* Status Header */}
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-white/5">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-[#007FFF] tracking-[0.4em] uppercase">Stratosphere_Readout</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-display font-medium text-white tracking-tight">{location.name.split(',')[0]}</span>
                                    <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                                        <span className="text-[8px] font-mono text-white/40">NODE_02</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#39FF14]/5 border border-[#39FF14]/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse shadow-[0_0_8px_#39FF14]" />
                                    <span className="text-[9px] font-black text-[#39FF14] tracking-widest uppercase">SYS_STABLE</span>
                                </div>
                                <div className="flex gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={cn("w-4 h-1 rounded-sm transition-colors duration-500", i < 4 ? "bg-[#39FF14]/40" : "bg-white/5")} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Main Body */}
                        <div className="flex-1 flex flex-col justify-center gap-8">
                            <div className="flex items-center justify-between">
                                <div className="relative">
                                    <div className="flex items-baseline gap-2">
                                        <motion.span
                                            animate={{ opacity: [1, 0.7, 1] }}
                                            transition={{ duration: 0.1, repeat: 1, repeatDelay: 4 }}
                                            className="text-7xl @md:text-8xl font-black font-display text-white tracking-tighter tabular-nums drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                                        >
                                            {temp}
                                        </motion.span>
                                        <span className="text-2xl font-light text-[#007FFF] mb-4">°C</span>
                                    </div>
                                    <div className="absolute -bottom-2 left-0 w-48 h-px bg-gradient-to-r from-[#007FFF] via-white/20 to-transparent" />
                                </div>

                                {/* Crystalline Geometric Graphic */}
                                <div className="relative w-24 h-24 @md:w-32 @md:h-32 flex items-center justify-center">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-0 border border-white/5 rounded-full"
                                    />
                                    <motion.div
                                        animate={{ rotate: -360 }}
                                        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                        className="absolute inset-2 border border-[#FFbf00]/20 rounded-lg flex items-center justify-center"
                                    >
                                        <Box className="w-8 h-8 text-[#FFbf00] opacity-50" />
                                    </motion.div>
                                    <div className="flex flex-col items-center">
                                        <Moon className="w-8 h-8 text-[#FFbf00] mb-1" />
                                        <span className="text-[8px] font-black text-[#FFbf00]/60 tracking-[0.2em]">{moonPhaseStr}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Metric Brackets */}
                            <div className="grid grid-cols-3 gap-4 pt-6 mt-auto border-t border-white/5">
                                <MetricBracket icon={<Wind className="w-3 h-3" />} label="AIR_VEL" value={`${Math.round(windSpeed)}`} unit="KH" color="#39FF14" />
                                <MetricBracket icon={<Droplets className="w-3 h-3" />} label="MOIST_LVL" value={`${Math.round(humidity)}`} unit="PCT" color="#007FFF" />
                                <MetricBracket icon={<Sun className="w-3 h-3" />} label="PHOTON_UV" value={`${uv}`} unit="IDX" color="#FFbf00" />
                            </div>
                        </div>

                        {/* Side Actions */}
                        <Link href="/atmosphere" className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/30 hover:text-[#007FFF] hover:border-[#007FFF]/30 transition-all z-20 overflow-hidden group/action">
                            <div className="absolute inset-0 bg-[#007FFF]/10 translate-y-full group-hover/action:translate-y-0 transition-transform duration-300" />
                            <Maximize2 className="w-4 h-4 relative z-10" />
                        </Link>

                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-8 h-8 pointer-events-none">
                            <div className="absolute top-0 left-0 w-px h-8 bg-gradient-to-b from-[#39FF14] to-transparent" />
                            <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-[#39FF14] to-transparent" />
                        </div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none">
                            <div className="absolute bottom-0 right-0 w-px h-8 bg-gradient-to-t from-white/20 to-transparent" />
                            <div className="absolute bottom-0 right-0 w-8 h-px bg-gradient-to-l from-white/20 to-transparent" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

const MetricBracket = ({ icon, label, value, unit, color }: { icon: React.ReactNode, label: string, value: string, unit: string, color: string }) => (
    <div className="flex flex-col gap-3 group cursor-pointer relative">
        <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
            <div className="p-1.5 rounded-lg bg-white/5" style={{ color }}>
                {icon}
            </div>
            <span className="text-[8px] font-black tracking-widest uppercase text-white">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
            <span className="text-xl font-display font-medium text-white tabular-nums tracking-wider">{value}</span>
            <span className="text-[10px] font-light text-white/30">{unit}</span>
        </div>
        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                whileHover={{ width: '100%' }}
                className="h-full bg-current"
                style={{ color }}
            />
        </div>
    </div>
);
