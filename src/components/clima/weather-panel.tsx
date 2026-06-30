"use client";

// ════════════════════════════════════════════════════════════════════════════
// WeatherPanel — Clima actual + por hora + 7 días (Open-Meteo, sin API key)
// ----------------------------------------------------------------------------
// • Ubicación vía navigator.geolocation con degradación elegante a búsqueda
//   manual de ciudad (Open-Meteo Geocoding).
// • Estados: cargando / error / permiso denegado, todos con UI dedicada.
// • UI cristal StarSeed (rounded-2xl, border-white/10, bg-white/[0.02]),
//   responsive, framer-motion, iconos lucide, textos en español.
// SSR-safe: "use client" + guardas typeof window/navigator.
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    MapPin, Search, RefreshCw, Loader2, AlertTriangle, Navigation,
    Droplets, Wind, Thermometer, Gauge,
    Sun, Moon, Cloud, Cloudy, CloudSun, CloudMoon, CloudFog,
    CloudDrizzle, CloudRain, CloudSnow, Snowflake, CloudLightning,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    fetchForecast, searchCity, describeWeather,
    formatHour, formatWeekday, formatTemp,
    type ClimaForecast, type ClimaPlace, type ClimaIconKey,
} from "@/lib/clima/weather";

// Resuelve la clave de icono del mapa WMO a un componente lucide concreto.
const ICON_MAP: Record<ClimaIconKey, LucideIcon> = {
    Sun, Moon, CloudSun, CloudMoon, Cloud, Cloudy, CloudFog,
    CloudDrizzle, CloudRain, CloudSnow, Snowflake, CloudLightning,
};

function WeatherIcon({
    code, isDay, className,
}: {
    code: number;
    isDay: boolean;
    className?: string;
}) {
    const cond = describeWeather(code);
    const key = isDay ? cond.icon : cond.iconNight;
    const Cmp = ICON_MAP[key] ?? Cloud;
    return <Cmp className={className} style={{ color: cond.accent }} />;
}

type Phase = "idle" | "locating" | "loading" | "ready" | "error" | "denied";

