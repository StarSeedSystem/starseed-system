'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Maximize2, Wind, Droplets, Sun, Moon, Waves, Activity, Sparkles, Navigation } from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

// Motor de escena climática (condición WMO + fase horaria → paleta/capas)
type SkyCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
type DayPhase = 'day' | 'sunset' | 'night';

function conditionFromCode(code: number): SkyCondition {
    if ([95, 96, 99].includes(code)) return 'storm';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([45, 48].includes(code)) return 'fog';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    if ([1, 2, 3].includes(code)) return 'cloudy';
    return 'clear';
}
function phaseFromHour(h: number): DayPhase {
    if (h >= 6 && h < 18) return 'day';
    if ((h >= 18 && h < 20) || (h >= 5 && h < 6)) return 'sunset';
    return 'night';
}
function fluidScene(cond: SkyCondition, phase: DayPhase) {
    const night = phase === 'night', sunset = phase === 'sunset';
    switch (cond) {
        case 'storm': return { c1: 'bg-violet-700/30', c2: 'bg-indigo-900/30', accent: '#a78bfa', label: 'Tormenta', from: 'from-[#0b1120]', via: 'via-[#1e1b4b]', to: 'to-[#020617]' };
        case 'snow': return { c1: 'bg-sky-200/20', c2: 'bg-slate-300/20', accent: '#bae6fd', label: 'Nieve', from: night ? 'from-[#1e293b]' : 'from-[#cbd5e1]', via: night ? 'via-[#334155]' : 'via-[#94a3b8]', to: night ? 'to-[#0f172a]' : 'to-[#64748b]' };
        case 'fog': return { c1: 'bg-slate-300/20', c2: 'bg-slate-400/15', accent: '#cbd5e1', label: 'Niebla', from: 'from-[#475569]', via: 'via-[#64748b]', to: 'to-[#334155]' };
        case 'rain': return { c1: 'bg-sky-600/25', c2: 'bg-blue-800/20', accent: '#38bdf8', label: 'Lluvia', from: night ? 'from-[#0f172a]' : 'from-[#334155]', via: 'via-[#1e293b]', to: 'to-[#0f172a]' };
        case 'cloudy': return { c1: 'bg-slate-400/20', c2: 'bg-slate-600/20', accent: '#cbd5e1', label: 'Nublado', from: night ? 'from-[#1e293b]' : 'from-[#64748b]', via: night ? 'via-[#0f172a]' : 'via-[#475569]', to: night ? 'to-[#020617]' : 'to-[#334155]' };
        default:
            if (night) return { c1: 'bg-indigo-600/20', c2: 'bg-blue-900/25', accent: '#a5b4fc', label: 'Despejado', from: 'from-[#020617]', via: 'via-[#0f1b3d]', to: 'to-[#1e1b4b]' };
            if (sunset) return { c1: 'bg-amber-500/25', c2: 'bg-pink-600/25', accent: '#fbbf24', label: 'Atardecer', from: 'from-[#f59e0b]', via: 'via-[#db2777]', to: 'to-[#581c87]' };
            return { c1: 'bg-sky-400/25', c2: 'bg-blue-600/20', accent: '#fde047', label: 'Despejado', from: 'from-[#38bdf8]', via: 'via-[#3b82f6]', to: 'to-[#1d4ed8]' };
    }
}

