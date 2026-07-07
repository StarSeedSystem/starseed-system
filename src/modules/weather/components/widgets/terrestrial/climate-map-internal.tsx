'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import L from 'leaflet';
import { Map as MapIcon, Crosshair, Target, Zap, Waves, Thermometer, Wind } from 'lucide-react';
import { motion } from 'framer-motion';
import { WeatherFxOverlay } from './weather-fx-overlay';

// Fix basic leaflet icons in Next.js
if (typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
}

// Custom stylized icon for the target - Ultra High Spec
const createTargetIcon = () => {
    return L.divIcon({
        className: 'custom-target-icon',
        html: `
            <div class="relative flex items-center justify-center w-12 h-12">
                <div class="absolute inset-0 rounded-full border-2 border-[#06f9c8] animate-[ping_2s_infinite] opacity-40"></div>
                <div class="absolute inset-2 rounded-full border border-[#06f9c8]/60 animate-[spin_4s_linear_infinite]"></div>
                <div class="w-4 h-4 rounded-full bg-[#06f9c8] shadow-[0_0_15px_#06f9c8]"></div>
                <div class="absolute -bottom-6 whitespace-nowrap bg-black/80 backdrop-blur-md px-2 py-0.5 rounded border border-[#06f9c8]/30 text-[8px] font-black uppercase tracking-widest text-[#06f9c8]">
                    LOC_LOCKED
                </div>
            </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
    });
};

// Component to automatically fly to the selected location
function LocationHandler({ location }: { location: { lat: number, lon: number } }) {
    const map = useMap();

    useEffect(() => {
        map.flyTo([location.lat, location.lon], 7, {
            animate: true,
            duration: 2,
            easeLinearity: 0.25
        });
    }, [location.lat, location.lon, map]);

    return null;
}

export default function ClimateMapInternal({ activeOverlay = 'precipitation' }: { activeOverlay?: string }) {
    const { location } = useWeatherLocation();
    const [radarTime, setRadarTime] = useState<number | null>(null);

    useEffect(() => {
        if (activeOverlay === 'precipitation') {
            fetch('https://api.rainviewer.com/public/weather-maps.json')
                .then(res => res.json())
                .then(data => {
                    if (data?.radar?.past?.length > 0) {
                        setRadarTime(data.radar.past[data.radar.past.length - 1].time);
                    }
                })
                .catch(err => console.error("Error fetching RainViewer data:", err));
        }
    }, [activeOverlay]);

    const targetIcon = useMemo(() => createTargetIcon(), []);

    return (
        <div className="w-full h-full relative overflow-hidden bg-[#020804]">
            {/* Holographic Scanning Grid Overlay */}
            <div className="absolute inset-0 z-[400] pointer-events-none opacity-20 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#06f9c8_1px,transparent_1px),linear-gradient(to_bottom,#06f9c8_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#06f9c8_1px,transparent_1px),linear-gradient(to_bottom,#06f9c8_1px,transparent_1px)] bg-[size:8px_8px] opacity-20"></div>

                {/* Scanning Line */}
                <motion.div
                    animate={{ top: ['0%', '100%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#06f9c8] to-transparent shadow-[0_0_20px_#06f9c8]"
                />
            </div>

            <MapContainer
                center={[location.lat, location.lon]}
                zoom={6}
                style={{ height: "100%", width: "100%", background: "transparent" }}
                zoomControl={false}
                attributionControl={false}
                className="base-map-container"
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                    opacity={0.8}
                />

                <LocationHandler location={location} />

                {/* Overlay atmosférico sutil (CSS puro, sin coste de red): refuerza
                    la sensación de la capa activa sobre el mapa real. Niebla ligera
                    en precipitación (humedad ambiente), god-rays suaves en temperatura
                    (lectura térmica/solar). z-index bajo: bajo el HUD, sobre los tiles. */}
                <WeatherFxOverlay
                    className="z-[5] motion-reduce:[&_*]:!animate-none"
                    kind={activeOverlay === 'precipitation' ? 'fog' : activeOverlay === 'temperature' ? 'sun-rays' : 'none'}
                />

                {/* Dynamic Weather Overlays */}
                {activeOverlay === 'precipitation' && radarTime && (
                    <TileLayer
                        url={`https://tilecache.rainviewer.com/v2/radar/${radarTime}/256/{z}/{x}/{y}/4/1_1.png`}
                        opacity={0.7}
                        zIndex={10}
                    />
                )}
                {activeOverlay === 'temperature' && (
                    <TileLayer
                        url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=b1b15e88fa797225412429c1c50c122a1`}
                        opacity={0.6}
                        zIndex={10}
                    />
                )}
                {activeOverlay === 'wind' && (
                    <TileLayer
                        url={`https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=b1b15e88fa797225412429c1c50c122a1`}
                        opacity={0.6}
                        zIndex={10}
                    />
                )}

                <Marker position={[location.lat, location.lon]} icon={targetIcon}>
                    <Popup className="custom-popup" closeButton={false}>
                        <div className="flex flex-col gap-1 py-1">
                            <div className="text-[#06f9c8] font-black text-[10px] tracking-widest uppercase">Target Locked</div>
                            <div className="text-white font-mono text-[9px] opacity-60">
                                {location.lat.toFixed(4)}N / {location.lon.toFixed(4)}E
                            </div>
                        </div>
                    </Popup>
                </Marker>

                {/* Corner Data Readouts (Static Visuals) */}
                <div className="absolute bottom-6 left-6 z-[500] flex flex-col gap-3 pointer-events-none">
                    <div className="flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl">
                        <Waves className="w-4 h-4 text-[#06f9c8] animate-pulse" />
                        <div className="flex flex-col">
                            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Active Layer</span>
                            <span className="text-[10px] font-black text-[#06f9c8] uppercase">{activeOverlay}</span>
                        </div>
                    </div>
                </div>

                {/* Control Hub Overlay */}
                <div className="absolute top-6 right-6 z-[500] flex flex-col gap-2 pointer-events-auto">
                    {[
                        { id: 'precipitation', icon: Waves, label: 'Precip' },
                        { id: 'temperature', icon: Thermometer, label: 'Temp' },
                        { id: 'wind', icon: Wind, label: 'Wind' }
                    ].map((btn) => (
                        <button
                            key={btn.id}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all backdrop-blur-3xl border shadow-xl ${activeOverlay === btn.id
                                ? 'bg-[#06f9c8]/20 border-[#06f9c8] text-[#06f9c8] shadow-[0_0_15px_rgba(6,249,200,0.3)]'
                                : 'bg-black/40 border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                }`}
                            title={btn.label}
                        >
                            <btn.icon className="w-5 h-5" />
                        </button>
                    ))}
                </div>
            </MapContainer>

            {/* Global Theme Overrides for Leaflet */}
            <style dangerouslySetInnerHTML={{
                __html: `
                    .leaflet-container {
                        background: #020804 !important;
                    }
                    .leaflet-layer {
                        filter: hue-rotate(150deg) brightness(0.8) contrast(1.2) saturate(1.4);
                    }
                    .leaflet-popup-content-wrapper {
                        background: rgba(0,0,0,0.85) !important;
                        backdrop-filter: blur(20px) !important;
                        border: 1px solid rgba(6, 249, 200, 0.4) !important;
                        border-radius: 12px !important;
                        box-shadow: 0 0 20px rgba(0,0,0,0.5) !important;
                    }
                    .leaflet-popup-tip {
                        background: rgba(0,0,0,0.85) !important;
                        border: 1px solid rgba(6, 249, 200, 0.4) !important;
                    }
                    .base-map-container .leaflet-tile-pane {
                        mix-blend-mode: screen;
                        opacity: 0.9;
                    }
                `
            }} />
        </div>
    );
}
