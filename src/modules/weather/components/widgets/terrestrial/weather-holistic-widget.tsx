'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    Globe, Zap, Maximize2, Sparkles, Activity, ShieldCheck,
    Waves, Wind, Thermometer, Leaf, BarChart3, Fingerprint,
    Cpu, Radio, Signal, Target, Layers, Compass
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from 'next/link';
import { cn } from "@/lib/utils";

// Dynamically import the 3D scene for performance
const WeatherHolisticScene = React.lazy(() => import('./weather-holistic-scene'));

export function WeatherHolisticWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted) {
                    setData(json);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching holistic weather data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const terrestrial = data?.terrestrial?.current || {};
    const temp = Math.round(terrestrial.temperature_2m || 0);
    const windSpeed = terrestrial.wind_speed_10m || 0;
    const humidity = terrestrial.relative_humidity_2m || 50;
    const aqi = data?.terrestrial?.current?.us_aqi || 0;
    const pressure = terrestrial.pressure_msl || 1013;

    const energetic = data?.energetic || {};
    const kpIndex = energetic.kp || 0;

    const synergyScore = useMemo(() => {
        const tempScore = Math.max(0, 100 - Math.abs(temp - 22) * 4);
        const humScore = Math.max(0, 100 - Math.abs(humidity - 50) * 2);
        const aqiScore = Math.max(0, 100 - (aqi > 50 ? (aqi - 50) : 0));
        return Math.round((tempScore + humScore + aqiScore) / 3);
    }, [temp, humidity, aqi]);

    if (loading || !data) {
        return (
            <Card className="w-full h-full bg-slate-950/40 backdrop-blur-3xl border-white/5 flex items-center justify-center rounded-[2.5rem]">
                <div className="flex flex-col items-center gap-4">
                    <Activity className="w-8 h-8 text-[#06f9c8] animate-pulse" />
                    <span className="text-[10px] font-black tracking-[0.5em] text-[#06f9c8] uppercase">Syncing_Biosphere</span>
                </div>
            </Card>
        );
    }

    return (
        <Card
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="@container w-full h-full relative overflow-hidden bg-[#020508]/40 backdrop-blur-[40px] border border-white/10 p-8 flex flex-col group rounded-[3.5rem] transition-all duration-1000 hover:border-[#06f9c8]/30 shadow-2xl"
        >
            {/* Liquid Crystal FX Layers */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-full h-full bg-[#06f9c8]/5 blur-[200px] rounded-full animate-pulse" />
                <div className="absolute -bottom-[20%] -left-[20%] w-full h-full bg-blue-500/5 blur-[200px] rounded-full" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,249,200,0.03),transparent_70%)]" />

                {/* Micro-Digital Pattern */}
                <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay" />
            </div>

            {/* 3D Scene Layer */}
            <div className="absolute inset-0 z-0 opacity-40 group-hover:opacity-80 transition-all duration-1000 scale-110 group-hover:scale-100 filter blur-[2px] group-hover:blur-0">
                <Suspense fallback={null}>
                    <WeatherHolisticScene
                        temp={temp}
                        kpIndex={kpIndex}
                        humidity={humidity}
                        condition={terrestrial.weather_code_label || "Clear"}
                    />
                </Suspense>
            </div>

            {/* Header: Biosphere Telemetry HUD */}
            <div className="relative z-10 flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                    <div className="relative">
                        <motion.div
                            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="absolute inset-0 bg-[#06f9c8] blur-2xl rounded-full"
                        />
                        <div className="size-14 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center transition-all duration-500 shadow-2xl group-hover:border-[#06f9c8]/40">
                            <Globe className="size-6 text-[#06f9c8] group-hover:rotate-[360deg] transition-transform duration-1000" />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1.5">
                            <h3 className="text-[11px] font-black text-[#06f9c8] uppercase tracking-[0.5em] leading-none">Omni.Biosphere.v1</h3>
                            <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                                <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#34d399]" />
                                <span className="text-[8px] font-black text-emerald-400 tracking-widest uppercase text-shadow-glow">SYNC_STABLE</span>
                            </div>
                        </div>
                        <p className="text-2xl font-black text-white tracking-tighter uppercase tabular-nums drop-shadow-lg">
                            Ecosystem.Synergy.Index
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-xl shadow-inner hidden @xl:flex items-center gap-3">
                        <div className="flex gap-1">
                            {[1, 2, 3].map(i => <div key={i} className="size-1 rounded-full bg-[#06f9c8]/40" />)}
                        </div>
                        <span className="text-[10px] font-black text-[#06f9c8]/60 tracking-[0.4em] uppercase">NEURAL_LINK: 98%</span>
                    </div>
                    <div className="size-10 rounded-xl border border-white/5 bg-white/[0.03] flex items-center justify-center hover:border-[#06f9c8]/30 transition-colors">
                        <Maximize2 className="size-4 text-white/20" />
                    </div>
                </div>
            </div>

            {/* Main Stage: Synergy Ring HUD */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-6">
                <div className="relative size-64 @md:size-80 flex items-center justify-center group/ring">
                    {/* Kinetic Orbital Ring */}
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-[-20px] rounded-full border border-dashed border-[#06f9c8]/10"
                    />

                    {/* Multi-Layered Gauges */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none filter drop-shadow-[0_0_50px_rgba(6,249,200,0.15)]" viewBox="0 0 100 100">
                        {/* Outer Track */}
                        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-white/5" />

                        {/* Synergy Progress - Liquid Crystal Gradient */}
                        <motion.circle
                            cx="50" cy="50" r="45"
                            fill="none"
                            stroke="url(#holisticGradient)"
                            strokeWidth="5"
                            strokeDasharray="283"
                            initial={{ strokeDashoffset: 283 }}
                            animate={{ strokeDashoffset: 283 - (283 * synergyScore) / 100 }}
                            transition={{ duration: 2.5, ease: "circOut" }}
                            strokeLinecap="round"
                            className="filter drop-shadow-[0_0_25px_rgba(6,249,200,0.5)]"
                        />

                        {/* Health Pulse Indicator */}
                        <motion.circle
                            cx="50" cy="50" r="40"
                            fill="none"
                            stroke="rgba(255,255,255,0.05)"
                            strokeWidth="1"
                            strokeDasharray="2,4"
                            className="animate-spin-slow"
                        />

                        <defs>
                            <linearGradient id="holisticGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#06f9c8" />
                                <stop offset="50%" stopColor="#22d3ee" />
                                <stop offset="100%" stopColor="#06f9c8" />
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Score Centerpiece */}
                    <div className="relative flex flex-col items-center group/score">
                        <motion.div
                            animate={{ scale: hovered ? 1.05 : 1 }}
                            className="flex flex-col items-center"
                        >
                            <div className="flex items-baseline gap-2 relative">
                                <motion.span
                                    key={synergyScore}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-[9.5rem] @md:text-[11rem] font-black text-white tracking-tighter tabular-nums drop-shadow-[0_30px_70px_rgba(0,0,0,0.6)]"
                                >
                                    {synergyScore}
                                </motion.span>
                                <span className="text-3xl font-black text-[#06f9c8] drop-shadow-[0_0_30px_rgba(6,249,200,0.5)] outline-text ml-1">%</span>
                            </div>
                            <div className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-[#06f9c8]/10 border border-[#06f9c8]/20 backdrop-blur-2xl shadow-2xl -mt-6 relative z-20">
                                <Sparkles className="size-4 text-[#06f9c8] animate-pulse" />
                                <span className="text-[10px] font-black text-[#06f9c8] uppercase tracking-[0.4em]">Biosphere_Sync_Ok</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* Neural Orbitals */}
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 15 + i * 8, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 pointer-events-none"
                        >
                            <div
                                className="absolute top-0 left-1/2 -translate-x-1/2 size-2.5 rounded-full bg-[#06f9c8] blur-[1px] shadow-[0_0_15px_#06f9c8]"
                                style={{ transform: `translateX(-50%) translateY(${i * 12}px)`, opacity: 0.2 + i * 0.2 }}
                            />
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Bottom Grid: Multi-Layered Telemetry Tiles */}
            <div className="relative z-10 grid grid-cols-2 @[40rem]:grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/5">
                <MiniTelemetryNode
                    icon={<Thermometer className="size-4" />}
                    label="Thermal_Flux"
                    value={`${temp}°`}
                    sub="Stable_Iso"
                    color="text-rose-400"
                />
                <MiniTelemetryNode
                    icon={<Waves className="size-4" />}
                    label="Aquatic_Sat"
                    value={`${humidity}%`}
                    sub="Hydrated"
                    color="text-blue-400"
                />
                <MiniTelemetryNode
                    icon={<Leaf className="size-4" />}
                    label="Biotic_Purity"
                    value={`${aqi} AQI`}
                    sub="Pure_Air"
                    color="text-emerald-400"
                />
                <MiniTelemetryNode
                    icon={<Activity className="size-4" />}
                    label="Neural_Flux"
                    value={`${kpIndex} Kp`}
                    sub="High_Freq"
                    color="text-purple-400"
                />
            </div>

            {/* Footer HUD Stat */}
            <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                    <Fingerprint className="size-4 text-white/20" />
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em] mb-1">Biosphere.Signature.Hash</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-[#06f9c8]/40 tracking-widest tabular-nums uppercase">0x8C_Ecosystem_V1</span>
                            <div className="size-1 rounded-full bg-[#06f9c8]/20" />
                            <span className="text-[10px] font-black text-white/30 tracking-widest uppercase">Verified</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <Signal className="size-4 text-[#06f9c8]/40" />
                        <span className="text-[9px] font-black text-[#06f9c8]/60 uppercase tracking-[0.3em]">Neural.Core.Active</span>
                    </div>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map((s) => (
                            <div key={s} className={cn("w-1.5 h-3 rounded-full", s <= 3 ? "bg-[#06f9c8] shadow-[0_0_8px_#06f9c8]" : "bg-white/5")} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Scanning Laser Overlay */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#06f9c8]/30 to-transparent z-50 pointer-events-none"
            />
        </Card>

    );
}

function MiniTelemetryNode({ icon, label, value, sub, color }: any) {
    return (
        <div className="flex flex-col p-4 rounded-[2.5rem] bg-white/[0.03] border border-white/5 hover:border-[#06f9c8]/20 hover:bg-white/[0.06] transition-all group/node shadow-xl">
            <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-xl bg-white/5", color)}>
                    {icon}
                </div>
                <div className="flex gap-1">
                    {[1, 2].map(i => (
                        <div key={i} className="w-1 h-3 rounded-full bg-white/10" />
                    ))}
                </div>
            </div>
            <div className="flex flex-col">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.4em] mb-1.5">{label}</span>
                <span className="text-2xl font-black text-white tracking-tighter tabular-nums leading-none mb-1.5">{value}</span>
                <span className={cn("text-[9px] font-bold uppercase tracking-widest", color)}>{sub}</span>
            </div>
        </div>
    );
}