export function WeatherBasicFluidWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [now, setNow] = useState(new Date());
    useEffect(() => { setMounted(true); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

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
    const feelsLike = (typeof temp === 'number' && typeof windSpeed === 'number')
        ? Math.round(temp - (windSpeed > 10 ? windSpeed * 0.12 : 0) + (typeof humidity === 'number' && humidity > 70 && temp > 20 ? 2 : 0))
        : temp;

    const wmo = cur.weather_code || 0;
    const condition = conditionFromCode(wmo);
    const phase = phaseFromHour(now.getHours());
    const scene = fluidScene(condition, phase);
    const conditionStr = scene.label;
    const statusLabel = (condition === 'storm' || condition === 'rain') ? "Active" : "Stable";

    return (
        <Card className="@container w-full h-full relative overflow-hidden bg-slate-950/40 backdrop-blur-3xl border-white/10 group rounded-[2.5rem] transition-all duration-700 hover:border-blue-400/30 shadow-2xl">
            {/* Capa base de gradiente según escena */}
            <div className={cn("absolute inset-0 z-0 bg-gradient-to-br opacity-60 transition-colors duration-1000", scene.from, scene.via, scene.to)} />
            {/* Fluid Background Layers (color de escena) */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
                <motion.div
                    animate={{ scale: [1, 1.2, 1], x: [0, 20, 0], y: [0, -20, 0] }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    className={cn("absolute -top-1/2 -left-1/2 w-full h-full blur-[120px] rounded-full", scene.c1)}
                />
                <motion.div
                    animate={{ scale: [1, 1.3, 1], x: [0, -30, 0], y: [0, 30, 0] }}
                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className={cn("absolute -bottom-1/2 -right-1/2 w-full h-full blur-[100px] rounded-full", scene.c2)}
                />
            </div>
            {/* Escena climática (capas atmosféricas) */}
            {mounted && <FluidScene condition={condition} phase={phase} accent={scene.accent} />}
            {/* Reflejo superior de cristal */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.14),transparent_60%)] z-0 pointer-events-none" />

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
                                <span className="text-2xl font-light" style={{ color: scene.accent }}>°</span>
                            </div>
                            <span className="text-xs font-black uppercase tracking-[0.4em] -mt-2 drop-shadow-glow" style={{ color: scene.accent }}>
                                {conditionStr}
                            </span>
                            <span className="text-[9px] font-bold text-white/50 mt-1">Sensación {feelsLike}°C</span>
                        </div>
                    </div>
                </div>

                {/* Floating Metrics Pills */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <MetricPill icon={<Wind className="w-3 h-3" />} label="WIND" value={`${windSpeed}k/h`} color="text-emerald-400" />
                    <MetricPill icon={<Droplets className="w-3 h-3" />} label="HUMIDITY" value={`${humidity}%`} color="text-blue-400" />
                    <MetricPill icon={<Sun className="w-3 h-3" />} label="ÍNDICE UV" value={`${uv}`} color="text-amber-400" />
                    <MetricPill icon={phase === 'night' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />} label="SENSACIÓN" value={`${feelsLike}°C`} color="text-purple-400" />
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

// Capas atmosféricas ligeras (sin librerías). Respeta prefers-reduced-motion.
function FluidScene({ condition, phase, accent }: { condition: SkyCondition; phase: DayPhase; accent: string }) {
    const night = phase === 'night';
    const sunset = phase === 'sunset';
    return (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden motion-reduce:[&_*]:!animate-none" aria-hidden>
            {condition === 'clear' && !night && (
                <motion.div
                    animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                    className={cn("absolute w-24 h-24 rounded-full blur-2xl", sunset ? "bottom-8 right-10" : "top-6 right-8")}
                    style={{ background: `radial-gradient(circle, ${accent}cc, transparent 70%)` }}
                />
            )}
            {night && (condition === 'clear' || condition === 'cloudy') && (
                <>
                    <div className="absolute top-6 right-8 w-12 h-12 rounded-full bg-slate-100/90 shadow-[0_0_30px_rgba(226,232,240,0.5),inset_-6px_-4px_0_rgba(148,163,184,0.35)]" />
                    {[...Array(condition === 'clear' ? 20 : 8)].map((_, i) => (
                        <motion.span key={i} className="absolute rounded-full bg-white"
                            style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 60}%`, width: 1 + (i % 2), height: 1 + (i % 2) }}
                            animate={{ opacity: [0.15, 0.9, 0.15] }}
                            transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: (i % 5) * 0.4 }} />
                    ))}
                </>
            )}
            {['cloudy', 'rain', 'storm', 'snow'].includes(condition) && [0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute rounded-full bg-white/12 blur-2xl"
                    style={{ top: `${6 + i * 13}%`, width: `${50 + i * 12}%`, height: 50 + i * 14, left: '-20%' }}
                    animate={{ x: ['0%', '140%'] }}
                    transition={{ duration: 42 + i * 14, repeat: Infinity, ease: 'linear', delay: i * 6 }} />
            ))}
            {(condition === 'rain' || condition === 'storm') && (
                <div className="absolute inset-0 opacity-60">
                    {[...Array(condition === 'storm' ? 44 : 30)].map((_, i) => (
                        <motion.div key={i} className="absolute w-px rounded-full"
                            style={{ left: `${(i * 37) % 100}%`, height: 20 + (i % 5) * 6, background: `linear-gradient(to bottom, transparent, ${accent}99)`, top: -40 }}
                            animate={{ y: ['0%', '760%'], opacity: [0, 1, 0] }}
                            transition={{ duration: 0.55 + (i % 4) * 0.12, repeat: Infinity, ease: 'linear', delay: (i % 8) * 0.18 }} />
                    ))}
                </div>
            )}
            {condition === 'storm' && (
                <motion.div className="absolute inset-0 bg-white/25"
                    animate={{ opacity: [0, 0, 0.5, 0, 0.2, 0] }}
                    transition={{ duration: 6, repeat: Infinity, times: [0, 0.6, 0.63, 0.68, 0.72, 0.8], ease: 'easeOut' }} />
            )}
            {condition === 'snow' && (
                <div className="absolute inset-0">
                    {[...Array(28)].map((_, i) => (
                        <motion.div key={i} className="absolute rounded-full bg-white/80"
                            style={{ left: `${(i * 29) % 100}%`, width: 3 + (i % 3), height: 3 + (i % 3), top: -10 }}
                            animate={{ y: ['0%', '740%'], x: [0, (i % 2 ? 14 : -14), 0], opacity: [0, 1, 0.4] }}
                            transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: 'linear', delay: (i % 7) * 0.5 }} />
                    ))}
                </div>
            )}
            {condition === 'fog' && [0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute left-0 w-[160%] h-16 bg-white/20 blur-2xl" style={{ top: `${22 + i * 22}%` }}
                    animate={{ x: ['-30%', '10%', '-30%'] }}
                    transition={{ duration: 18 + i * 6, repeat: Infinity, ease: 'easeInOut', delay: i * 3 }} />
            ))}
        </div>
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
