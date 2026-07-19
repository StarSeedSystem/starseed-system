"use client";

import React, { useState } from 'react';
import { ClimateMap } from '@/modules/weather/components/widgets/terrestrial/climate-map';
import {
    WeatherLocationProvider,
    useWeatherLocation,
    type LocationData,
} from '@/modules/weather/context/weather-location-context';
import {
    Globe,
    Wind,
    RefreshCw,
    Sun,
    MapPin,
    ChevronLeft,
    Droplets,
    ShieldAlert,
    Rocket,
    Search,
    type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import { useAppearance } from '@/context/appearance-context';
import { useSpaceWeather } from '@/modules/weather/hooks/use-space-weather';
import {
    SpaceTabPanel,
    SolarTabPanel,
    SpacePanelSkeleton,
    SpaceErrorPanel,
    NoaaAttribution,
} from '@/modules/weather/components/space/space-weather-panels';
import {
    isGeomagneticStorm,
    type SpaceWeatherSnapshot,
} from '@/components/dashboard/apps/data-sources/space-weather-sources';
import { SplineUIWrapper } from '@/components/ui/spline-ui-wrapper';

// Polished Terrestrial Weather Widgets (auto-fetch su propia ubicación)
import { WeatherTemperatureWidget } from '@/modules/weather/components/widgets/terrestrial/weather-temperature-widget';
import { WeatherWindWidget } from '@/modules/weather/components/widgets/terrestrial/weather-wind-widget';
import { WeatherHumidityWidget } from '@/modules/weather/components/widgets/terrestrial/weather-humidity-widget';
import { WeatherAirQualityWidget } from '@/modules/weather/components/widgets/terrestrial/weather-air-quality-widget';
import { WeatherAstronomyWidget } from '@/modules/weather/components/widgets/terrestrial/weather-astronomy-widget';
import { WeatherForecastWidget } from '@/modules/weather/components/widgets/terrestrial/weather-forecast-widget';
import { WeatherUvWidget } from '@/modules/weather/components/widgets/terrestrial/weather-uv-widget';
import { WeatherPressureWidget } from '@/modules/weather/components/widgets/terrestrial/weather-pressure-widget';
import { WeatherVisibilityWidget } from '@/modules/weather/components/widgets/terrestrial/weather-visibility-widget';

const WeatherHolisticWidget = dynamic(
    () =>
        import('@/modules/weather/components/widgets/terrestrial/weather-holistic-widget').then(
            (mod) => mod.WeatherHolisticWidget,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full min-h-[300px] w-full items-center justify-center rounded-3xl bg-black/40 text-xs text-white/50 animate-pulse">
                Sincronizando holístico…
            </div>
        ),
    },
);

type TabState = 'terrestre' | 'espacial' | 'solar';

interface TabDef {
    id: TabState;
    label: string;
    icon: LucideIcon;
    accent: string;
}

const TABS: TabDef[] = [
    { id: 'terrestre', label: 'Terrestre', icon: Globe, accent: '#39FF14' },
    { id: 'espacial', label: 'Espacial', icon: Rocket, accent: '#007FFF' },
    { id: 'solar', label: 'Solar', icon: Sun, accent: '#FFBF00' },
];