export function WeatherPanel() {
    const [phase, setPhase] = useState<Phase>("idle");
    const [forecast, setForecast] = useState<ClimaForecast | null>(null);
    const [placeName, setPlaceName] = useState<string>("");
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Búsqueda de ciudad
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ClimaPlace[]>([]);
    const [searching, setSearching] = useState(false);
    const [showSearch, setShowSearch] = useState(false);

    const lastCoords = useRef<{ lat: number; lon: number } | null>(null);

    // ── Carga del pronóstico para unas coordenadas ──
    const loadForecast = useCallback(async (lat: number, lon: number, name?: string) => {
        lastCoords.current = { lat, lon };
        setPhase("loading");
        setErrorMsg("");
        try {
            const fc = await fetchForecast(lat, lon);
            if (!fc) {
                setErrorMsg("No pudimos obtener el clima. Revisa tu conexión e inténtalo de nuevo.");
                setPhase("error");
                return;
            }
            setForecast(fc);
            if (name) setPlaceName(name);
            setPhase("ready");
        } catch {
            setErrorMsg("Ocurrió un error inesperado al cargar el clima.");
            setPhase("error");
        }
    }, []);

    // ── Geolocalización del navegador con degradación elegante ──
    const locate = useCallback(() => {
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
            setShowSearch(true);
            setPhase("denied");
            return;
        }
        setPhase("locating");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                setPlaceName("Tu ubicación");
                void loadForecast(latitude, longitude, "Tu ubicación");
            },
            () => {
                // Permiso denegado / no disponible → búsqueda manual.
                setShowSearch(true);
                setPhase("denied");
            },
            { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
        );
    }, [loadForecast]);

    // Intento inicial al montar.
    useEffect(() => {
        locate();
    }, [locate]);

    // ── Búsqueda de ciudad ──
    const runSearch = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const q = query.trim();
        if (!q) return;
        setSearching(true);
        try {
            const found = await searchCity(q);
            setResults(found);
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
        }
    }, [query]);

    const selectPlace = useCallback((p: ClimaPlace) => {
        setResults([]);
        setQuery("");
        setShowSearch(false);
        setPlaceName(p.name);
        void loadForecast(p.lat, p.lon, p.name);
    }, [loadForecast]);

    const refresh = useCallback(() => {
        const c = lastCoords.current;
        if (c) void loadForecast(c.lat, c.lon, placeName);
        else locate();
    }, [loadForecast, placeName, locate]);

    const current = forecast?.current;
    const cond = current ? describeWeather(current.weatherCode) : null;

    const hourly = useMemo(() => forecast?.hourly.slice(0, 24) ?? [], [forecast]);
    const daily = useMemo(() => forecast?.daily.slice(0, 7) ?? [], [forecast]);

    // ── Barra de búsqueda (reutilizable) ──
    const SearchBar = (
        <div className="relative w-full sm:max-w-xs">
            <form onSubmit={runSearch} className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar ciudad…"
                    className="w-full rounded-full border border-white/15 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 outline-none transition-colors focus:border-cyan-400/50"
                />
                <button
                    type="submit"
                    aria-label="Buscar ciudad"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-cyan-300 cursor-pointer"
                >
                    {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </button>
            </form>
            {results.length > 0 && (
                <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#0a1020]/95 shadow-2xl backdrop-blur-xl">
                    {results.map((p, i) => (
                        <button
                            key={`${p.lat},${p.lon},${i}`}
                            type="button"
                            onClick={() => selectPlace(p)}
                            className="group flex w-full items-center justify-between gap-2 border-b border-white/5 px-3.5 py-2.5 text-left transition-colors last:border-0 hover:bg-cyan-500/10 cursor-pointer"
                        >
                            <span className="min-w-0">
                                <span className="block truncate text-sm text-white/90 group-hover:text-cyan-200">{p.name}</span>
                                <span className="block truncate text-[11px] text-white/45">{p.country ?? ""}</span>
                            </span>
                            <MapPin className="size-4 shrink-0 text-white/30 group-hover:text-cyan-300" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5 backdrop-blur-xl">
            {/* Cabecera */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10">
                        <CloudSun className="size-5 text-cyan-300" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-white/90">Tiempo de clima</h2>
                        <p className="flex items-center gap-1 text-[12px] text-white/45">
                            <MapPin className="size-3" />
                            <span className="truncate">{placeName || "Detectando ubicación…"}</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {SearchBar}
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={phase === "loading" || phase === "locating"}
                        aria-label="Actualizar clima"
                        className="grid size-9 shrink-0 place-items-center rounded-full border border-white/12 bg-white/[0.04] text-white/60 transition-colors hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={cn("size-4", (phase === "loading" || phase === "locating") && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Estados */}
            {(phase === "locating" || phase === "loading") && (
                <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] py-14 text-center">
                    <Loader2 className="size-7 animate-spin text-cyan-300" />
                    <p className="text-sm text-white/55">
                        {phase === "locating" ? "Obteniendo tu ubicación…" : "Cargando el clima…"}
                    </p>
                </div>
            )}

            {phase === "denied" && (
                <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-amber-400/20 bg-amber-500/[0.04] py-10 px-4 text-center">
                    <Navigation className="size-7 text-amber-300/80" />
                    <p className="max-w-md text-sm text-white/65">
                        No pudimos acceder a tu ubicación. Busca tu ciudad para ver el clima.
                    </p>
                    <div className="mt-1 w-full max-w-xs">{SearchBar}</div>
                    <button
                        type="button"
                        onClick={locate}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 cursor-pointer"
                    >
                        <Navigation className="size-3.5" /> Reintentar ubicación
                    </button>
                </div>
            )}

            {phase === "error" && (
                <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-rose-400/25 bg-rose-500/[0.05] py-12 px-4 text-center">
                    <AlertTriangle className="size-7 text-rose-300" />
                    <p className="max-w-md text-sm text-white/65">{errorMsg}</p>
                    <button
                        type="button"
                        onClick={refresh}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 cursor-pointer"
                    >
                        <RefreshCw className="size-3.5" /> Reintentar
                    </button>
                </div>
            )}

            {phase === "ready" && current && cond && forecast && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                    className="space-y-4"
                >
                    {/* Hero: clima actual */}
                    <div
                        className="relative overflow-hidden rounded-2xl border border-white/10 p-5"
                        style={{ background: `linear-gradient(135deg, ${cond.accent}1f, transparent 70%)` }}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <WeatherIcon code={current.weatherCode} isDay={current.isDay} className="size-16 sm:size-20 drop-shadow" />
                                <div>
                                    <div className="text-5xl font-extralight leading-none text-white sm:text-6xl">
                                        {formatTemp(current.temperature)}
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-white/80">{cond.label}</p>
                                    <p className="text-[12px] text-white/50">
                                        Sensación {formatTemp(current.apparentTemperature)}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-center sm:gap-5">
                                <Metric icon={Droplets} label="Humedad" value={`${Math.round(current.humidity)}%`} />
                                <Metric icon={Wind} label="Viento" value={`${Math.round(current.windSpeed)} km/h`} />
                                <Metric icon={Droplets} label="Precip." value={`${current.precipitation.toFixed(1)} mm`} />
                            </div>
                        </div>
                    </div>

                    {/* Por hora (próximas 24h) */}
                    {hourly.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                            <p className="mb-2.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                                <Thermometer className="size-3.5" /> Próximas horas
                            </p>
                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                {hourly.map((h, i) => (
                                    <div
                                        key={h.time}
                                        className="flex min-w-[58px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-2 py-2.5"
                                    >
                                        <span className="text-[11px] text-white/55">{i === 0 ? "Ahora" : formatHour(h.time)}</span>
                                        <WeatherIcon code={h.weatherCode} isDay={current.isDay} className="size-6" />
                                        <span className="text-sm font-semibold text-white/85">{formatTemp(h.temperature)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 7 días */}
                    {daily.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
                            <p className="mb-2.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                                <Gauge className="size-3.5" /> Pronóstico de 7 días
                            </p>
                            <div className="space-y-1">
                                {daily.map((d, i) => {
                                    const dc = describeWeather(d.weatherCode);
                                    return (
                                        <div
                                            key={d.date}
                                            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]"
                                        >
                                            <span className="w-12 shrink-0 text-sm font-medium capitalize text-white/75">
                                                {formatWeekday(d.date, i)}
                                            </span>
                                            <WeatherIcon code={d.weatherCode} isDay className="size-6 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate text-[12px] text-white/50">{dc.label}</span>
                                            <span className="shrink-0 text-sm font-semibold text-white/85">{formatTemp(d.tempMax)}</span>
                                            <span className="w-8 shrink-0 text-right text-sm text-white/45">{formatTemp(d.tempMin)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <p className="px-1 text-right text-[10px] text-white/30">
                        Datos: Open-Meteo · {new Date(forecast.fetchedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                </motion.div>
            )}
        </section>
    );
}

// ───────────────────────── Métrica compacta ─────────────────────────────────

function Metric({
    icon: Icon, label, value,
}: {
    icon: LucideIcon;
    label: string;
    value: string;
}) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <Icon className="size-4 text-white/45" />
            <span className="text-sm font-semibold text-white/90">{value}</span>
            <span className="text-[10px] uppercase tracking-wide text-white/40">{label}</span>
        </div>
    );
}

export default WeatherPanel;
