"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Canal de estado compartido de un servidor de apps
 * ---------------------------------------------------------------------------
 * `useServerChannel(serverId)` da a cualquier app/juego/entorno instalado un
 * ESTADO COMPARTIDO en tiempo real entre todos los miembros del servidor, sin
 * que la app tenga que montar su propia infraestructura:
 *
 *   · PERSISTENCIA — `entity_state` (contrato en src/lib/sync/entity-state.ts)
 *     con `owner_kind='other'`, `owner_id='srv:<serverId>'`, `key='state'`.
 *     RLS: política `es_srv_member` (miembros del servidor pueden leer/escribir).
 *     Esto asegura que quien se une TARDE ve el último estado (LWW por rev).
 *
 *   · BAJA LATENCIA — canal broadcast de Supabase `srv:<serverId>`: cuando un
 *     miembro cambia el estado, además de persistirlo emite un evento broadcast
 *     para que los demás lo apliquen AL INSTANTE sin esperar el roundtrip de
 *     postgres_changes. `entity_state` sigue siendo la fuente de verdad
 *     (persistida); el broadcast es solo una notificación rápida "algo cambió,
 *     re-lee" con el propio payload adjunto como atajo.
 *
 * EJEMPLO DE USO (contador colaborativo mínimo, la misma demo que monta la UI
 * del panel del servidor en /servidores-apps):
 *
 *   const { state, setState, connected } = useServerChannel<{ count: number }>(
 *     serverId,
 *     { count: 0 },
 *   );
 *   <button onClick={() => setState({ count: (state?.count ?? 0) + 1 })}>
 *     {state?.count ?? 0}
 *   </button>
 *
 * Cualquier app/juego puede usar el mismo hook con su propia forma de estado
 * (notas colaborativas, posición de piezas, marcador de una partida…). Es
 * genérico a propósito: el "contrato" es sólo `owner_id='srv:<id>'`.
 *
 * Defensivo y SSR-safe: sin sesión/servidor/red, `state` queda en el valor
 * inicial y `connected=false`, pero la app sigue funcionando localmente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getEntityState, setEntityState, subscribeEntityState, type EntityRef } from "@/lib/sync/entity-state";

const STATE_KEY = "state";

/** Ref de entidad "otro" para un servidor concreto (owner_id='srv:<id>'). */
export function serverEntityRef(serverId: string): EntityRef {
    return { kind: "other", id: `srv:${serverId}` };
}

export interface UseServerChannelResult<T> {
    /** Estado compartido actual (o el valor inicial si aún no cargó / no hay servidor). */
    state: T;
    /** Escribe un nuevo estado: lo persiste en entity_state y lo emite por broadcast. */
    setState: (next: T) => Promise<void>;
    /** Aplica una función de actualización sobre el estado actual (patrón setState funcional). */
    updateState: (updater: (prev: T) => T) => Promise<void>;
    /** true una vez se completó la carga inicial desde entity_state. */
    loaded: boolean;
    /** true si el canal broadcast quedó SUBSCRIBED (baja latencia activa). */
    connected: boolean;
}

/**
 * Hook de estado compartido en tiempo real para un servidor de apps. Ver
 * cabecera del módulo para el contrato completo y un ejemplo de uso.
 */
export function useServerChannel<T = Record<string, unknown>>(
    serverId: string | null | undefined,
    initial: T,
): UseServerChannelResult<T> {
    const [state, setStateRaw] = useState<T>(initial);
    const [loaded, setLoaded] = useState(false);
    const [connected, setConnected] = useState(false);
    const stateRef = useRef(state);
    stateRef.current = state;
    const initialRef = useRef(initial);
    initialRef.current = initial;

    const ref = serverId ? serverEntityRef(serverId) : null;

    // Carga inicial desde entity_state (persistido) + suscripción a cambios remotos.
    useEffect(() => {
        let alive = true;
        setLoaded(false);
        if (!ref) {
            setStateRaw(initialRef.current);
            setLoaded(true);
            return;
        }
        (async () => {
            const row = await getEntityState<T>(ref, STATE_KEY);
            if (!alive) return;
            setStateRaw(row?.value ?? initialRef.current);
            setLoaded(true);
        })();

        const unsub = subscribeEntityState<T>(ref, STATE_KEY, (change) => {
            if (!alive || change.self) return;
            setStateRaw(change.value);
        });

        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId]);

    // Canal broadcast de baja latencia `srv:<id>` (además de entity_state).
    useEffect(() => {
        if (!serverId || typeof window === "undefined") {
            setConnected(false);
            return;
        }
        let removed = false;
        let supabase: ReturnType<typeof createClient> | null = null;
        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

        try {
            supabase = createClient();
            channel = supabase.channel(`srv:${serverId}`, { config: { broadcast: { self: false } } });
            channel.on("broadcast", { event: "state" }, (msg: { payload?: { value?: T } }) => {
                if (removed) return;
                const value = msg?.payload?.value;
                if (value !== undefined) setStateRaw(value);
            });
            channel.subscribe((status: string) => {
                if (removed) return;
                setConnected(status === "SUBSCRIBED");
            });
        } catch {
            setConnected(false);
        }

        return () => {
            removed = true;
            try {
                if (supabase && channel) supabase.removeChannel(channel);
            } catch {
                /* limpieza best-effort */
            }
        };
    }, [serverId]);

    const setState = useCallback(
        async (next: T) => {
            setStateRaw(next);
            if (!ref || !serverId) return;
            try {
                await setEntityState<T>(ref, STATE_KEY, next);
            } catch {
                /* entity-state ya es defensivo; degradamos en silencio */
            }
            try {
                const supabase = createClient();
                const channel = supabase.channel(`srv:${serverId}`, { config: { broadcast: { self: false } } });
                await channel.subscribe();
                await channel.send({ type: "broadcast", event: "state", payload: { value: next } });
                supabase.removeChannel(channel);
            } catch {
                /* el broadcast es solo un atajo de latencia; entity_state ya persistió */
            }
        },
        [ref, serverId],
    );

    const updateState = useCallback(
        async (updater: (prev: T) => T) => {
            const next = updater(stateRef.current);
            await setState(next);
        },
        [setState],
    );

    return { state, setState, updateState, loaded, connected };
}
