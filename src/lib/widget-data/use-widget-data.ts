'use client';

// ════════════════════════════════════════════════════════════════
// useWidgetData — live, source-agnostic data hook for widgets
// ----------------------------------------------------------------
// Widgets call useWidgetData("oikos.flow") and receive { data, loading,
// error, refresh }. By default it seeds synchronously from the mock
// adapter (so first paint has content, no layout shift) and then
// re-polls on an interval so values "breathe" in real time. When a
// real adapter is registered (registerAdapter), the same hook
// transparently serves live data.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetDataKey, WidgetDataMap } from "./types";
import { fetchWidgetData, fetchWidgetDataSync } from "./adapters";

export interface UseWidgetDataOptions {
    /** Poll interval in ms. 0 disables polling. Default 4000. */
    refreshMs?: number;
    /** Params forwarded to the adapter (filters, ids, ranges...). */
    params?: Record<string, unknown>;
    /** Pause polling (e.g. widget off-screen / edit mode). */
    paused?: boolean;
}

export interface WidgetDataState<K extends WidgetDataKey> {
    data: WidgetDataMap[K] | null;
    loading: boolean;
    error: Error | null;
    refresh: () => void;
}

export function useWidgetData<K extends WidgetDataKey>(
    key: K,
    options: UseWidgetDataOptions = {}
): WidgetDataState<K> {
    const { refreshMs = 4000, params, paused = false } = options;

    // seed synchronously when possible (mock adapters) for instant paint
    const [data, setData] = useState<WidgetDataMap[K] | null>(() =>
        fetchWidgetDataSync(key, params)
    );
    const [loading, setLoading] = useState<boolean>(data === null);
    const [error, setError] = useState<Error | null>(null);

    const paramsKey = JSON.stringify(params ?? {});
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const next = await fetchWidgetData(key, params);
            if (mounted.current) {
                setData(next);
                setError(null);
                setLoading(false);
            }
        } catch (e) {
            if (mounted.current) {
                setError(e instanceof Error ? e : new Error(String(e)));
                setLoading(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, paramsKey]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    useEffect(() => {
        if (paused || refreshMs <= 0) return;
        const id = setInterval(load, refreshMs);
        return () => clearInterval(id);
    }, [load, refreshMs, paused]);

    return { data, loading, error, refresh: load };
}
