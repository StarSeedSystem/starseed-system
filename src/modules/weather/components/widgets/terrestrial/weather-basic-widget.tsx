'use client';

import React, { useState, useEffect } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData, MOCK_WEATHER_DATA } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import {
    useWidgetProvider,
    WidgetDataSourceControl,
} from '@/components/dashboard/widgets/widget-data-source-control';
import {
    CloudRain, Wind, ThermometerSun, MapPin, Sparkles,
    Cloud, Sun, History, CalendarClock, Activity,
    Zap, Droplets, ArrowUpRight, ArrowDownRight,
    Navigation, Shield
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type TabType = 'current' | 'forecast' | 'history';

// ════════════════════════════════════════════════════════════════
// Motor de escena climática — traduce código WMO + hora real en una
// paleta y un conjunto de capas atmosféricas (cristal líquido).
// ════════════════════════════════════════════════════════════════
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
    if (h >= 18 && h < 20) return 'sunset';
    if (h >= 5 && h < 6) return 'sunset';
    return 'night';
}

interface SceneSpec {
    gradient: string;   // tailwind from/via/to
    accent: string;     // hex acento
    label: string;
    tint: string;       // rgba para halos
}

function buildScene(cond: SkyCondition, phase: DayPhase): SceneSpec {
    const night = phase === 'night';
    const sunset = phase === 'sunset';
    switch (cond) {
        case 'storm':
            return { gradient: 'from-[#0b1120] via-[#1e1b4b] to-[#020617]', accent: '#a78bfa', label: 'Tormenta eléctrica', tint: 'rgba(167,139,250,0.18)' };
        case 'snow':
            return night
                ? { gradient: 'from-[#1e293b] via-[#334155] to-[#0f172a]', accent: '#bae6fd', label: 'Nieve nocturna', tint: 'rgba(186,230,253,0.16)' }
                : { gradient: 'from-[#cbd5e1] via-[#94a3b8] to-[#64748b]', accent: '#e0f2fe', label: 'Nieve', tint: 'rgba(224,242,254,0.22)' };
        case 'fog':
            return { gradient: 'from-[#475569] via-[#64748b] to-[#334155]', accent: '#cbd5e1', label: 'Niebla densa', tint: 'rgba(203,213,225,0.20)' };
        case 'rain':
            return night
                ? { gradient: 'from-[#0f172a] via-[#1e293b] to-[#0c1424]', accent: '#38bdf8', label: 'Lluvia nocturna', tint: 'rgba(56,189,248,0.16)' }
                : { gradient: 'from-[#334155] via-[#1e293b] to-[#0f172a]', accent: '#38bdf8', label: 'Lluvia', tint: 'rgba(56,189,248,0.18)' };
        case 'cloudy':
            return night
                ? { gradient: 'from-[#1e293b] via-[#0f172a] to-[#020617]', accent: '#94a3b8', label: 'Nublado nocturno', tint: 'rgba(148,163,184,0.14)' }
                : { gradient: 'from-[#64748b] via-[#475569] to-[#334155]', accent: '#cbd5e1', label: 'Nublado', tint: 'rgba(203,213,225,0.16)' };
        default: // clear
            if (night) return { gradient: 'from-[#020617] via-[#0f1b3d] to-[#1e1b4b]', accent: '#a5b4fc', label: 'Cielo despejado', tint: 'rgba(165,180,252,0.16)' };
            if (sunset) return { gradient: 'from-[#f59e0b] via-[#db2777] to-[#581c87]', accent: '#fbbf24', label: 'Atardecer despejado', tint: 'rgba(251,191,36,0.20)' };
            return { gradient: 'from-[#38bdf8] via-[#3b82f6] to-[#1d4ed8]', accent: '#fde047', label: 'Cielo despejado', tint: 'rgba(253,224,71,0.20)' };
    }
}

