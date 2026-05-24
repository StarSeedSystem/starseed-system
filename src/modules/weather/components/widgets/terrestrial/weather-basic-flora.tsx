import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from "@/components/ui/card";
import { Leaf, Droplets, Wind, Sprout, Activity, Navigation, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function WeatherBasicFloraWidget() {
    const { location } = useWeatherLocation();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [spores, setSpores] = useState<any[]>([]);

    useEffect(() => {
        let mounted = true;
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted && json.terrestrial?.current) {
                    setData(json.terrestrial.current);
                    setLoading(false);
                    setSpores([...Array(8)].map((_, i) => ({
                        top: `${Math.random() * 80 + 10}%`,
                        left: `${Math.random() * 80 + 10}%`,
                        duration: 4 + Math.random() * 6,
                        x: Math.random() * 30 - 15,
                        size: 2 + Math.random() * 3
                    })));
                }
            })
            .catch(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    const temp = data?.temperature_2m !== undefined ? Math.round(data.temperature_2m) : 0;
    const humidity = data?.relative_humidity_2m !== undefined ? Math.round(data.relative_humidity_2m) : 0;
    const isActive = temp > 15 && humidity > 40;

    return (
        <Card className="@container relative w-full h-full bg-slate-950/40 backdrop-blur-2xl border-white/5 p-4 flex flex-col group rounded-3xl overflow-hidden transition-all duration-700 hover:border-[#10b981]/30">
            {/* Bioluminescent Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#10b981]/10 blur-[100px] rounded-full" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 blur-[80px] rounded-full" />

                {/* Micro-Spores */}
                <AnimatePresence>
                    {spores.map((spore, idx) => (
                        <motion.div
                            key={idx}
                            className="absolute bg-emerald-400/30 rounded-full blur-[1px]"
                            style={{ top: spore.top, left: spore.left, width: spore.size, height: spore.size }}
                            animate={{
                                y: [0, -40, 0],
                                x: [0, spore.x, 0],
                                opacity: [0.1, 0.4, 0.1]
                            }}
                            transition={{ duration: spore.duration, repeat: Infinity, ease: "easeInOut" }}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Header HUD */}
            <div className="relative z-10 flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[#10b981]/10 border border-[#10b981]/20">
                        <Leaf className="w-4 h-4 text-[#10b981]" />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] leading-tight mb-0.5">
                            Bio-Synthesis
                        </h3>
                        <p className="text-sm font-display font-bold text-white tracking-tight italic">Ecology Pulse</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
                    <Activity className={cn("w-3 h-3", isActive ? "text-[#10b981] animate-pulse" : "text-slate-500")} />
                    <span className={cn("text-[9px] font-black tracking-widest uppercase", isActive ? "text-[#10b981]" : "text-slate-500")}>
                        {isActive ? "ACTIVE" : "DORMANT"}
                    </span>
                </div>
            </div>

            {/* Main Visual: The Growing Sprout */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 py-4">
                <div className="relative flex flex-col items-center">
                    <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 6, repeat: Infinity }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-[#10b981]/20 blur-3xl rounded-full" />
                        <Sprout className="w-20 h-20 text-[#10b981] drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                    </motion.div>

                    <div className="mt-6 flex flex-col items-center">
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-black font-display text-white tracking-tighter tabular-nums">{temp}</span>
                            <span className="text-lg font-light text-white/20">°C</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#10b981]/60 uppercase tracking-widest mt-1">Growth Optimal</span>
                    </div>
                </div>
            </div>

            {/* Metrics HUD: Horizontal Layout */}
            <div className="relative z-10 grid grid-cols-2 gap-2 pt-4 border-t border-white/5">
                {[
                    { icon: <Droplets className="w-3 h-3" />, label: "HYDRATION", val: `${humidity}%`, color: "text-blue-400" },
                    { icon: <Wind className="w-3 h-3" />, label: "AERATION", val: "Optimal", color: "text-sky-400" },
                ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-2">
                            <div className={cn("p-1.5 rounded-lg bg-white/5", item.color)}>
                                {item.icon}
                            </div>
                            <span className="text-[8px] font-black text-white/30 tracking-wider transition-colors group-hover:text-white/50">{item.label}</span>
                        </div>
                        <span className="text-[10px] font-bold text-white pr-1">{item.val}</span>
                    </div>
                ))}
            </div>

            {/* Scanning Scanline */}
            <motion.div
                animate={{ top: ['-10%', '110%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#10b981]/30 to-transparent z-20 pointer-events-none"
            />
        </Card>
    );
}
