"use client";

// src/lib/realtime/realtime.ts
// -----------------------------------------------------------------------------
// Módulo de TIEMPO REAL (Supabase Realtime) para StarSeed OS.
//
// Supabase Realtime está habilitado: la publicación `supabase_realtime` incluye
// posts, astraura_messages, memories, proposals, proposal_votes,
// proposal_notifications, brains, canvases, pages, profiles, group_members,
// page_members, browser_windows, generated_apps, knowledge_*, ability_links,
// senses_settings, y ~31 tablas en total. RLS sigue aplicándose: los clientes
// sólo reciben los cambios que pueden leer.
//
// Este módulo expone tres primitivas:
//   • useRealtime(table, opts, onChange)      — hook React (suscribe/limpia).
//   • useRealtimeRows<T>(table, loader, opts) — hook que carga + aplica cambios.
//   • onTableChange(table, opts, cb)          — suscripción imperativa (no-hook).
//
// TODO es SSR-safe: en el servidor (sin `window`) las suscripciones son no-op.
// Patrón de canal (acordado):
//   const supabase = createClient();
//   const ch = supabase.channel(`rt:${table}:${key}`)
//     .on('postgres_changes', { event:'*', schema:'public', table, filter }, (p) => {...})
//     .subscribe();
//   // limpieza: supabase.removeChannel(ch);
// `filter` es un string PostgREST tipo `chat_id=eq.<id>` o `id=eq.<id>`; se
// omite para escuchar toda la tabla.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// ----------------------------- Tipos ----------------------------------------

export type RealtimeEvent = "*" | "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeOptions {
    /** Filtro PostgREST, p.ej. `id=eq.<id>` o `user_id=eq.<uid>`. Omitir = toda la tabla. */
    filter?: string;
    /** Evento a escuchar. Por defecto `*` (INSERT + UPDATE + DELETE). */
    event?: RealtimeEvent;
}

/** Payload de un cambio realtime (forma laxa: el SDK tipa esto débilmente). */
export interface RealtimePayload<T = any> {
    eventType?: "INSERT" | "UPDATE" | "DELETE";
    schema?: string;
    table?: string;
    new?: T | null;
    old?: Partial<T> | null;
    [key: string]: any;
}

// ----------------------- Suscripción imperativa ------------------------------
//
// `onTableChange` permite que código NO-React (p.ej. la capa de datos de
// post-entity) se suscriba a cambios de una tabla y reciba una función de
// limpieza. SSR-safe: en el servidor devuelve un no-op.

export function onTableChange<T = any>(
    table: string,
    opts: RealtimeOptions,
    cb: (payload: RealtimePayload<T>) => void,
): () => void {
    // SSR / sin tabla: no-op.
    if (typeof window === "undefined" || !table) {
        return () => {};
    }

    let removed = false;
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;

    try {
        supabase = createClient();
        const event = opts?.event ?? "*";
        const filter = opts?.filter;

        // Clave única y estable por canal (tabla + filtro + evento + nonce).
        const nonce = Math.random().toString(36).slice(2, 8);
        const key = `${table}:${filter ?? "all"}:${event}:${nonce}`;

        const changeConfig: {
            event: RealtimeEvent;
            schema: string;
            table: string;
            filter?: string;
        } = { event, schema: "public", table };
        if (filter) changeConfig.filter = filter;

        channel = supabase
            .channel(`rt:${key}`)
            // El tipado del SDK para postgres_changes es laxo; casteamos el cb.
            .on("postgres_changes", changeConfig as any, (payload: any) => {
                if (!removed) cb(payload as RealtimePayload<T>);
            })
            .subscribe();
    } catch {
        // Si algo falla al crear el canal, degradamos a no-op silenciosamente.
        return () => {};
    }

    return () => {
        removed = true;
        try {
            if (supabase && channel) supabase.removeChannel(channel);
        } catch {
            /* limpieza best-effort */
        }
    };
}