export function WeatherBasicWidget({ widgetId = 'weather-basic' }: { widgetId?: string } = {}) {
    const { location } = useWeatherLocation();

    // Selector de proveedor de datos por widget (dominio 'weather').
    // 'open-meteo' (por defecto) y 'mock' cambian los datos reales mostrados;
    // los demás proveedores quedan preparados pero usan el flujo actual.
    const { providerId, setProviderId } = useWidgetProvider(widgetId, 'weather');

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('current');
    const [currentTime, setCurrentTime] = useState(new Date());

    // Mounted flag para evitar mismatch de hidratación en capas aleatorias
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        let mounted = true;

        // Proveedor 'mock': datos sintéticos locales, sin red.
        if (providerId === 'mock') {
            setData(MOCK_WEATHER_DATA.terrestrial);
            setLoading(false);
            return () => { mounted = false; };
        }

        // Proveedor por defecto ('open-meteo') y resto: flujo actual.
        // (Otros proveedores quedan preparados; por ahora reutilizan este flujo.)
        setLoading(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted) {
                    setData(json.terrestrial);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error("Error fetching weather data:", err);
                if (mounted) setLoading(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon, providerId]);

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
    const weatherCode = cur.weather_code || 0;
    // Sensación térmica aproximada (wind chill / humedad) para dato útil
    const feelsLike = Math.round(temp - (windSpeed > 10 ? windSpeed * 0.12 : 0) + (humidity > 70 && temp > 20 ? 2 : 0));

    // Escena dinámica: condición real + fase horaria real
    const condition = conditionFromCode(weatherCode);
    const phase = phaseFromHour(currentTime.getHours());
    const scene = buildScene(condition, phase);
    const isNight = phase === 'night';

    // Daily Forecast Math
    const daily = data.daily || {};
    const forecastMax = Math.round(daily.temperature_2m_max?.[1] || 0);
    const forecastMin = Math.round(daily.temperature_2m_min?.[1] || 0);
    const historyMax = Math.round(daily.temperature_2m_max?.[0] || 0);

    const bgGradient = scene.gradient;

    return (
        <Card className={cn(
            "@container w-full h-full relative overflow-hidden bg-slate-950/60 backdrop-blur-[40px] border border-white/10 flex flex-col group rounded-[2.5rem] shadow-2xl transition-all duration-700 hover:border-[#06f9c8]/30",
            "p-6 @sm:p-8"
        )}>
            {/* Escena climática dinámica (cristal líquido) */}
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 transition-colors duration-1000", bgGradient)} />
            {mounted && <WeatherScene condition={condition} phase={phase} accent={scene.accent} tint={scene.tint} />}
            {/* Reflejo superior de cristal */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.16),transparent_60%)] pointer-events-none" />
            {/* Brillo interior inferior */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-white/10 pointer-events-none" />

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
                    <div className="flex items-center gap-2">
                        <WidgetDataSourceControl
                            widgetId={widgetId}
                            domain="weather"
                            value={providerId}
                            onChange={setProviderId}
                        />
                        <div className="px-3 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-xl">
                            <span className="text-[9px] font-black text-white/70 tracking-[0.1em] uppercase tabular-nums">
                                {currentTime.toLocaleTimeString([], { hour12: false })}
                            </span>
                        </div>
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
                                    <span className="text-4xl @sm:text-6xl font-black mt-8 ml-2 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]" style={{ color: scene.accent }}>°</span>
                                </motion.div>

                                <span className="text-[10px] font-black uppercase tracking-[0.3em] mt-2 mb-1" style={{ color: scene.accent }}>{scene.label}</span>
                                <span className="text-[9px] font-bold text-white/50 mb-2">Sensación {feelsLike}°C</span>

                                <div className="flex items-center gap-4 mt-1 px-6 py-2 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
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
                                <MiniStat icon={<Wind className="w-3 h-3" />} value={`${windSpeed} km/h`} label="Viento" color="text-sky-400" />
                                <MiniStat icon={<Droplets className="w-3 h-3" />} value={`${humidity}%`} label="Humedad" color="text-indigo-400" />
                                <MiniStat icon={<Zap className="w-3 h-3" />} value={`${daily.uv_index_max?.[0] ?? 0}`} label="UV" color="text-yellow-400" />
                                <MiniStat icon={<ThermometerSun className="w-3 h-3" />} value={`${feelsLike}°C`} label="Sensación" color="text-emerald-400" />
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

// ════════════════════════════════════════════════════════════════
// WeatherScene — capas atmosféricas CSS/SVG ligeras, sin librerías.
// Cambia por completo según condición + fase horaria. Respeta
// prefers-reduced-motion (las animaciones se desactivan vía CSS).
// ════════════════════════════════════════════════════════════════
function WeatherScene({ condition, phase, accent, tint }: { condition: SkyCondition; phase: DayPhase; accent: string; tint: string }) {
    const night = phase === 'night';
    const sunset = phase === 'sunset';

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden motion-reduce:[&_*]:!animate-none" aria-hidden>
            {/* Halo atmosférico de fondo (color de escena) */}
            <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-[25%] -right-[15%] w-[80%] h-[80%] rounded-full blur-[100px]"
                style={{ background: tint }}
            />

            {/* SOL — despejado de día */}
            {condition === 'clear' && !night && (
                <motion.div
                    animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute top-6 right-8 w-24 h-24 rounded-full blur-2xl"
                    style={{ background: `radial-gradient(circle, ${accent}cc, transparent 70%)` }}
                />
            )}

            {/* LUNA + ESTRELLAS — noche despejada */}
            {(night && (condition === 'clear' || condition === 'cloudy')) && (
                <>
                    <div className="absolute top-7 right-10 w-16 h-16 rounded-full bg-slate-100/90 shadow-[0_0_40px_rgba(226,232,240,0.5),inset_-8px_-6px_0_rgba(148,163,184,0.35)]" />
                    {[...Array(condition === 'clear' ? 28 : 12)].map((_, i) => (
                        <motion.span
                            key={i}
                            className="absolute rounded-full bg-white"
                            style={{
                                left: `${(i * 53) % 100}%`,
                                top: `${(i * 31) % 70}%`,
                                width: 1 + (i % 3),
                                height: 1 + (i % 3),
                            }}
                            animate={{ opacity: [0.15, 0.9, 0.15] }}
                            transition={{ duration: 2 + (i % 4), repeat: Infinity, delay: (i % 5) * 0.4 }}
                        />
                    ))}
                </>
            )}

            {/* SOL DE ATARDECER */}
            {condition === 'clear' && sunset && (
                <motion.div
                    animate={{ y: [0, 6, 0], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute bottom-10 right-12 w-28 h-28 rounded-full blur-xl"
                    style={{ background: `radial-gradient(circle, ${accent}, #db277788 60%, transparent 75%)` }}
                />
            )}

            {/* NUBES — nublado / lluvia / tormenta / nieve */}
            {['cloudy', 'rain', 'storm', 'snow'].includes(condition) && (
                <>
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className="absolute rounded-full bg-white/15 blur-2xl"
                            style={{ top: `${8 + i * 14}%`, width: `${50 + i * 12}%`, height: 60 + i * 16, left: '-20%' }}
                            animate={{ x: ['0%', '140%'] }}
                            transition={{ duration: 40 + i * 14, repeat: Infinity, ease: 'linear', delay: i * 6 }}
                        />
                    ))}
                </>
            )}

            {/* LLUVIA */}
            {(condition === 'rain' || condition === 'storm') && (
                <div className="absolute inset-0 opacity-60">
                    {[...Array(condition === 'storm' ? 50 : 36)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-px rounded-full"
                            style={{
                                left: `${(i * 37) % 100}%`,
                                height: 22 + (i % 5) * 6,
                                background: `linear-gradient(to bottom, transparent, ${accent}99)`,
                                top: -40,
                            }}
                            animate={{ y: ['0%', '780%'], opacity: [0, 1, 0] }}
                            transition={{ duration: 0.55 + (i % 4) * 0.12, repeat: Infinity, ease: 'linear', delay: (i % 8) * 0.18 }}
                        />
                    ))}
                </div>
            )}

            {/* DESTELLOS DE TORMENTA */}
            {condition === 'storm' && (
                <motion.div
                    className="absolute inset-0 bg-white/30"
                    animate={{ opacity: [0, 0, 0.5, 0, 0.25, 0] }}
                    transition={{ duration: 6, repeat: Infinity, times: [0, 0.6, 0.63, 0.68, 0.72, 0.8], ease: 'easeOut' }}
                />
            )}

            {/* NIEVE */}
            {condition === 'snow' && (
                <div className="absolute inset-0">
                    {[...Array(34)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute rounded-full bg-white/80"
                            style={{ left: `${(i * 29) % 100}%`, width: 3 + (i % 3), height: 3 + (i % 3), top: -10 }}
                            animate={{ y: ['0%', '760%'], x: [0, (i % 2 ? 16 : -16), 0], opacity: [0, 1, 0.4] }}
                            transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: 'linear', delay: (i % 7) * 0.5 }}
                        />
                    ))}
                </div>
            )}

            {/* NIEBLA */}
            {condition === 'fog' && (
                <>
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className="absolute left-0 w-[160%] h-20 bg-white/20 blur-2xl"
                            style={{ top: `${20 + i * 22}%` }}
                            animate={{ x: ['-30%', '10%', '-30%'] }}
                            transition={{ duration: 18 + i * 6, repeat: Infinity, ease: 'easeInOut', delay: i * 3 }}
                        />
                    ))}
                </>
            )}

            {/* Reflejo de cristal líquido recorriendo la superficie */}
            <motion.div
                animate={{ x: ['-120%', '220%'] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'linear', repeatDelay: 4 }}
                className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-white/8 to-transparent skew-x-12"
            />
        </div>
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
