"use client";

// src/hooks/use-eventos-relevo.ts
// -----------------------------------------------------------------------------
// Latido en vivo del Centro de Mando (Ola 232 · C2): eventos del enjambre
// desde la tabla pública `relevo_eventos` de Supabase, con carga inicial,
// suscripción Realtime (INSERT) y un sondeo suave de respaldo para no perder
// nada si la conexión de tiempo real cae.
//
// ⚠️ Cliente: solo trae texto y metadatos públicos (nunca claves ni rutas
// del disco). Los datos salen de `relevo_eventos` (RLS de solo lectura para
// anon/authenticated) y se normalizan con `cargarEventos`.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";

import { cargarEventos } from "@/lib/mando/eventos";
import { onTableChange } from "@/lib/realtime/realtime";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Resultado del hook: lista en vivo + estado de carga + recarga manual. */
export interface UseEventosRelevoResultado {
    eventos: EventoRelevo[];
    cargando: boolean;
    recargar: () => Promise<void>;
}

/** Intervalo de sondeo de respaldo (ms). El comentario de eventos.ts sugiere 30–40 s. */
const SONDEO_MS = 30_000;

/** Número máximo de eventos recientes que conserva el hook en memoria. */
const MAX_EVENTOS = 400;

/** Inserta un evento nuevo al frente de una lista ordenada por id desc, sin duplicar. */
function anteponer(lista: EventoRelevo[], evento: EventoRelevo): EventoRelevo[] {
    if (!evento.id && !evento.texto) return lista;
    const yaExiste = lista.some((e) => e.id === evento.id);
    const base = yaExiste ? lista : [evento, ...lista];
    return base.slice(0, MAX_EVENTOS);
}

/**
 * Latido en vivo de los eventos del enjambre (`relevo_eventos`).
 *
 * - Carga inicial con `cargarEventos(0, límite)`.
 * - Se suscribe a los INSERT de la tabla para añadirlos en vivo.
 * - Un sondeo periódico trae lo que la suscripción pudiera perder.
 */
export function useEventosRelevo(limite = 200): UseEventosRelevoResultado {
    const [eventos, setEventos] = useState<EventoRelevo[]>([]);
    const [cargando, setCargando] = useState(true);
    const limiteRef = useRef(limite);
    limiteRef.current = limite;

    const recargar = useCallback(async () => {
        if (typeof window === "undefined") return;
        const lista = await cargarEventos(0, limiteRef.current);
        setEventos(lista);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let activo = true;

        void (async () => {
            const lista = await cargarEventos(0, limiteRef.current);
            if (activo) {
                setEventos(lista);
                setCargando(false);
            }
        })();

        return () => {
            activo = false;
        };
    }, []);

    // Suscripción Realtime a los INSERT de `relevo_eventos`.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const limpiar = onTableChange<EventoRelevo>(
            "relevo_eventos",
            { event: "INSERT" },
            (payload) => {
                const fila = payload?.new ?? null;
                if (!fila) return;
                setEventos((prev) => anteponer(prev, fila));
            },
        );
        return limpiar;
    }, []);

    // Sondeo de respaldo: recarga la lista cada SONDEO_MS para no perder eventos.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const id = window.setInterval(() => {
            void cargarEventos(0, limiteRef.current).then((lista) => {
                setEventos((prev) => {
                    const conocidos = new Set(prev.map((e) => e.id));
                    const nuevos = lista.filter((e) => !conocidos.has(e.id));
                    if (nuevos.length === 0) return prev;
                    return [...prev, ...nuevos]
                        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
                        .reverse()
                        .slice(0, MAX_EVENTOS);
                });
            });
        }, SONDEO_MS);
        return () => window.clearInterval(id);
    }, []);

    return { eventos, cargando, recargar };
}