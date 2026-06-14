'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    searchPlaces,
    reverseGeocode,
    fetchTimezoneAndElevation,
    type GeoResult,
} from '@/lib/geocoding';

export interface LocationData {
    lat: number;
    lon: number;
    name: string;
    /** País (texto), si se conoce. Opcional para no romper consumidores existentes. */
    country?: string;
    /** Huso horario IANA, ej. "America/Mexico_City". Opcional. */
    timezone?: string;
    /** Elevación en metros sobre el nivel del mar. Opcional. */
    elevation?: number;
}

interface WeatherLocationContextType {
    location: LocationData;
    setLocation: (loc: LocationData) => void;
    requestGeolocation: () => Promise<void>;
    searchLocation: (query: string) => Promise<LocationData[]>;
    isSearching: boolean;
}

const STORAGE_KEY = 'starseed_weather_location';

const DEFAULT_LOCATION: LocationData = {
    lat: 18.9226,
    lon: -99.2347,
    name: 'Cuernavaca, Morelos', // Default
    country: 'México',
    timezone: 'America/Mexico_City',
};

const WeatherLocationContext = createContext<WeatherLocationContextType | undefined>(undefined);

/** Convierte un GeoResult del módulo de geocoding al shape de LocationData. */
function toLocationData(r: GeoResult): LocationData {
    const loc: LocationData = { lat: r.lat, lon: r.lon, name: r.name };
    if (r.country) loc.country = r.country;
    if (r.timezone) loc.timezone = r.timezone;
    if (typeof r.elevation === 'number') loc.elevation = r.elevation;
    return loc;
}

export function WeatherLocationProvider({ children }: { children: ReactNode }) {
    const [location, setLocationState] = useState<LocationData>(DEFAULT_LOCATION);
    const [isSearching, setIsSearching] = useState(false);

    // Load from localStorage on mount (SSR-safe: only runs in the browser)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (
                    parsed &&
                    typeof parsed.lat === 'number' &&
                    typeof parsed.lon === 'number' &&
                    typeof parsed.name === 'string'
                ) {
                    setLocationState(parsed as LocationData);
                }
            }
        } catch (e) {
            console.error('Error parsing saved location', e);
        }
    }, []);

    const setLocation = (loc: LocationData) => {
        setLocationState(loc);
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
            } catch (e) {
                console.error('Error saving location', e);
            }
        }
    };

    const requestGeolocation = async () => {
        return new Promise<void>((resolve, reject) => {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                reject(new Error('La geolocalización no es compatible con tu navegador'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        // Reverse geocoding (nombre) + timezone/elevation reales en paralelo.
                        const [reverse, tzElev] = await Promise.all([
                            reverseGeocode(latitude, longitude),
                            fetchTimezoneAndElevation(latitude, longitude),
                        ]);

                        const base: LocationData = reverse
                            ? toLocationData(reverse)
                            : { lat: latitude, lon: longitude, name: 'Ubicación actual' };

                        // Asegura coords exactas del GPS y añade tz/elevación si llegaron.
                        base.lat = latitude;
                        base.lon = longitude;
                        if (tzElev.timezone) base.timezone = tzElev.timezone;
                        if (typeof tzElev.elevation === 'number') base.elevation = tzElev.elevation;

                        setLocation(base);
                        resolve();
                    } catch (e) {
                        console.error('Reverse geocoding error:', e);
                        setLocation({ lat: latitude, lon: longitude, name: 'Ubicación actual' });
                        resolve();
                    }
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    reject(error);
                },
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
        });
    };

    const searchLocation = async (query: string): Promise<LocationData[]> => {
        setIsSearching(true);
        try {
            const results = await searchPlaces(query, 5);
            return results.map(toLocationData);
        } catch (e) {
            console.error('Search error:', e);
            return [];
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <WeatherLocationContext.Provider
            value={{ location, setLocation, requestGeolocation, searchLocation, isSearching }}
        >
            {children}
        </WeatherLocationContext.Provider>
    );
}

export function useWeatherLocation() {
    const context = useContext(WeatherLocationContext);
    if (context === undefined) {
        throw new Error('useWeatherLocation must be used within a WeatherLocationProvider');
    }
    return context;
}
