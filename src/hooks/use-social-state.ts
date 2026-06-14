// src/hooks/use-social-state.ts
"use client";

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Estado social persistido en localStorage (seguir páginas, unirse a grupos,
// asistir a eventos). SSR-safe: nada toca window fuera de useEffect/handlers.
// Clave única: 'starseed.social.state.v1'.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "starseed.social.state.v1";

export type SocialAction = "follow" | "join" | "request" | "attend" | "interested";

interface SocialState {
    follow: Record<string, boolean>;
    join: Record<string, boolean>;
    request: Record<string, boolean>;
    attend: Record<string, boolean>;
    interested: Record<string, boolean>;
}

const EMPTY: SocialState = {
    follow: {},
    join: {},
    request: {},
    attend: {},
    interested: {},
};

function readState(): SocialState {
    if (typeof window === "undefined") return EMPTY;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw);
        return { ...EMPTY, ...parsed };
    } catch {
        return EMPTY;
    }
}

function writeState(state: SocialState) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        // Notifica a otras instancias del hook en la misma pestaña.
        window.dispatchEvent(new CustomEvent("starseed:social-state"));
    } catch {
        /* almacenamiento no disponible: degradamos a estado en memoria */
    }
}

/**
 * Devuelve si una entidad está activa para una acción dada, y un toggle que
 * persiste el cambio. `key` debe ser único por entidad (ej. el id de la página).
 */
export function useSocialState(action: SocialAction, key: string) {
    const [active, setActive] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const sync = () => {
            const state = readState();
            setActive(Boolean(state[action]?.[key]));
            setReady(true);
        };
        sync();
        window.addEventListener("starseed:social-state", sync);
        window.addEventListener("storage", sync);
        return () => {
            window.removeEventListener("starseed:social-state", sync);
            window.removeEventListener("storage", sync);
        };
    }, [action, key]);

    const toggle = useCallback(() => {
        const state = readState();
        const next = !state[action]?.[key];
        const updated: SocialState = {
            ...state,
            [action]: { ...state[action], [key]: next },
        };
        writeState(updated);
        setActive(next);
        return next;
    }, [action, key]);

    const set = useCallback(
        (value: boolean) => {
            const state = readState();
            const updated: SocialState = {
                ...state,
                [action]: { ...state[action], [key]: value },
            };
            writeState(updated);
            setActive(value);
        },
        [action, key],
    );

    return { active, toggle, set, ready };
}

/** Cuenta cuántas entidades están activas para una acción (para badges/contadores). */
export function countActive(action: SocialAction): number {
    const state = readState();
    return Object.values(state[action] || {}).filter(Boolean).length;
}