// ----------------------------- useRealtime ----------------------------------
//
// Hook React: se suscribe al montar, limpia al desmontar y RE-suscribe cuando
// cambian `table`, `filter` o `event`. El callback se guarda en un ref para no
// re-suscribir en cada render por una nueva identidad de función.

export function useRealtime<T = any>(
    table: string,
    opts: RealtimeOptions,
    onChange: (payload: RealtimePayload<T>) => void,
): void {
    const cbRef = useRef(onChange);
    cbRef.current = onChange;

    const filter = opts?.filter;
    const event = opts?.event ?? "*";

    useEffect(() => {
        if (typeof window === "undefined" || !table) return;

        const unsub = onTableChange<T>(
            table,
            { filter, event },
            (payload) => cbRef.current?.(payload),
        );
        return unsub;
        // Re-suscribir sólo cuando cambian tabla/filtro/evento.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table, filter, event]);
}

// --------------------------- useRealtimeRows --------------------------------
//
// Carga una lista de filas vía `loader()` y, a continuación, aplica EN MEMORIA
// los cambios realtime (INSERT/UPDATE/DELETE) a esa lista, identificando filas
// por `idKey` (por defecto 'id'). Devuelve `{ rows, loading, reload }`.

export interface UseRealtimeRowsOptions {
    /** Filtro PostgREST aplicado a la suscripción realtime. */
    filter?: string;
    /** Clave identificadora de cada fila (por defecto 'id'). */
    idKey?: string;
}

export interface UseRealtimeRowsResult<T> {
    rows: T[];
    loading: boolean;
    reload: () => Promise<void>;
}

export function useRealtimeRows<T = any>(
    table: string,
    loader: () => Promise<T[]>,
    opts?: UseRealtimeRowsOptions,
): UseRealtimeRowsResult<T> {
    const [rows, setRows] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);

    const idKey = opts?.idKey ?? "id";
    const filter = opts?.filter;

    // Guardamos loader/idKey en refs para estabilidad entre renders.
    const loaderRef = useRef(loader);
    loaderRef.current = loader;
    const idKeyRef = useRef(idKey);
    idKeyRef.current = idKey;

    const reload = useCallback(async () => {
        if (typeof window === "undefined") return;
        setLoading(true);
        try {
            const next = await loaderRef.current();
            setRows(Array.isArray(next) ? next : []);
        } catch {
            /* silencioso: conservamos las filas actuales */
        } finally {
            setLoading(false);
        }
    }, []);

    // Carga inicial + recarga cuando cambian tabla/filtro.
    useEffect(() => {
        void reload();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table, filter]);

    // Aplicación en vivo de cambios a la lista en memoria.
    useEffect(() => {
        if (typeof window === "undefined" || !table) return;

        const unsub = onTableChange<T>(table, { filter, event: "*" }, (payload) => {
            const key = idKeyRef.current;
            const type = payload?.eventType;
            const newRow = (payload?.new ?? null) as any;
            const oldRow = (payload?.old ?? null) as any;

            setRows((prev) => {
                const list = Array.isArray(prev) ? prev : [];

                if (type === "INSERT") {
                    if (!newRow) return list;
                    const id = newRow[key];
                    // Evitar duplicados (p.ej. si ya llegó por la carga inicial).
                    if (id != null && list.some((r: any) => r?.[key] === id)) {
                        return list.map((r: any) => (r?.[key] === id ? newRow : r));
                    }
                    return [...list, newRow as T];
                }

                if (type === "UPDATE") {
                    if (!newRow) return list;
                    const id = newRow[key];
                    if (id == null) return list;
                    let found = false;
                    const mapped = list.map((r: any) => {
                        if (r?.[key] === id) {
                            found = true;
                            return newRow;
                        }
                        return r;
                    });
                    // Si no estaba (p.ej. ahora cumple el filtro), lo añadimos.
                    return found ? mapped : [...mapped, newRow as T];
                }

                if (type === "DELETE") {
                    const id = oldRow ? oldRow[key] : undefined;
                    if (id == null) return list;
                    return list.filter((r: any) => r?.[key] !== id);
                }

                return list;
            });
        });

        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table, filter]);

    return { rows, loading, reload };
}
