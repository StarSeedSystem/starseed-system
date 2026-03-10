'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import {
    Sparkles, Wind, CloudRain, Cloud, Sun, Zap, Info, MapPin,
    Activity, Navigation, Maximize2, Droplets, Thermometer, ShieldCheck,
    ArrowDownToLine, Eye, Gauge
} from 'lucide-react';
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from 'next/link';

export function WeatherOmniClimateWidget() {
    const { location } = useWeatherLocation();
    const [weatherData, setWeatherData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const fetchWeather = async () => {
            if (!location || !location.lat || !location.lon) return;
            setLoading(true);
            try {
                const data = await fetchWeatherData(location.lat, location.lon);
                setWeatherData(data);
            } catch (error) {
                console.error("Failed to fetch holistic weather data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchWeather();
    }, [location]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (loading || !weatherData) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-8 rounded-[2.5rem] border border-white/5 font-display min-h-[400px] overflow-hidden relative">
                <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-[#06f9c8]/10 via-transparent to-transparent"
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                />
                <div className="w-16 h-16 border-4 border-[#06f9c8]/30 border-t-[#06f9c8] rounded-full animate-spin mb-6 shadow-[0_0_20px_rgba(6,249,200,0.4)]" />
                <p className="text-[10px] uppercase font-black tracking-[0.4em] animate-pulse text-[#06f9c8]">Establishing atmospheric link...</p>
            </div>
        );
    }

    const current = weatherData.current || {};
    const temp = Math.round(current.temperature_2m || 0);
    const windSpeed = current.wind_speed_10m || 0;
    const humidity = current.relative_humidity_2m || 0;
    const cloudCover = current.cloud_cover || 0;
    const wmoCode = current.weather_code ?? current.weathercode;

    let condition = "Clear";
    let conditionLabel = "Stable / Clear";
    if (wmoCode !== undefined) {
        if ([1, 2, 3, 45, 48].includes(wmoCode)) { condition = "Cloudy"; conditionLabel = "Stable / Cloudy"; }
        else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(wmoCode)) { condition = "Rain"; conditionLabel = "Liquid Precipitation"; }
        else if ([71, 73, 75, 77, 85, 86].includes(wmoCode)) { condition = "Snow"; conditionLabel = "Crystalline Precip"; }
        else if ([95, 96, 99].includes(wmoCode)) { condition = "Thunderstorm"; conditionLabel = "Kinetic Storm"; }
        else if (wmoCode === 0) { condition = "Clear"; conditionLabel = "Stable / Optimal"; }
    } else {
        condition = cloudCover > 50 ? "Cloudy" : "Clear";
        conditionLabel = condition === "Cloudy" ? "Stable / Cloudy" : "Stable / Optimal";
    }

    const aqi = weatherData.air_quality?.us_aqi || 24;

    return (
        <Card className="@container/widget relative w-full h-full flex flex-col gap-6 bg-slate-950/60 backdrop-blur-3xl border-white/10 group rounded-[2.5rem] p-6 @md:p-8 transition-all duration-700 hover:border-[#06f9c8]/30 shadow-2xl overflow-hidden">

            {/* Liquid Crystal Overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,249,200,0.05),transparent_70%)] z-0" />
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                className="absolute -top-[20%] -right-[20%] w-full h-full bg-emerald-500/5 blur-[120px] rounded-full z-0"
            />

            {/* Header: Atmospheric Status HUD */}
            <div className="flex justify-between items-start z-10 w-full p-6 pb-2 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-[#06f9c8] blur-xl opacity-20 animate-pulse" />
                        <div className="relative p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl">
                            <Activity className="w-5 h-5 text-[#06f9c8]" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black tracking-[0.4em] text-[#06f9c8] uppercase leading-none mb-1.5 opacity-60">Climate_Omni_Link</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black tracking-tight text-white leading-none capitalize">{location.name.split(',')[0]}</span>
                            <div className="px-2 py-0.5 rounded-full bg-[#06f9c8]/10 border border-[#06f9c8]/20">
                                <span className="text-[8px] font-black text-[#06f9c8] uppercase tracking-tighter">Verified</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/5 backdrop-blur-xl">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                        <span className="text-[9px] font-black text-white/70 tracking-[0.1em] uppercase">Status:_Nominal</span>
                    </div>
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Sync_T: {new Date().toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Main Stage: Core Telemetry Matrix */}
            <div className="flex-1 flex flex-col z-10 px-6 py-4 relative overflow-hidden">
                <div className="grid grid-cols-1 @[35rem]:grid-cols-2 gap-6 h-full">

                    {/* Left Panel: Primary Thermal Node */}
                    <div className="relative flex flex-col items-center justify-center p-8 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-white/5 backdrop-blur-2xl shadow-inner group/thermal overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-[#06f9c8]/5 via-transparent to-transparent opacity-50" />

                        {/* Thermal Core Visual */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#06f9c8] blur-[100px] opacity-10 group-hover/thermal:scale-125 transition-transform duration-1000" />

                        <div className="relative flex items-center justify-center">
                            <Thermometer className="absolute -top-12 -right-8 w-16 h-16 text-[#06f9c8] opacity-10 rotate-12" />
                            <div className="relative flex items-start">
                                <motion.span
                                    key={temp}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-9xl font-black text-white leading-none tracking-tighter drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                                >
                                    {Math.round(temp)}
                                </motion.span>
                                <span className="text-5xl font-black text-[#06f9c8] mt-4 ml-1 drop-shadow-[0_0_20px_rgba(6,249,200,0.4)]">°</span>
                            </div>
                        </div>

                        <div className="mt-4 px-4 py-2 rounded-xl bg-black/20 border border-white/5 backdrop-blur-md">
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Thermal_Equilibrium</span>
                        </div>
                    </div>

                    {/* Right Panel: Data Mosaic */}
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <MiniDataNode
                            icon={<Droplets className="w-4 h-4" />}
                            value={`${Math.round(humidity)}%`}
                            label="Moisture"
                            color="text-blue-400"
                            desc="H2O Saturation"
                        />
                        <MiniDataNode
                            icon={<Wind className="w-4 h-4" />}
                            value={`${Math.round(windSpeed)}k`}
                            label="Kinetic"
                            color="text-sky-400"
                            desc="Vec_Neutral"
                        />
                        <MiniDataNode
                            icon={<Eye className="w-4 h-4" />}
                            value={`${(weatherData.current?.visibility / 1000).toFixed(1)}km`}
                            label="Visual"
                            color="text-indigo-400"
                            desc="Range_Index"
                        />
                        <MiniDataNode
                            icon={<ArrowDownToLine className="w-4 h-4" />}
                            value={`${Math.round(weatherData.current?.surface_pressure || 1013)}h`}
                            label="Mass"
                            color="text-[#06f9c8]"
                            desc="Baro_Force"
                        />
                    </div>
                </div>

                {/* Holistic Temporal Grid */}
                <div className="hidden @[600px]/widget:flex flex-col gap-6 mt-2 relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-[#06f9c8]/10">
                                <Zap className="w-4 h-4 text-[#06f9c8]" />
                            </div>
                            <span className="text-[10px] font-black tracking-[0.3em] uppercase text-white/40">Neural_Cycle_Projection</span>
                        </div>
                        <Link href="/atmosphere" className="text-[10px] font-black text-[#06f9c8] uppercase hover:underline">Full Audit</Link>
                    </div>

                    <div className="grid grid-cols-5 gap-4">
                        {weatherData.daily?.time?.slice(0, 5).map((day: any, i: number) => (
                            <motion.div
                                key={day}
                                whileHover={{ y: -4, scale: 1.02 }}
                                className="flex flex-col items-center justify-center p-4 rounded-3xl bg-white/5 border border-white/5 hover:border-[#06f9c8]/20 transition-all shadow-lg"
                            >
                                <span className="text-[9px] font-black text-white/40 tracking-widest uppercase mb-3 text-center">{new Date(day).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                                <span className="text-2xl font-black text-white tabular-nums">{Math.round(weatherData.daily.temperature_2m_max[i])}°</span>
                                <span className="text-[11px] font-bold text-[#06f9c8]/60 mt-1">{Math.round(weatherData.daily.temperature_2m_min[i])}°</span>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Scanline Overlay */}
                <motion.div
                    animate={{ top: ['-10%', '110%'] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[#06f9c8]/20 to-transparent z-20 pointer-events-none"
                />
            </div>
        </Card>
    );
}

const MiniDataNode = ({ icon, value, label, color, desc }: any) => (
    <div className="flex flex-col p-5 rounded-[2.5rem] bg-white/5 border border-white/5 hover:border-white/10 transition-all group/node overflow-hidden relative">
        <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-2 rounded-xl bg-white/5 border border-white/5", color)}>
                {icon}
            </div>
            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">{label}</span>
        </div>
        <div className="flex flex-col">
            <span className="text-2xl font-black text-white tabular-nums">{value}</span>
            <span className="text-[8px] font-bold text-white/20 uppercase tracking-tighter mt-1">{desc}</span>
        </div>

        {/* Hover Accent */}
        <div className={cn("absolute bottom-0 left-0 w-full h-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-current to-transparent", color)} />
    </div>
);

const StripMetric = ({ icon, label, value, color }: any) => (
    <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/5 border border-white/5">
        <div className={cn("p-2 rounded-lg bg-white/5", color)}>
            {icon}
        </div>
        <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{label}</span>
            <span className="text-sm font-black text-white tracking-tight">{value}</span>
        </div>
    </div>
);

const MetricCard = ({ icon, label, value, subValue, color, bg, progress, isWind }: any) => (
    <div className={cn("flex-1 p-6 rounded-[2rem] border border-white/5 relative overflow-hidden group/card shadow-xl", bg)}>
        <div className="relative z-10 flex items-center justify-between">
            <div className={cn("p-2.5 rounded-xl border border-white/10", color)}>
                {icon}
            </div>
            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{label}</span>
        </div>

        <div className="relative z-10 mt-4 flex items-baseline gap-3">
            <span className="text-4xl font-black text-white">{value}</span>
            <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/5 border border-white/5", color)}>
                {subValue}
            </span>
        </div>

        {progress !== undefined && (
            <div className="relative z-10 mt-4 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 2, delay: 0.5 }}
                    className={cn("h-full", isWind ? "bg-blue-400" : "bg-emerald-400")}
                />
            </div>
        )}

        {isWind && (
            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <motion.div
                    animate={{ x: [-200, 200] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400 to-transparent skew-x-12"
                />
            </div>
        )}
    </div>
);
