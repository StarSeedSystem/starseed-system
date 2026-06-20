'use client';

// ════════════════════════════════════════════════════════════════
// useDataSource — hook de orquestación de una Fuente de Datos Oficial
// ----------------------------------------------------------------
// El usuario elige la fuente (`sourceId`) y activa/desactiva el
// auto-refresco (`auto`). Cuando `auto` está activo, refresca según
// `source.refreshMs`. Maneja loading/error con elegancia y limpia los
// intervalos al desmontar o al cambiar de fuente.
//
// SSR-SAFE: el primer fetch y los intervalos se montan en efectos
// (solo en cliente); nunca se toca window/fetch durante el render.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { DATA_SOURCES, getDataSource, type DataPoint, type DataSource } from "./data-source-registry";

export interface UseDataSource {
    sources: DataSource[];
    sourceId: string;
    setSourceId: (id: string) => void;
    data: DataPoint[];
    loading: boolean;
    error: string | null;
    lastUpdated: number | null;
    refresh: () => void;
    auto: boolean;
    setAuto: (on: boolean) => void;
}

const FALLBACK_ID = DATA_SOURCES[0]?.id ?? "";

export function useDataSource(defaultId?: string): UseDataSource {
    const initialId =
        defaultId && getDataSource(defaultId) ? defaultId : FALLBACK_ID;

    const [sourceId, setSourceId] = useState<string>(initialId);
    const [data, setData] = useState<DataPoint[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [auto, setAuto] = useState<boolean>(true);

    // Guardamos la fuente activa para que la petición sepa si sigue vigente
    // (evita "race conditions" si el usuario cambia de fuente a media carga).
    const activeIdRef = useRef<string>(initialId);
    activeIdRef.current = sourceId;

    const load = useCallback(async (id: string) => {
        const source = getDataSource(id);
        if (!source) {
            setError("Fuente desconocida");
            setData([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const points = await source.fetcher();
            // Si el usuario cambió de fuente mientras cargábamos, descarta.
            if (activeIdRef.current !== id) return;
            setData(points);
            setLastUpdated(Date.now());
        } catch {
            if (activeIdRef.current !== id) return;
            setData([]);
            setError("Fuente no disponible");
        } finally {
            if (activeIdRef.current === id) setLoading(false);
        }
    }, []);

    // Carga inicial + recarga cuando cambia la fuente (solo cliente).
    useEffect(() => {
        void load(sourceId);
    }, [sourceId, load]);

    // Auto-refresco según el periodo de la fuente.
    useEffect(() => {
        if (!auto) return;
        const source = getDataSource(sourceId);
        if (!source) return;
        const period = Math.max(15_000, source.refreshMs);
        const handle = setInterval(() => {
            void load(sourceId);
        }, period);
        return () => clearInterval(handle);
    }, [auto, sourceId, load]);

    const refresh = useCallback(() => {
        void load(activeIdRef.current);
    }, [load]);

    return {
        sources: DATA_SOURCES,
        sourceId,
        setSourceId,
        data,
        loading,
        error,
        lastUpdated,
        refresh,
        auto,
        setAuto,
    };
}
