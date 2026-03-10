"use client";

import React, { useState, useEffect } from 'react';
import { ClimateMap } from '@/modules/weather/components/widgets/terrestrial/climate-map';
import { WeatherLocationProvider, useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { fetchWeatherData } from '@/lib/weather-mock';
import { Card } from '@/components/ui/card';
import { Globe, Wind, Zap, RefreshCw, Layers, Calendar, Sun, Gauge, Eye, MapPin, ChevronLeft, Droplets, ShieldAlert, Rocket, Satellite, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

// Import Space Weather Widgets
import { SolarWindWidget } from "@/modules/weather/components/widgets/space/space-weather-solar-wind-widget";
import { KpIndexWidget } from "@/modules/weather/components/widgets/space/space-weather-kp-index-widget";
import { MagnetometerWidget } from "@/modules/weather/components/widgets/space/space-weather-magnetometer-widget";
import { XRayFlareWidget } from "@/modules/weather/components/widgets/space/space-weather-flare-widget";
import { UnifiedSpaceWeather } from "@/modules/weather/services/space/schema";
import { SplineUIWrapper } from "@/components/ui/spline-ui-wrapper";

// Import Polished Terrestrial Weather Widgets
import { WeatherTemperatureWidget } from "@/modules/weather/components/widgets/terrestrial/weather-temperature-widget";
import { WeatherWindWidget } from "@/modules/weather/components/widgets/terrestrial/weather-wind-widget";
import { WeatherHumidityWidget } from "@/modules/weather/components/widgets/terrestrial/weather-humidity-widget";
import { WeatherAirQualityWidget } from "@/modules/weather/components/widgets/terrestrial/weather-air-quality-widget";
import { WeatherAstronomyWidget } from "@/modules/weather/components/widgets/terrestrial/weather-astronomy-widget";
import { WeatherForecastWidget } from "@/modules/weather/components/widgets/terrestrial/weather-forecast-widget";
import { WeatherUvWidget } from "@/modules/weather/components/widgets/terrestrial/weather-uv-widget";
import { WeatherPressureWidget } from "@/modules/weather/components/widgets/terrestrial/weather-pressure-widget";
import { WeatherVisibilityWidget } from "@/modules/weather/components/widgets/terrestrial/weather-visibility-widget";
import dynamic from 'next/dynamic';

const WeatherHolisticWidget = dynamic(
    () => import("@/modules/weather/components/widgets/terrestrial/weather-holistic-widget").then(mod => mod.WeatherHolisticWidget),
    { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center bg-black/50 text-white/50 animate-pulse text-xs">Sincronizando Holístico...</div> }
);

type TabState = 'terrestre' | 'espacial' | 'solar';

function AtmosphereDashboard() {
    const { location, searchLocation, setLocation, isSearching } = useWeatherLocation();

    // Data States
    const [terrestrialData, setTerrestrialData] = useState<any>(null);
    const [spaceData, setSpaceData] = useState<UnifiedSpaceWeather | undefined>(undefined);
    const [loadingTerrestrial, setLoadingTerrestrial] = useState(true);
    const [loadingSpace, setLoadingSpace] = useState(true);

    // UI States
    const [activeTab, setActiveTab] = useState<TabState>('terrestre');
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [activeMapOverlay, setActiveMapOverlay] = useState<string | undefined>(undefined);

    // Fetch Terrestrial Data
    useEffect(() => {
        let mounted = true;
        setLoadingTerrestrial(true);
        fetchWeatherData(location.lat, location.lon)
            .then(json => {
                if (mounted) {
                    setTerrestrialData(json);
                    setLoadingTerrestrial(false);
                }
            })
            .catch(err => {
                console.error("Error fetching terrestrial weather data:", err);
                if (mounted) setLoadingTerrestrial(false);
            });
        return () => { mounted = false; };
    }, [location.lat, location.lon]);

    // Fetch Space Weather Live Data (Engine)
    useEffect(() => {
        async function loadSpaceData() {
            setLoadingSpace(true);
            try {
                const res = await fetch('/api/space-weather/live?station=TEO');
                const result = await res.json();
                if (result.success) {
                    setSpaceData(result.data);
                }
            } catch (error) {
                console.error("Error loading live space weather data:", error);
            } finally {
                setLoadingSpace(false);
            }
        }
        loadSpaceData();
        const interval = setInterval(loadSpaceData, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        const results = await searchLocation(searchQuery);
        setSearchResults(results);
        setShowResults(true);
    };

    const handleSelectLocation = (loc: any) => {
        setLocation(loc);
        setShowResults(false);
        setSearchQuery("");
    };

    // Terrestrial Extractions
    const tCurrent = terrestrialData?.terrestrial?.current;
    const temp = tCurrent?.temperature_2m || 0;
    const humidity = tCurrent?.relative_humidity_2m || 0;
    const windSpeed = tCurrent?.wind_speed_10m || 0;
    const pressure = tCurrent?.surface_pressure || 0;
    const aqi = terrestrialData?.terrestrial?.air_quality?.current?.us_aqi || 0;
    const uvIndex = tCurrent?.uv_index || 0;
    const visibility = tCurrent?.visibility || 0;
    const forecast = terrestrialData?.terrestrial?.daily || { time: [], temperature_2m_max: [], temperature_2m_min: [], weather_code: [], precipitation_probability_max: [] };

    // Space / Solar Extractions
    const alerts = spaceData?.alerts;
    const solarMock = terrestrialData?.solar; // From mock until engine is expanded

    return (
        <>
            {/* Cinematic Backgrounds */}
            <div className="absolute inset-0 z-0 bg-[#000510]">
                {activeTab === 'terrestre' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full">
                        <ClimateMap activeOverlay={activeMapOverlay} />
                    </motion.div>
                )}
                {activeTab !== 'terrestre' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full h-full">
                        {/* Unified Spline WebGL Backdrop for Widgets */}
                        <SplineUIWrapper
                            sceneUrl="https://prod.spline.design/zJacodBoEMgObolF/scene.splinecode"
                            className="w-full h-full scale-[1.05]"
                            onSceneLoad={(app) => {
                                try {
                                    // Remove showcase text elements to convert into pure material backdrop
                                    const demoTextNames = ['Liquid and dust', 'Bento 3D', 'Bento 3', 'Light mode', 'Dark mode', 'Text', 'Core'];
                                    for (const name of demoTextNames) {
                                        const obj = app.findObjectByName(name);
                                        if (obj) obj.visible = false;
                                    }
                                    // Zoom slightly for immersive abstract backdrop
                                    const camera = app.findObjectByName('Camera');
                                    if (camera) {
                                        camera.position.z *= 0.7;
                                    }
                                } catch (e) {
                                    console.warn("[Atmosphere] Scene cleanup:", e);
                                }
                            }}
                        />
                    </motion.div>
                )}
            </div>

            {/* Top Navigation HUD */}
            <div className="absolute top-0 left-0 right-0 px-[clamp(1rem,3vw,2.5rem)] py-[clamp(0.75rem,2vw,1.5rem)] flex flex-col md:flex-row justify-between items-center gap-[clamp(0.5rem,1.5vw,1rem)] z-20 pointer-events-none">

                {/* Back Button & Title */}
                <div className="flex items-center gap-[clamp(0.5rem,1vw,1rem)] pointer-events-auto">
                    <Link href="/dashboard" className="p-[clamp(0.5rem,1vw,0.75rem)] rounded-full bg-[#001F3F]/60 hover:bg-[#007FFF]/20 border border-white/10 hover:border-[#007FFF]/50 backdrop-blur-xl transition-all group shadow-[0_0_15px_rgba(0,127,255,0.2)]">
                        <ChevronLeft className="w-[clamp(1rem,1.5vw,1.5rem)] h-[clamp(1rem,1.5vw,1.5rem)] text-white/70 group-hover:text-[#007FFF]" />
                    </Link>
                    <div className="hidden sm:block">
                        <h1 className="text-[clamp(1.1rem,2.2vw,1.75rem)] font-bold text-white font-display drop-shadow-md tracking-wider">ATMOSPHERE</h1>
                        <p className="text-[clamp(0.5rem,0.7vw,0.75rem)] text-[#007FFF] uppercase tracking-[0.2em] font-bold drop-shadow-md">Unified Telemetry</p>
                    </div>
                </div>

                {/* The Trinity Tabs */}
                <div className="pointer-events-auto bg-[#001F3F]/40 backdrop-blur-xl border border-white/10 rounded-full p-[clamp(0.25rem,0.5vw,0.5rem)] flex gap-[clamp(0.125rem,0.3vw,0.25rem)] shadow-[0_0_30px_rgba(0,0,0,0.5)] mx-auto md:mx-0">
                    <button
                        onClick={() => setActiveTab('terrestre')}
                        className={`flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] py-[clamp(0.375rem,0.7vw,0.625rem)] rounded-full transition-all duration-300 text-[clamp(0.7rem,0.85vw,0.95rem)] font-medium ${activeTab === 'terrestre' ? 'bg-[#39FF14]/20 text-[#39FF14] shadow-[inset_0_0_15px_rgba(57,255,20,0.2)] border border-[#39FF14]/30' : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'}`}
                    >
                        <Globe className="w-[clamp(0.875rem,1vw,1.25rem)] h-[clamp(0.875rem,1vw,1.25rem)]" />
                        <span className="hidden sm:inline">Terrestre</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('espacial')}
                        className={`flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] py-[clamp(0.375rem,0.7vw,0.625rem)] rounded-full transition-all duration-300 text-[clamp(0.7rem,0.85vw,0.95rem)] font-medium ${activeTab === 'espacial' ? 'bg-[#007FFF]/20 text-[#007FFF] shadow-[inset_0_0_15px_rgba(0,127,255,0.2)] border border-[#007FFF]/30' : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'}`}
                    >
                        <Rocket className="w-[clamp(0.875rem,1vw,1.25rem)] h-[clamp(0.875rem,1vw,1.25rem)]" />
                        <span className="hidden sm:inline">Espacial</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('solar')}
                        className={`flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)] px-[clamp(0.75rem,1.5vw,1.5rem)] py-[clamp(0.375rem,0.7vw,0.625rem)] rounded-full transition-all duration-300 text-[clamp(0.7rem,0.85vw,0.95rem)] font-medium ${activeTab === 'solar' ? 'bg-[#FFbf00]/20 text-[#FFbf00] shadow-[inset_0_0_15px_rgba(255,191,0,0.2)] border border-[#FFbf00]/30' : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'}`}
                    >
                        <Sun className="w-[clamp(0.875rem,1vw,1.25rem)] h-[clamp(0.875rem,1vw,1.25rem)]" />
                        <span className="hidden sm:inline">Solar</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="pointer-events-auto relative w-full md:w-auto mt-2 md:mt-0">
                    <form onSubmit={handleSearch} className="relative">
                        <input
                            type="text"
                            placeholder="Target coords/city..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                            className="w-full md:w-[clamp(14rem,18vw,22rem)] bg-[#001F3F]/60 border border-white/20 text-white placeholder-white/50 rounded-full px-[clamp(0.75rem,1vw,1.25rem)] py-[clamp(0.5rem,0.8vw,0.75rem)] pl-[clamp(2rem,2.5vw,2.75rem)] text-[clamp(0.7rem,0.85vw,0.95rem)] focus:outline-none focus:border-[#39FF14]/50 backdrop-blur-xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.3)]"
                        />
                        <button type="submit" className="absolute left-[clamp(0.5rem,0.8vw,0.875rem)] top-1/2 -translate-y-1/2 text-white/50 hover:text-[#39FF14] transition-colors">
                            {isSearching ? <RefreshCw className="w-[clamp(0.875rem,1vw,1.125rem)] h-[clamp(0.875rem,1vw,1.125rem)] animate-spin" /> : <Search className="w-[clamp(0.875rem,1vw,1.125rem)] h-[clamp(0.875rem,1vw,1.125rem)]" />}
                        </button>
                    </form>

                    {/* Search Dropdown */}
                    <AnimatePresence>
                        {showResults && searchResults.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute top-14 right-0 w-full md:w-80 bg-[#001F3F]/90 backdrop-blur-3xl border border-[#39FF14]/30 rounded-2xl overflow-hidden shadow-2xl"
                            >
                                {searchResults.map((res: any, idx: number) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectLocation(res)}
                                        className="w-full text-left px-4 py-3 border-b border-white/5 last:border-0 hover:bg-[#39FF14]/10 transition-colors flex items-center justify-between group"
                                    >
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-sm text-white group-hover:text-[#39FF14] truncate">{res.name}</span>
                                            <span className="text-xs text-slate-400 truncate">{res.admin1} {res.country}</span>
                                        </div>
                                        <MapPin className="w-4 h-4 text-white/30 group-hover:text-[#39FF14] shrink-0" />
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div >

            {/* Global Alert Banner (Space Weather) */}
            <AnimatePresence>
                {
                    activeTab !== 'terrestre' && (alerts?.geomagneticStorm || alerts?.radioBlackout) && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
                        >
                            <div className="bg-red-900/40 backdrop-blur-md border border-red-500/50 rounded-full px-6 py-2 flex items-center gap-3 shadow-[0_0_20px_rgba(220,20,60,0.4)]">
                                <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
                                <span className="text-red-100 text-sm font-bold tracking-widest uppercase">
                                    {alerts.geomagneticStorm && "Geomagnetic Storm"}
                                    {alerts.radioBlackout && " Radio Blackout"}
                                </span>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* ----------------- TAB CONTENT ----------------- */}
            < div className="absolute top-[clamp(5rem,12vw,6.5rem)] bottom-[clamp(3.5rem,6vw,5rem)] left-0 right-0 px-[clamp(0.75rem,3vw,2.5rem)] z-10 pointer-events-none overflow-hidden" >
                <AnimatePresence mode="wait">

                    {/* TERRESTRIAL TAB */}
                    {activeTab === 'terrestre' && (
                        <motion.div
                            key="terrestre"
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 1.02, y: -10 }}
                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                            className="w-full h-full max-w-[1800px] mx-auto overflow-y-auto scrollbar-none pb-12 pt-4 lg:pt-6"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pointer-events-auto">
                                {/* Row 1: Primary Metrics */}
                                <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="h-full">
                                        <WeatherTemperatureWidget />
                                    </div>
                                    <div className="grid grid-rows-2 gap-6">
                                        <WeatherWindWidget />
                                        <WeatherAirQualityWidget />
                                    </div>
                                </div>

                                {/* Row 1-3 Right: Forecast Stream */}
                                <div className="xl:row-span-3 h-full">
                                    <WeatherForecastWidget />
                                </div>

                                {/* Row 2: Secondary Sensors */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 xl:col-span-2">
                                    <div className="h-full min-h-[280px]">
                                        <WeatherHumidityWidget />
                                    </div>
                                    <div className="h-full min-h-[280px]">
                                        <WeatherUvWidget />
                                    </div>
                                </div>

                                {/* Row 3: Advanced Environmentals */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 xl:col-span-2">
                                    <div className="h-full min-h-[280px]">
                                        <WeatherPressureWidget />
                                    </div>
                                    <div className="h-full min-h-[280px]">
                                        <WeatherVisibilityWidget />
                                    </div>
                                </div>

                                {/* Row 4: Advanced Telemetry & Holistic Scene */}
                                <div className="xl:col-span-2">
                                    <WeatherAstronomyWidget />
                                </div>
                                <div className="xl:col-span-1 h-full min-h-[500px]">
                                    <WeatherHolisticWidget />
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* SPACE TAB */}
                    {activeTab === 'espacial' && (
                        <motion.div
                            key="espacial"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="w-full h-full max-w-[1800px] mx-auto flex flex-col lg:flex-row justify-center items-stretch gap-[clamp(1rem,2vw,1.5rem)] overflow-y-auto scrollbar-none pb-4 pt-4 lg:pt-6"
                        >
                            {/* Left Col (Magnetosphere) */}
                            <div className="w-full lg:flex-1 flex flex-col gap-[clamp(1rem,2vw,1.5rem)] pointer-events-auto shrink-0 min-w-0">
                                <KpIndexWidget data={spaceData} loading={loadingSpace} />
                                <MagnetometerWidget data={spaceData} loading={loadingSpace} />
                            </div>

                            {/* Right Col (Ionosphere / Secondary) */}
                            <div className="w-full lg:flex-1 flex flex-col gap-[clamp(1rem,2vw,1.5rem)] pointer-events-auto shrink-0 min-w-0 h-full">
                                <Card className="p-[clamp(1rem,2.5vw,1.75rem)] bg-[#001F3F]/40 backdrop-blur-[40px] border border-[#007FFF]/20 rounded-[clamp(1.25rem,3vw,2rem)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                                    <h2 className="text-[clamp(0.6rem,0.75vw,0.8rem)] font-bold text-[#007FFF] uppercase tracking-widest flex items-center gap-2 mb-[clamp(0.75rem,1.5vw,1.5rem)]">
                                        <Satellite className="w-[clamp(0.875rem,1vw,1.125rem)] h-[clamp(0.875rem,1vw,1.125rem)]" /> Ionospheric Status
                                    </h2>
                                    <div className="space-y-[clamp(0.75rem,1.5vw,1.5rem)]">
                                        <div className="flex justify-between items-end border-b border-white/10 pb-[clamp(0.5rem,1vw,1rem)]">
                                            <div>
                                                <p className="text-[clamp(0.75rem,0.9vw,1rem)] font-semibold text-white">TEC</p>
                                                <p className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-400">Total Electronic Content</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[clamp(1.5rem,3vw,2.25rem)] font-light text-[#007FFF]">{loadingSpace ? "--" : "45.2"}</span>
                                                <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-500 ml-1">TECU</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-white/10 pb-[clamp(0.5rem,1vw,1rem)]">
                                            <div>
                                                <p className="text-[clamp(0.75rem,0.9vw,1rem)] font-semibold text-white">GIC</p>
                                                <p className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-400">Ground Induced Currents</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[clamp(1.5rem,3vw,2.25rem)] font-light text-[#39FF14]">{loadingSpace ? "--" : "12.3"}</span>
                                                <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-500 ml-1">A</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-[clamp(0.75rem,0.9vw,1rem)] font-semibold text-white">Radio Blackout</p>
                                                <p className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-400">NOAA R-Scale</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[clamp(1.5rem,3vw,2.25rem)] font-light text-[#FFbf00]">{loadingSpace ? "--" : "R0"}</span>
                                                <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-500 ml-1">None</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </motion.div>
                    )}

                    {/* SOLAR TAB */}
                    {activeTab === 'solar' && (
                        <motion.div
                            key="solar"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="w-full h-full max-w-[1800px] mx-auto flex flex-col lg:flex-row justify-center items-stretch gap-[clamp(1rem,2vw,1.5rem)] overflow-y-auto scrollbar-none pb-4 pt-4 lg:pt-6"
                        >
                            {/* Left Col (Sun Activity) */}
                            <div className="w-full lg:flex-1 flex flex-col gap-[clamp(1rem,2vw,1.5rem)] pointer-events-auto shrink-0 min-w-0">
                                <SolarWindWidget data={spaceData} loading={loadingSpace} />
                                <XRayFlareWidget data={spaceData} loading={loadingSpace} />
                            </div>

                            {/* Right Col (Imagery / SSN) */}
                            <div className="w-full lg:flex-1 flex flex-col gap-[clamp(1rem,2vw,1.5rem)] pointer-events-auto shrink-0 min-w-0 h-full">

                                <Card className="p-[clamp(0.25rem,0.5vw,0.375rem)] bg-[#001F3F]/40 backdrop-blur-[40px] border border-[#FFbf00]/30 rounded-[clamp(1.25rem,3vw,2rem)] shadow-[0_8px_32px_rgba(255,191,0,0.15)] overflow-hidden">
                                    <div className="relative w-full aspect-square rounded-[clamp(1rem,2.5vw,1.75rem)] overflow-hidden bg-black/50">
                                        <img
                                            src={solarMock?.coronal_imagery || "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg"}
                                            alt="Coronal Imagery AIA 171"
                                            className="w-full h-full object-cover opacity-80 mix-blend-screen"
                                        />
                                        <div className="absolute top-[clamp(0.5rem,1vw,1rem)] left-[clamp(0.5rem,1vw,1rem)] bg-black/60 backdrop-blur-md px-[clamp(0.5rem,0.8vw,0.75rem)] py-1 rounded-full border border-white/10">
                                            <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-[#FFbf00] font-bold tracking-widest uppercase">AIA 171 Å</span>
                                        </div>
                                    </div>
                                </Card>

                                <Card className="p-[clamp(1rem,2.5vw,1.75rem)] bg-[#001F3F]/40 backdrop-blur-[40px] border border-white/10 rounded-[clamp(1.25rem,3vw,2rem)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                                    <div className="grid grid-cols-2 gap-[clamp(0.75rem,1.5vw,1.25rem)]">
                                        <div className="flex flex-col border-r border-white/10 pr-[clamp(0.5rem,1vw,1rem)]">
                                            <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-400 uppercase tracking-widest font-bold mb-1">Sunspot # (SSN)</span>
                                            <span className="text-[clamp(1.5rem,3vw,2.25rem)] font-light text-white">{solarMock?.sunspot_number || "--"}</span>
                                        </div>
                                        <div className="flex flex-col pl-[clamp(0.25rem,0.5vw,0.5rem)]">
                                            <span className="text-[clamp(0.5rem,0.65vw,0.7rem)] text-slate-400 uppercase tracking-widest font-bold mb-1">Solar Flux (F10.7)</span>
                                            <span className="text-[clamp(1.5rem,3vw,2.25rem)] font-light text-white">{solarMock?.solar_flux_index || "--"}</span>
                                        </div>
                                    </div>
                                </Card>

                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div >

            {/* Bottom Controls HUD */}
            < div className="absolute bottom-[clamp(0.75rem,2vw,1.5rem)] left-1/2 -translate-x-1/2 z-20 pointer-events-auto" >
                <div className="bg-[#001F3F]/60 backdrop-blur-[40px] border border-white/10 rounded-full p-[clamp(0.25rem,0.5vw,0.5rem)] flex gap-[clamp(0.25rem,0.5vw,0.5rem)] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                    <button
                        onClick={() => setActiveMapOverlay(prev => prev === 'temperature' ? undefined : 'temperature')}
                        className={`p-[clamp(0.5rem,0.8vw,0.75rem)] rounded-full transition-colors ${activeMapOverlay === 'temperature' ? 'bg-[#FFbf00]/20 text-[#FFbf00] border border-[#FFbf00]/50 shadow-[0_0_15px_rgba(255,191,0,0.3)]' : 'hover:bg-white/10 text-slate-300 hover:text-white border border-transparent'}`} title="Temperature Layer">
                        <ThermometerIcon className="w-[clamp(1rem,1.3vw,1.5rem)] h-[clamp(1rem,1.3vw,1.5rem)]" />
                    </button>
                    <button
                        onClick={() => setActiveMapOverlay(prev => prev === 'precipitation' ? undefined : 'precipitation')}
                        className={`p-[clamp(0.5rem,0.8vw,0.75rem)] rounded-full transition-colors ${activeMapOverlay === 'precipitation' ? 'bg-[#007FFF]/20 text-[#007FFF] border border-[#007FFF]/50 shadow-[0_0_15px_rgba(0,127,255,0.3)]' : 'hover:bg-white/10 text-slate-300 hover:text-white border border-transparent'}`} title="Precipitation Layer">
                        <Droplets className="w-[clamp(1rem,1.3vw,1.5rem)] h-[clamp(1rem,1.3vw,1.5rem)]" />
                    </button>
                    <button
                        onClick={() => setActiveMapOverlay(prev => prev === 'wind' ? undefined : 'wind')}
                        className={`p-[clamp(0.5rem,0.8vw,0.75rem)] rounded-full transition-colors ${activeMapOverlay === 'wind' ? 'bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'hover:bg-white/10 text-slate-300 hover:text-white border border-transparent'}`} title="Wind Layer">
                        <Wind className="w-[clamp(1rem,1.3vw,1.5rem)] h-[clamp(1rem,1.3vw,1.5rem)]" />
                    </button>
                </div>
            </div >
        </>
    );
}

// Simple fallback icon since Thermometer isn't in lucide-react standard set without checking version
function ThermometerIcon(props: any) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
    )
}

export default function AtmospherePage() {
    return (
        <WeatherLocationProvider>
            <div className="fixed inset-0 w-full h-full bg-[#000510] overflow-hidden flex flex-col font-inter">
                <AtmosphereDashboard />
            </div>
        </WeatherLocationProvider>
    );
}
