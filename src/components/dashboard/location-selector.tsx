'use client';

import React, { useState } from 'react';
import { useWeatherLocation } from '@/modules/weather/context/weather-location-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Search, Crosshair, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function LocationSelector() {
    const { location, setLocation, requestGeolocation, searchLocation, isSearching } = useWeatherLocation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);

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
                <Button variant="outline" className="gap-2 bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/10 transition-colors">
                    <MapPin className="w-4 h-4 text-[#13b6ec]" />
                    <span className="truncate max-w-[150px]">{location.name}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 bg-background/95 backdrop-blur-xl border-white/10 shadow-2xl" align="end">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Buscar ciudad..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="bg-black/20 border-white/10"
                        />
                        <Button size="icon" variant="secondary" onClick={handleSearch} disabled={isSearching}>
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 text-primary"
                        onClick={handleGeo}
                        disabled={geoLoading}
                    >
                        {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                        Usar mi ubicación actual
                    </Button>

                    {results.length > 0 && (
                        <div className="flex flex-col gap-1 mt-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Resultados</span>
                            {results.map((r, i) => (
                                <Button
                                    key={i}
                                    variant="ghost"
                                    className="w-full justify-start font-normal text-left h-auto py-2"
                                    onClick={() => {
                                        setLocation(r);
                                        setOpen(false);
                                        setResults([]);
                                        setQuery('');
                                    }}
                                >
                                    <MapPin className="w-3 h-3 mr-2 opacity-50 flex-shrink-0" />
                                    <span className="truncate">{r.name}</span>
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
