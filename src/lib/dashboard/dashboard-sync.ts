"use client";

/*
 * dashboard-sync — Sincronización del estado del Dashboard ENTRE DISPOSITIVOS.
 * ------------------------------------------------------------------------------
 * Capa de persistencia ADITIVA sobre Supabase para que los tableros (dashboards),
 * sus widgets y su orden se sincronicen ENTRE DISPOSITIVOS (no solo entre pestañas
 * del mismo navegador) y EN TIEMPO REAL. localStorage SIGUE siendo la caché local
 * y el fallback offline: si no hay sesión / tabla / red, todo degrada en silencio
 * a la lógica local existente de `dashboard-layout.tsx`.
 *
 * DISEÑO — blob de estado completo, write-through + load-with-fallback:
 *  - Guardamos TODO el estado del dashboard (las cargas de localStorage) como UNA
 *    sola fila por usuario en `dashboard_state(owner uuid PK, data jsonb, updated_at)`.
 *  - Al guardar (caller con debounce) → upsert del blob a Supabase (onConflict owner).
 *  - Al montar → si Supabase tiene una fila, hidratamos localStorage + estado desde
 *    ella (así un dispositivo nuevo recibe los tableros del usuario).
 *  - Realtime → ante un cambio remoto, re-hidratamos.
 *
 * Diferencias con `src/lib/dashboards-sync.ts` (NO se toca): aquel es un respaldo
 * "restaurar-si-vacío" en `user_settings.prefs.dashboards`. ESTE es la capa de
 * sincronización viva multi-dispositivo sobre la tabla dedicada `dashboard_state`.
 *
 * Principios (alineados con CLAUDE.md · Identidad Soberana, tolerancia a fallos):
 *  - ADITIVO: nunca quita la ruta de localStorage; Supabase es una capa añadida.
 *  - DEFENSIVO: sin sesión / sin tabla / red caída → no rompe (try/catch, nunca lanza).
 *  - SSR-safe: en el servidor (sin window/localStorage) todo es no-op.
 */

import { createClient } from "@/utils/supabase/client";

// ── Claves de localStorage del dashboard (las MISMAS que dashboard-layout) ──
// Estas cuatro claves contienen la "verdad local" del dashboard del usuario:
//   · starseed_dashboards        → lista de tableros (Dashboard[])
//   · starseed_widgets           → mapa { dashboardId: DashboardWidget[] }
//   · dashboard_order            → orden de los tableros (string[] de ids)
//   · starseed_defaults_version  → generación de defaults ya sembrada (gen11+)
// La disposición de ventanas/pestañas (workspace tree) NO se persiste en
// localStorage (solo se difunde por BroadcastChannel), así que no forma parte
// del blob; si en el futuro se persiste, basta con añadir su clave a LS_KEYS.
const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const LS_ORDER = "dashboard_order";
// Viaja en el MISMO blob que dashboards/widgets: así, cuando un dispositivo
// nuevo hidrata desde remoto, también recibe la versión de defaults ya
// migrada por la cuenta y no dispara una re-siembra local espuria antes de
// que llegue la hidratación (ver reseedDefaultDashboards en dashboard-layout).
const LS_DEFAULTS_VERSION = "starseed_defaults_version";

/** Claves que componen el blob de estado completo del dashboard. */
const LS_KEYS = [LS_DASHBOARDS, LS_WIDGETS, LS_ORDER, LS_DEFAULTS_VERSION] as const;
type LsKey = (typeof LS_KEYS)[number];

/** Nombre de la tabla dedicada (realtime-enabled). */
export const DASHBOARD_STATE_TABLE = "dashboard_state";

/** Forma del blob persistido en `dashboard_state.data` (jsonb). */
export type DashboardStateBlob = Partial<Record<LsKey, unknown>>;

/** Resultado de leer la fila remota. */
export interface RemoteDashboardState {
    data: DashboardStateBlob;
    updated_at: string | null;
}

// ── Helpers de bajo nivel (SSR-safe / defensivos) ────────────────
function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string | null {
    if (!isClient()) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeRaw(key: string, value: string): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(key, value);
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
}

/** Serializa un valor cualquiera a string (idempotente si ya es string). */
function ser(v: unknown): string {
    return typeof v === "string" ? v : JSON.stringify(v);
}

/** UID de la sesión actual (o null si no hay sesión / falla). Nunca lanza. */
async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ── collectLocal / mergeIntoLocal ────────────────────────────────

/**
 * collectLocal — lee las claves de localStorage del dashboard a un blob.
 * Cada clave se intenta parsear como JSON; si no parsea, se guarda en crudo.
 * Las claves ausentes simplemente se omiten del blob. SSR-safe.
 */
export function collectLocal(): DashboardStateBlob {
    const blob: DashboardStateBlob = {};
    if (!isClient()) return blob;
    for (const key of LS_KEYS) {
        const raw = readRaw(key);
        if (raw == null) continue;
        try {
            blob[key] = JSON.parse(raw);
        } catch {
            blob[key] = raw;
        }
    }
    return blob;
}

/**
 * mergeIntoLocal — escribe el blob de vuelta en localStorage (guarded).
 * Solo escribe las claves presentes en el blob; el resto se deja intacto.
 * No dispara eventos ni recargas: el caller decide cómo re-leer su estado.
 * Devuelve true si escribió al menos una clave. SSR-safe; nunca lanza.
 */
export function mergeIntoLocal(data: DashboardStateBlob | null | undefined): boolean {
    if (!isClient() || !data || typeof data !== "object") return false;
    let wrote = false;
    for (const key of LS_KEYS) {
        const value = (data as DashboardStateBlob)[key];
        if (value === undefined || value === null) continue;
        writeRaw(key, ser(value));
        wrote = true;
    }
    return wrote;
}

// ── loadRemoteDashboardState ─────────────────────────────────────

/**
 * loadRemoteDashboardState — lee la fila `dashboard_state` del usuario actual.
 * Devuelve `{ data, updated_at }` o `null` si no hay sesión / fila / falla.
 * Nunca lanza.
 */
export async function loadRemoteDashboardState(): Promise<RemoteDashboardState | null> {
    if (!isClient()) return null;
    try {
        const userId = await getUserId();
        if (!userId) return null;

        const supabase = createClient();
        const { data, error } = await supabase
            .from(DASHBOARD_STATE_TABLE)
            .select("data, updated_at")
            .eq("owner", userId)
            .maybeSingle();

        if (error || !data) return null;

        const blob = (data as any).data;
        if (!blob || typeof blob !== "object") return null;

        return {
            data: blob as DashboardStateBlob,
            updated_at: ((data as any).updated_at as string | null) ?? null,
        };
    } catch {
        return null;
    }
}

// ── saveRemoteDashboardState ─────────────────────────────────────

/**
 * saveRemoteDashboardState — upsert del blob completo en `dashboard_state`
 * (onConflict owner). El caller debería aplicar debounce (~800ms). Nunca lanza.
 * Si no hay sesión, es no-op silencioso (queda solo la caché local).
 */
export async function saveRemoteDashboardState(
    data: DashboardStateBlob | null | undefined,
): Promise<void> {
    if (!isClient() || !data || typeof data !== "object") return;
    try {
        const userId = await getUserId();
        if (!userId) return; // sin sesión: solo local (fallback offline)

        const supabase = createClient();
        await supabase
            .from(DASHBOARD_STATE_TABLE)
            .upsert(
                {
                    owner: userId,
                    data,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "owner" },
            );
    } catch {
        /* nunca rompemos: la sincronización remota es best-effort */
    }
}
