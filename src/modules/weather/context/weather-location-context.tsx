import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface LocationData {
    lat: number;
    lon: number;
    name: string;
}

interface WeatherLocationContextType {
    location: LocationData;
    setLocation: (loc: LocationData) => void;
    requestGeolocation: () => Promise<void>;
    searchLocation: (query: string) => Promise<LocationData[]>;
    isSearching: boolean;
}

const DEFAULT_LOCATION: LocationData = {
    lat: 18.9226,
    lon: -99.2347,
    name: 'Cuernavaca, Morelos', // Default 
};

const WeatherLocationContext = createContext<WeatherLocationContextType | undefined>(undefined);

export function WeatherLocationProvider({ children }: { children: ReactNode }) {
    const [location, setLocationState] = useState<LocationData>(DEFAULT_LOCATION);
    const [isSearching, setIsSearching] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('starseed_weather_location');
        if (saved) {
            try {
                setLocationState(JSON.parse(saved));
            } catch (e) {
                console.error("Error parsing saved location", e);
            }
        }
    }, []);

    const setLocation = (loc: LocationData) => {
        setLocationState(loc);
        localStorage.setItem('starseed_weather_location', JSON.stringify(loc));
    };

    const requestGeolocation = async () => {
        return new Promise<void>((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("La geolocalización no es compatible con tu navegador"));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        // Reverse geocoding to get name
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                        const data = await res.json();
                        const name = data.address?.city || data.address?.town || data.address?.village || data.address?.state || "Tu ubicación";
                        setLocation({ lat: latitude, lon: longitude, name });
                        resolve();
                    } catch (e) {
                        setLocation({ lat: latitude, lon: longitude, name: "Ubicación actual" });
                        resolve();
                    }
                },
                (error) => {
                    console.error("Geolocation error:", error);
                    reject(error);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
    };

    const searchLocation = async (query: string) => {
        setIsSearching(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
            const data = await res.json();
            const results = data.map((item: any) => ({
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                name: item.display_name.split(',').slice(0, 2).join(','), // Simple display name
            }));
            return results;
        } catch (e) {
            console.error("Search error:", e);
            return [];
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <WeatherLocationContext.Provider value={{ location, setLocation, requestGeolocation, searchLocation, isSearching }}>
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
