"use client";

/**
 * Presets de Audiomorphic — SIN NUBE, SIN LOGIN (Adenda 69 · K)
 * ============================================================================
 * En la app original los presets viven en **Firestore** y exigen (a) cuenta y
 * (b) plan de pago (`isLocked ⇒ "Desbloquea el guardado en la nube con Premium"`).
 *
 * En el OS la app va **desbloqueada y sin login**, así que aquí los presets:
 *   · se guardan en `localStorage` (clave `starseed.audiomorphic.presets.v1`),
 *   · son **ilimitados** y no piden nada a nadie,
 *   · se pueden exportar/importar como JSON (igual que en el original).
 *
 * ⚠️ Honestidad: son **por dispositivo**. Para que viajaran con la cuenta habría
 * que meter la clave en `SYNCED_KEYS` (`src/lib/settings-sync.ts`), que está
 * FUERA del encargo de esta adenda. Queda anotado como pendiente.
 */

import { useCallback, useEffect, useState } from "react";
import type { VisualizerParams } from "@/lib/audiomorphic/types";

export const AUDIOMORPHIC_PRESETS_KEY = "starseed.audiomorphic.presets.v1";

export interface Preset {
    id: string;
    name: string;
    /** JSON del parche de parámetros (mismo formato que el original). */
    params: string;
    createdAt: number;
}

function read(): Preset[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(AUDIOMORPHIC_PRESETS_KEY);
        if (!raw) return [];
        const list = JSON.parse(raw) as unknown;
        if (!Array.isArray(list)) return [];
        return list
            .filter((p): p is Preset =>
                !!p && typeof (p as Preset).id === "string" &&
                typeof (p as Preset).name === "string" &&
                typeof (p as Preset).params === "string",
            )
            .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
        return [];
    }
}

function write(list: Preset[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(AUDIOMORPHIC_PRESETS_KEY, JSON.stringify(list));
    } catch {
        /* cuota llena: no rompemos la app por un preset */
    }
}

function uid(): string {
    try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {
        /* noop */
    }
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function useLocalPresets() {
    const [presets, setPresets] = useState<Preset[]>([]);

    useEffect(() => {
        setPresets(read());
    }, []);

    const savePreset = useCallback(async (name: string, params: VisualizerParams) => {
        const preset: Preset = {
            id: uid(),
            name: name.trim() || "Preset",
            params: JSON.stringify(params),
            createdAt: Date.now(),
        };
        setPresets((prev) => {
            const next = [preset, ...prev];
            write(next);
            return next;
        });
        return preset;
    }, []);

    const deletePreset = useCallback(async (id: string) => {
        setPresets((prev) => {
            const next = prev.filter((p) => p.id !== id);
            write(next);
            return next;
        });
    }, []);

    return { cloudPresets: presets, savePreset, deletePreset };
}
