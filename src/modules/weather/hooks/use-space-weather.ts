'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Hook de CLIMA ESPACIAL en vivo (NOAA SWPC)
// ----------------------------------------------------------------
// Envuelve `fetchSpaceWeather()` (fetchers reales de NOAA SWPC) en un
// hook de cliente con estados de carga / error / refresco. SSR-safe:
// la primera petición se dispara en un efecto (solo navegador) y se
// auto-refresca cada `refreshMs` (por defecto 60 s). Nunca inventa
// datos: si la fuente falla, expone `error` para que la UI muestre
// "fuente no disponible" + reintento, manteniendo la atribución NOAA.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchSpaceWeather,
    type SpaceWeatherSnapshot,
} from '@/components/dashboard/apps/data-sources/space-weather-sources';

export interface UseSpaceWeatherResult {
    /** Último snapshot real de NOAA, o `null` mientras no haya datos válidos. */
    data: SpaceWeatherSnapshot | null;
    /** `true` durante la primera carga (sin datos previos). */
    loading: boolean;
    /** `true` durante un refresco con datos ya presentes (no bloquea la UI). */
    refreshing: boolean;
    /** Mensaje de error de la última petición fallida, o `null`. */
    error: string | null;
    /** Fuerza un refetch inmediato. */
    refresh: () => void;
    /** Timestamp (ms) del último snapshot correcto. */
    lastUpdated: number | null;
}

const DEFAULT_REFRESH_MS = 60_000;

/**
 * Carga el clima espacial real de NOAA SWPC con auto-refresco.
 * @param refreshMs intervalo de refresco en ms (0 = sin auto-refresco).
 */
export function useSpaceWeather(refreshMs: number = DEFAULT_REFRESH_MS): UseSpaceWeatherResult {
    const [data, setData] = useState<SpaceWeatherSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    // Evita setState tras desmontar y permite saltar peticiones solapadas.
    const mountedRef = useRef(true);
    const inFlightRef = useRef(false);
    // Tick manual para forzar refetch desde `refresh()`.
    const [tick, setTick] = useState(0);

    const load = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        // Si ya tenemos datos, es un refresco no bloqueante.
        setRefreshing((prev) => prev || data !== null);
        try {
            const snapshot = await fetchSpaceWeather();
            if (!mountedRef.current) return;
            setData(snapshot);
            setLastUpdated(snapshot.fetchedAt);
            setError(null);
        } catch (err) {
            if (!mountedRef.current) return;
            const message =
                err instanceof Error ? err.message : 'Fuente NOAA SWPC no disponible';
            setError(message);
        } finally {
            if (mountedRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
            inFlightRef.current = false;
        }
        // `data` se lee solo para decidir "refreshing"; no debe re-crear `load`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refresh = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        mountedRef.current = true;
        void load();

        let interval: ReturnType<typeof setInterval> | undefined;
        if (refreshMs > 0) {
            interval = setInterval(() => void load(), refreshMs);
        }

        return () => {
            mountedRef.current = false;
            if (interval) clearInterval(interval);
        };
        // Re-ejecuta al cambiar el intervalo o al pulsar "refresh" (tick).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshMs, tick]);

    return { data, loading, refreshing, error, refresh, lastUpdated };
}
