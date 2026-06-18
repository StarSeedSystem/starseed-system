'use client';

import React, { useState, useEffect } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Crosshair, Loader2, Navigation } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function LocationSelector() {
    const { location, setLocation, requestGeolocation, searchLocation, isSearching } = useWeatherLocation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);

    // Listen for external trigger from sidebar MapPin button
    useEffect(() => {
        const handler = () => setOpen(true);
        window.addEventListener('starseed:open-location', handler);
        return () => window.removeEventListener('starseed:open-location', handler);
    }, []);

    const handleSearch = async () => {
        if (!query.trim()) return;
        const res = await searchLocation(query);
        setResults(res);
    };

    const handleGeo = async () => {
        setGeoLoading(true);
        try {
            await requestGeolocation();
            setOpen(false);
        } catch (e) {
            console.error(e);
        } finally {
            setGeoLoading(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className="gap-2 bg-black/30 backdrop-blur-md border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-150 cursor-pointer text-white/80 hover:text-white rounded-xl"
                >
                    <MapPin className="w-3.5 h-3.5 text-[#13b6ec] shrink-0" />
                    <span className="truncate max-w-[150px] text-xs">{location.name}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-80 p-0 overflow-hidden bg-black/85 backdrop-blur-2xl border-white/10 shadow-2xl rounded-2xl"
                align="end"
            >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                    <Navigation className="w-3.5 h-3.5 text-[#13b6ec] shrink-0" />
                    <span className="text-xs font-semibold text-white/80">Cambiar ubicación</span>
                </div>

                <div className="flex flex-col gap-3 p-4">
                    {/* Buscador */}
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Buscar ciudad…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 text-xs rounded-xl h-8 focus-visible:ring-[#13b6ec]/40 focus-visible:border-[#13b6ec]/60 transition-colors"
                        />
                        <Button
                            size="icon"
                            variant="secondary"
                            onClick={handleSearch}
                            disabled={isSearching}
                            className="shrink-0 h-8 w-8 rounded-xl bg-white/10 hover:bg-white/20 border-white/10 cursor-pointer transition-colors"
                            aria-label="Buscar"
                        >
                            {isSearching
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white/60" />
                                : <Search className="w-3.5 h-3.5 text-white/60" />
                            }
                        </Button>
                    </div>

                    {/* Geolocalización */}
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#13b6ec]/10 px-3 py-2 text-xs font-medium text-[#13b6ec] hover:bg-[#13b6ec]/20 hover:border-[#13b6ec]/30 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={handleGeo}
                        disabled={geoLoading}
                    >
                        {geoLoading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Crosshair className="w-3.5 h-3.5" />
                        }
                        Usar mi ubicación actual
                    </button>

                    {/* Resultados */}
                    {results.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/35 uppercase tracking-wider mb-1 px-1">
                                Resultados
                            </span>
                            {results.map((r, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white transition-all duration-150"
                                    onClick={() => {
                                        setLocation(r);
                                        setOpen(false);
                                        setResults([]);
                                        setQuery('');
                                    }}
                                >
                                    <MapPin className="w-3 h-3 shrink-0 text-[#13b6ec]/60" />
                                    <span className="truncate">{r.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer — ubicación actual */}
                <div className="flex items-center gap-1.5 border-t border-white/8 bg-white/3 px-4 py-2">
                    <span className="text-[10px] text-white/30">Ubicación actual:</span>
                    <span className="truncate text-[10px] font-medium text-[#13b6ec]/80">{location.name}</span>
                </div>
            </PopoverContent>
        </Popover>
    );
}