function AtmosphereDashboard() {
    const { searchLocation, setLocation, isSearching } = useWeatherLocation();
    const { config } = useAppearance();
    const systemReducedMotion = useReducedMotion();
    // Movimiento reducido si el sistema lo pide O el usuario desactivó animaciones.
    const reduceMotion = Boolean(systemReducedMotion) || !config.animations.enabled;

    // UI States
    const [activeTab, setActiveTab] = useState<TabState>('terrestre');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<LocationData[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [activeMapOverlay, setActiveMapOverlay] = useState<string | undefined>(undefined);

    // Live Space Weather (NOAA SWPC) — solo se consume en pestañas espacial/solar.
    const { data: spaceData, loading: spaceLoading, refreshing, error: spaceError, refresh, lastUpdated } =
        useSpaceWeather(60_000);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        const results = await searchLocation(searchQuery);
        setSearchResults(results);
        setShowResults(true);
    };

    const handleSelectLocation = (loc: LocationData) => {
        setLocation(loc);
        setShowResults(false);
        setSearchQuery('');
    };

    const storm = spaceData ? isGeomagneticStorm(spaceData) : false;
    const motionDur = reduceMotion ? 0 : 0.4;

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden font-inter">
            {/* ── Cinematic Background (detrás de todo) ───────────────── */}
            <div className="absolute inset-0 z-0 bg-[#000510]">
                <AnimatePresence mode="wait">
                    {activeTab === 'terrestre' ? (
                        <motion.div
                            key="bg-terrestre"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: motionDur }}
                            className="h-full w-full"
                        >
                            <ClimateMap activeOverlay={activeMapOverlay} />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="bg-space"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: motionDur }}
                            className="h-full w-full"
                        >
                            <SplineUIWrapper
                                sceneUrl="https://prod.spline.design/zJacodBoEMgObolF/scene.splinecode"
                                className="h-full w-full scale-[1.05]"
                                onSceneLoad={(app) => {
                                    try {
                                        const demoTextNames = [
                                            'Liquid and dust',
                                            'Bento 3D',
                                            'Bento 3',
                                            'Light mode',
                                            'Dark mode',
                                            'Text',
                                            'Core',
                                        ];
                                        for (const name of demoTextNames) {
                                            const obj = app.findObjectByName(name);
                                            if (obj) obj.visible = false;
                                        }
                                        const camera = app.findObjectByName('Camera');
                                        if (camera) camera.position.z *= 0.7;
                                    } catch (e) {
                                        console.warn('[Atmosphere] Scene cleanup:', e);
                                    }
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Velo de legibilidad: oscurece levemente el fondo bajo el contenido. */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#000510]/70 via-transparent to-[#000510]/80" />
            </div>

            {/* ── HEADER (flujo normal, sin solapamientos) ────────────── */}
            <header className="relative z-30 shrink-0 px-[clamp(0.75rem,3vw,2.25rem)] pt-[clamp(0.75rem,2vw,1.25rem)]">
                <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    {/* Back + Title */}
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard"
                            aria-label="Volver al dashboard"
                            className="group flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#001F3F]/60 backdrop-blur-xl transition-all hover:border-[#007FFF]/50 hover:bg-[#007FFF]/20 cursor-pointer"
                        >
                            <ChevronLeft className="size-5 text-white/70 transition-colors group-hover:text-[#007FFF]" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="font-display text-lg font-bold leading-tight tracking-wider text-white drop-shadow-md sm:text-xl lg:text-2xl">
                                ATMÓSFERA
                            </h1>
                            <p className="text-[0.6rem] font-bold uppercase tracking-[0.22em] text-[#007FFF] drop-shadow-md">
                                Telemetría Unificada
                            </p>
                        </div>
                    </div>

                    {/* Trinity Tabs */}
                    <nav
                        aria-label="Capas de telemetría"
                        className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-[#001F3F]/45 p-1 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] sm:w-auto"
                    >
                        {TABS.map((tab) => {
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-pressed={active}
                                    className="relative flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors duration-200 sm:flex-none sm:px-5 sm:text-sm cursor-pointer"
                                    style={{
                                        color: active ? tab.accent : undefined,
                                    }}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId={reduceMotion ? undefined : 'tab-pill'}
                                            className="absolute inset-0 rounded-full border"
                                            style={{
                                                backgroundColor: `${tab.accent}1f`,
                                                borderColor: `${tab.accent}4d`,
                                                boxShadow: `inset 0 0 16px ${tab.accent}26`,
                                            }}
                                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                        />
                                    )}
                                    <tab.icon
                                        className={`relative size-4 ${active ? '' : 'text-slate-300'}`}
                                    />
                                    <span
                                        className={`relative ${active ? '' : 'text-slate-300'}`}
                                    >
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Search */}
                    <div className="relative w-full lg:w-auto">
                        <form onSubmit={handleSearch} className="relative">
                            <input
                                type="text"
                                placeholder="Ciudad o coordenadas…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => {
                                    if (searchResults.length > 0) setShowResults(true);
                                }}
                                className="w-full rounded-full border border-white/20 bg-[#001F3F]/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/45 backdrop-blur-xl transition-all focus:border-[#39FF14]/50 focus:outline-none lg:w-72"
                            />
                            <button
                                type="submit"
                                aria-label="Buscar ubicación"
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 transition-colors hover:text-[#39FF14] cursor-pointer"
                            >
                                {isSearching ? (
                                    <RefreshCw className="size-4 animate-spin" />
                                ) : (
                                    <Search className="size-4" />
                                )}
                            </button>
                        </form>

                        <AnimatePresence>
                            {showResults && searchResults.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: reduceMotion ? 0 : 0.18 }}
                                    className="absolute right-0 top-12 z-40 w-full overflow-hidden rounded-2xl border border-[#39FF14]/30 bg-[#001F3F]/90 shadow-2xl backdrop-blur-3xl lg:w-80"
                                >
                                    {searchResults.map((res, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSelectLocation(res)}
                                            className="group flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#39FF14]/10 cursor-pointer"
                                        >
                                            <div className="flex min-w-0 flex-col">
                                                <span className="truncate text-sm text-white group-hover:text-[#39FF14]">
                                                    {res.name}
                                                </span>
                                                <span className="truncate text-xs text-slate-400">
                                                    {res.country ?? ''}
                                                </span>
                                            </div>
                                            <MapPin className="size-4 shrink-0 text-white/30 group-hover:text-[#39FF14]" />
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Storm banner — bajo el header, sin posiciones absolutas que se monten. */}
                <AnimatePresence>
                    {activeTab !== 'terrestre' && storm && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: reduceMotion ? 0 : 0.25 }}
                            className="mx-auto mt-3 flex max-w-[1800px] items-center justify-center"
                        >
                            <div className="flex items-center gap-3 rounded-full border border-red-500/50 bg-red-900/40 px-5 py-2 shadow-[0_0_20px_rgba(220,20,60,0.35)] backdrop-blur-md">
                                <ShieldAlert
                                    className={`size-4 text-red-400 ${reduceMotion ? '' : 'animate-pulse'}`}
                                />
                                <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-100">
                                    Tormenta geomagnética activa
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </header>

            {/* ── MAIN (scrollable, flex-1) ───────────────────────────── */}
            <main className="relative z-10 flex-1 overflow-y-auto scrollbar-hide px-[clamp(0.75rem,3vw,2.25rem)] py-[clamp(0.75rem,2vw,1.5rem)]">
                <div className="mx-auto max-w-[1800px]">
                    <AnimatePresence mode="wait">
                        {/* ── TERRESTRE ── */}
                        {activeTab === 'terrestre' && (
                            <motion.div
                                key="terrestre"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: motionDur, ease: [0.23, 1, 0.32, 1] }}
                                className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3"
                            >
                                {/* Métricas primarias (ocupan 2 columnas en xl) */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:col-span-2">
                                    <div className="min-h-[300px]">
                                        <WeatherTemperatureWidget />
                                    </div>
                                    <div className="grid grid-rows-2 gap-4 sm:gap-5">
                                        <div className="min-h-[140px]">
                                            <WeatherWindWidget />
                                        </div>
                                        <div className="min-h-[140px]">
                                            <WeatherAirQualityWidget />
                                        </div>
                                    </div>
                                </div>

                                {/* Pronóstico (columna alta a la derecha en xl) */}
                                <div className="min-h-[300px] xl:row-span-2">
                                    <WeatherForecastWidget />
                                </div>

                                {/* Sensores secundarios */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:col-span-2">
                                    <div className="min-h-[280px]">
                                        <WeatherHumidityWidget />
                                    </div>
                                    <div className="min-h-[280px]">
                                        <WeatherUvWidget />
                                    </div>
                                </div>

                                {/* Ambientales avanzados */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:col-span-2">
                                    <div className="min-h-[280px]">
                                        <WeatherPressureWidget />
                                    </div>
                                    <div className="min-h-[280px]">
                                        <WeatherVisibilityWidget />
                                    </div>
                                </div>

                                {/* Astronomía + Escena holística */}
                                <div className="min-h-[280px] xl:col-span-2">
                                    <WeatherAstronomyWidget />
                                </div>
                                <div className="min-h-[420px]">
                                    <WeatherHolisticWidget />
                                </div>
                            </motion.div>
                        )}

                        {/* ── ESPACIAL (datos reales NOAA SWPC) ── */}
                        {activeTab === 'espacial' && (
                            <motion.div
                                key="espacial"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: motionDur, ease: 'easeOut' }}
                                className="flex flex-col gap-3"
                            >
                                {spaceLoading && !spaceData ? (
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                        <SpacePanelSkeleton accent="#007FFF" />
                                        <SpacePanelSkeleton accent="#007FFF" />
                                        <SpacePanelSkeleton accent="#007FFF" />
                                    </div>
                                ) : spaceError && !spaceData ? (
                                    <SpaceErrorPanel accent="#007FFF" error={spaceError} onRetry={refresh} />
                                ) : spaceData ? (
                                    <>
                                        <SpaceTabPanel snapshot={spaceData} reducedMotion={reduceMotion} />
                                        <NoaaAttribution
                                            accent="#007FFF"
                                            lastUpdated={lastUpdated}
                                            refreshing={refreshing}
                                            timeTag={(spaceData as SpaceWeatherSnapshot).geomagnetic.timeTag}
                                        />
                                    </>
                                ) : null}
                            </motion.div>
                        )}

                        {/* ── SOLAR (datos reales NOAA SWPC + imagen SDO) ── */}
                        {activeTab === 'solar' && (
                            <motion.div
                                key="solar"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: motionDur, ease: 'easeOut' }}
                                className="flex flex-col gap-3"
                            >
                                {spaceLoading && !spaceData ? (
                                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                        <SpacePanelSkeleton accent="#FFBF00" />
                                        <SpacePanelSkeleton accent="#FFBF00" />
                                        <SpacePanelSkeleton accent="#FFBF00" />
                                    </div>
                                ) : spaceError && !spaceData ? (
                                    <SpaceErrorPanel accent="#FFBF00" error={spaceError} onRetry={refresh} />
                                ) : spaceData ? (
                                    <>
                                        <SolarTabPanel snapshot={spaceData} reducedMotion={reduceMotion} />
                                        <NoaaAttribution
                                            accent="#FFBF00"
                                            lastUpdated={lastUpdated}
                                            refreshing={refreshing}
                                            timeTag={(spaceData as SpaceWeatherSnapshot).solarWind.timeTag}
                                        />
                                    </>
                                ) : null}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* ── FOOTER: controles de capa del mapa (solo Terrestre) ── */}
            <AnimatePresence>
                {activeTab === 'terrestre' && (
                    <motion.footer
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: reduceMotion ? 0 : 0.25 }}
                        className="relative z-30 flex shrink-0 justify-center pb-[clamp(0.75rem,2vw,1.25rem)] pt-2"
                    >
                        <div className="flex gap-1 rounded-full border border-white/10 bg-[#001F3F]/60 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                            {[
                                { id: 'temperature', icon: ThermometerIcon, label: 'Temperatura', color: '#FFBF00' },
                                { id: 'precipitation', icon: Droplets, label: 'Precipitación', color: '#007FFF' },
                                { id: 'wind', icon: Wind, label: 'Viento', color: '#39FF14' },
                            ].map((layer) => {
                                const active = activeMapOverlay === layer.id;
                                return (
                                    <button
                                        key={layer.id}
                                        type="button"
                                        aria-label={`Capa: ${layer.label}`}
                                        aria-pressed={active}
                                        onClick={() =>
                                            setActiveMapOverlay((prev) => (prev === layer.id ? undefined : layer.id))
                                        }
                                        className="rounded-full p-2.5 transition-colors cursor-pointer"
                                        style={{
                                            backgroundColor: active ? `${layer.color}1f` : 'transparent',
                                            color: active ? layer.color : 'rgb(203 213 225)',
                                            boxShadow: active ? `0 0 14px ${layer.color}4d` : 'none',
                                            border: `1px solid ${active ? `${layer.color}80` : 'transparent'}`,
                                        }}
                                    >
                                        <layer.icon className="size-5" />
                                    </button>
                                );
                            })}
                        </div>
                    </motion.footer>
                )}
            </AnimatePresence>
        </div>
    );
}

// Thermometer no está garantizado en la versión instalada de lucide → icono propio.
function ThermometerIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
    );
}

export default function AtmospherePage() {
    return (
        <WeatherLocationProvider>
            {/* Pantalla completa cinematográfica: el shell de la app provee scroll,
                pero aquí ocupamos el viewport y gestionamos el scroll interno. */}
            <div className="fixed inset-0 z-[1] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#000510]">
                <AtmosphereDashboard />
            </div>
        </WeatherLocationProvider>
    );
}
