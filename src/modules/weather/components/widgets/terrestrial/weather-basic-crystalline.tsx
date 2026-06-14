'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Maximize2, Activity, Wind, Droplets, Sun, Moon, Zap, Cpu, Shield, Box } from "lucide-react";
import Link from 'next/link';
import { cn } from "@/lib/utils";

// Motor de escena climática (condición WMO + fase horaria)
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
function crystallineScene(cond: SkyCondition, phase: DayPhase) {
    const night = phase === 'night', sunset = phase === 'sunset';
    switch (cond) {
        case 'storm': return { accent: '#a78bfa', label: 'Tormenta', bg: 'bg-[#0b1120]/85', tint: 'rgba(167,139,250,0.10)' };
        case 'snow': return { accent: '#bae6fd', label: 'Nieve', bg: night ? 'bg-[#0f172a]/85' : 'bg-[#1e293b]/80', tint: 'rgba(186,230,253,0.12)' };
        case 'fog': return { accent: '#cbd5e1', label: 'Niebla', bg: 'bg-[#1a1f2b]/85', tint: 'rgba(203,213,225,0.10)' };
        case 'rain': return { accent: '#38bdf8', label: 'Lluvia', bg: 'bg-[#0f172a]/85', tint: 'rgba(56,189,248,0.10)' };
        case 'cloudy': return { accent: '#94a3b8', label: 'Nublado', bg: 'bg-[#111827]/85', tint: 'rgba(148,163,184,0.10)' };
        default:
            if (night) return { accent: '#a5b4fc', label: 'Despejado', bg: 'bg-[#070617]/90', tint: 'rgba(165,180,252,0.10)' };
            if (sunset) return { accent: '#fbbf24', label: 'Atardecer', bg: 'bg-[#1a0f2e]/85', tint: 'rgba(251,191,36,0.12)' };
            return { accent: '#FFbf00', label: 'Despejado', bg: 'bg-[#0c1530]/85', tint: 'rgba(0,127,255,0.08)' };
    }
}

export function WeatherBasicCrystallineWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [now, setNow] = useState(new Date());
    useEffect(() => { setMounted(true); const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

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
    const wmo = cur.weather_code || 0;
    const condition = conditionFromCode(wmo);
    const phase = phaseFromHour(now.getHours());
    const scene = crystallineScene(condition, phase);
    const feelsLike = Math.round(temp - (windSpeed > 10 ? windSpeed * 0.12 : 0) + (humidity > 70 && temp > 20 ? 2 : 0));

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
        <Card className={cn("@container w-full h-full relative overflow-hidden backdrop-blur-2xl border-white/10 group rounded-[2rem] transition-all duration-500 shadow-2xl", scene.bg)}>
            {/* Prism Background Effects + tinte de escena */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
                <div className="absolute top-[-20%] left-[-10%] w-[140%] h-[140%]" style={{ background: `radial-gradient(circle at center, ${scene.tint} 0%, transparent 50%)` }} />
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,#007FFF05,transparent,#39FF1405,transparent,#FFbf0005,transparent)]"
                />
                {mounted && <CrystallineScene condition={condition} phase={phase} accent={scene.accent} />}
                {/* Reflejo de cristal superior */}
                <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.10),transparent_60%)]" />
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
                                        <span className="text-2xl font-light mb-4" style={{ color: scene.accent }}>°C</span>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] mt-1 block" style={{ color: scene.accent }}>{scene.label} · {feelsLike}°C sens.</span>
                                    <div className="absolute -bottom-3 left-0 w-48 h-px" style={{ background: `linear-gradient(to right, ${scene.accent}, rgba(255,255,255,0.2), transparent)` }} />
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
                                        {phase === 'night'
                                            ? <Moon className="w-8 h-8 mb-1" style={{ color: scene.accent }} />
                                            : <Sun className="w-8 h-8 mb-1" style={{ color: scene.accent }} />}
                                        <span className="text-[8px] font-black tracking-[0.2em]" style={{ color: scene.accent, opacity: 0.7 }}>{phase === 'night' ? moonPhaseStr : phase.toUpperCase()}</span>
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

// Capas atmosféricas ligeras (sin librerías). Estética prisma/cristal.
function CrystallineScene({ condition, phase, accent }: { condition: SkyCondition; phase: DayPhase; accent: string }) {
    const night = phase === 'night';
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden motion-reduce:[&_*]:!animate-none" aria-hidden>
            {night && (condition === 'clear' || condition === 'cloudy') && [...Array(condition === 'clear' ? 26 : 12)].map((_, i) => (
                <motion.span key={i} className="absolute rounded-full bg-white"
                    style={{ left: `${(i * 47) % 100}%`, top: `${(i * 29) % 80}%`, width: 1 + (i % 2), height: 1 + (i % 2) }}
                    animate={{ opacity: [0.1, 0.8, 0.1] }}
                    transition={{ duration: 2 + (i % 5), repeat: Infinity, delay: (i % 6) * 0.35 }} />
            ))}
            {['cloudy', 'rain', 'storm', 'snow', 'fog'].includes(condition) && [0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute rounded-full bg-white/8 blur-2xl"
                    style={{ top: `${8 + i * 13}%`, width: `${50 + i * 12}%`, height: 44 + i * 14, left: '-20%' }}
                    animate={{ x: ['0%', '140%'] }}
                    transition={{ duration: 46 + i * 14, repeat: Infinity, ease: 'linear', delay: i * 6 }} />
            ))}
            {(condition === 'rain' || condition === 'storm') && (
                <div className="absolute inset-0 opacity-50">
                    {[...Array(condition === 'storm' ? 36 : 24)].map((_, i) => (
                        <motion.div key={i} className="absolute w-px rounded-full"
                            style={{ left: `${(i * 41) % 100}%`, height: 20 + (i % 5) * 6, background: `linear-gradient(to bottom, transparent, ${accent}aa)`, top: -40 }}
                            animate={{ y: ['0%', '760%'], opacity: [0, 1, 0] }}
                            transition={{ duration: 0.6 + (i % 4) * 0.12, repeat: Infinity, ease: 'linear', delay: (i % 8) * 0.18 }} />
                    ))}
                </div>
            )}
            {condition === 'storm' && (
                <motion.div className="absolute inset-0 bg-white/15"
                    animate={{ opacity: [0, 0, 0.45, 0, 0.18, 0] }}
                    transition={{ duration: 6, repeat: Infinity, times: [0, 0.6, 0.63, 0.68, 0.72, 0.8], ease: 'easeOut' }} />
            )}
            {condition === 'snow' && (
                <div className="absolute inset-0">
                    {[...Array(26)].map((_, i) => (
                        <motion.div key={i} className="absolute rounded-full bg-white/80"
                            style={{ left: `${(i * 33) % 100}%`, width: 3 + (i % 3), height: 3 + (i % 3), top: -10 }}
                            animate={{ y: ['0%', '740%'], x: [0, (i % 2 ? 14 : -14), 0], opacity: [0, 1, 0.4] }}
                            transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: 'linear', delay: (i % 7) * 0.5 }} />
                    ))}
                </div>
            )}
            {condition === 'fog' && [0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute left-0 w-[160%] h-16 bg-white/12 blur-2xl" style={{ top: `${22 + i * 22}%` }}
                    animate={{ x: ['-30%', '10%', '-30%'] }}
                    transition={{ duration: 20 + i * 6, repeat: Infinity, ease: 'easeInOut', delay: i * 3 }} />
            ))}
        </div>
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
