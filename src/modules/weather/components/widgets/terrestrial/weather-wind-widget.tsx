'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Wind, Activity, Compass, ArrowUpRight, Gauge, Navigation, Info, MoveUpRight, Zap, Tornado } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WeatherWindWidget - Liquid Crystal Hyper-Optimized
 * 
 * Features:
 * - Aerodynamic Vector HUD (360° Ribbon Flow)
 * - Kinetic Turbulence Index
 * - Anemometric Displacement HUD
 * - 12h Velocity Projection
 */
export function WeatherWindWidget() {
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
                console.error("Error fetching wind data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const windSpeed = data?.current?.wind_speed_10m || 12.5;
    const windDirection = data?.current?.wind_direction_10m || 225;
    const windGusts = data?.current?.wind_gusts_10m || 18.4;

    const hourlySpeeds = data?.hourly?.wind_speed_10m?.slice(0, 12) || Array(12).fill(12);
    const hourlyTimes = data?.hourly?.time?.slice(0, 12) || Array(12).fill("00:00");
    const maxSpeed = Math.max(...hourlySpeeds, 1);

    const speedNormalized = Math.max(0.2, Math.min(3, windSpeed / 20));

    const windState = useMemo(() => {
        if (windSpeed < 10) return { id: 'laminar', label: 'Laminar', color: 'text-emerald-400', tone: '#10b981', icon: Wind };
        if (windSpeed < 25) return { id: 'steady', label: 'Breeze', color: 'text-cyan-400', tone: '#06b6d4', icon: MoveUpRight };
        return { id: 'turbulent', label: 'Gale', color: 'text-orange-400', tone: '#f97316', icon: Tornado };
    }, [windSpeed]);

    return (
        <Card className="@container relative overflow-hidden w-full h-full min-h-[450px] bg-[#020508] border border-white/10 group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-emerald-500/30">

            {/* Aerodynamic Ribbon Background */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={cn(
                    "absolute inset-0 transition-opacity duration-1000",
                    windSpeed > 25 ? "opacity-20 bg-[radial-gradient(circle_at_50%_40%,#f9731611,transparent_70%)]" : "opacity-10 bg-[radial-gradient(circle_at_50%_40%,#10b98111,transparent_70%)]"
                )} />

                {/* Wind Ribbons (Flowing Lines) */}
                {[...Array(10)].map((_, i) => (
                    <motion.div
                        key={i}
                        initial={{ x: "-20%", opacity: 0 }}
                        animate={{
                            x: "120%",
                            opacity: [0, 0.3, 0],
                        }}
                        transition={{
                            duration: (3 + Math.random() * 5) / speedNormalized,
                            repeat: Infinity,
                            ease: "linear",
                            delay: Math.random() * 5
                        }}
                        className={cn("absolute h-[1px] bg-gradient-to-r from-transparent via-current to-transparent blur-[0.5px]", windState.color)}
                        style={{
                            top: `${10 + (i * 9)}%`,
                            width: `${200 + Math.random() * 400}px`,
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
                            "group-hover:border-emerald-500/40 text-emerald-400"
                        )}>
                            <windState.icon className={cn("size-5", windSpeed > 40 && "animate-pulse")} />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40 leading-none mb-1">Aero.Kinetic.v3</h2>
                            <span className="text-sm font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                                Wind Vector Node
                                <div className={cn("size-1 rounded-full", windSpeed > 25 ? "bg-orange-500 animate-ping" : "bg-emerald-500")} />
                            </span>
                        </div>
                    </div>

                    <div className="px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] backdrop-blur-md text-[9px] font-black tracking-widest text-white/40 flex items-center gap-2">
                        <Compass className="size-3 text-emerald-500" />
                        BEARING: {windDirection}°
                    </div>
                </div>

                {/* Main Velocity HUD */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <div className="relative group/speed">
                        {/* Directional HUD Ring */}
                        <svg className="size-64 @md:size-72 -rotate-90 overflow-visible">
                            <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                            <motion.circle
                                cx="50%" cy="50%" r="45%"
                                fill="none"
                                stroke={windState.tone}
                                strokeWidth="12"
                                strokeDasharray="10 290"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ rotate: windDirection }}
                                transition={{ type: "spring", stiffness: 40, damping: 10 }}
                                strokeLinecap="round"
                                style={{ filter: `drop-shadow(0 0 15px ${windState.tone}66)` }}
                            />
                            {/* Compass Markers */}
                            {['N', 'E', 'S', 'W'].map((dir, i) => (
                                <text
                                    key={dir}
                                    x="50%" y="8%"
                                    textAnchor="middle"
                                    className="text-[10px] font-black fill-white/20 uppercase"
                                    transform={`rotate(${i * 90}, 50%, 50%)`}
                                >
                                    {dir}
                                </text>
                            ))}
                        </svg>

                        {/* Centered Speed Value */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.span
                                key={windSpeed}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={cn("text-[90px] @md:text-[110px] font-black leading-none tracking-tighter text-white", windState.color)}
                            >
                                {Math.round(windSpeed)}
                            </motion.span>
                            <span className="text-[12px] font-black tracking-[0.4em] uppercase text-white/40 -mt-2">Velocity km/h</span>

                            <div className={cn(
                                "mt-4 px-3 py-1 rounded-full border text-[9px] font-black tracking-widest uppercase flex items-center gap-2",
                                "bg-white/5 border-white/10 text-white/60"
                            )}>
                                {windState.label} Flow
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-Metric Matrix */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                        { label: 'Gusts', val: Math.round(windGusts), unit: 'km/h', icon: Zap, color: 'text-orange-400' },
                        { label: 'Direction', val: windDirection, unit: '°', icon: Navigation, color: 'text-cyan-400' },
                        { label: 'Pressure dP', val: (windSpeed * 0.1).toFixed(1), unit: 'Pa', icon: Gauge, color: 'text-emerald-400' }
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

                {/* 12h Velocity Forecast */}
                <div className="mt-4 flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">Velocity Flux Matrix</span>
                        <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">12h Stability</span>
                    </div>
                    <div className="h-12 flex items-end gap-[1.5px] px-1 relative">
                        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/5" />
                        {hourlySpeeds.map((val: number, i: number) => {
                            const h = (val / maxSpeed) * 100;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(10, h)}%` }}
                                    className={cn(
                                        "flex-1 rounded-t-[1px] transition-colors",
                                        val > 25 ? "bg-orange-500 shadow-[0_0_8px_#f97316]" : "bg-emerald-500/20"
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
