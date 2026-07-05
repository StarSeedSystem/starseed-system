"use client";

/*
 * settings-sync — Sincronización de preferencias con la cuenta StarSeed (StarSeed ID).
 * ----------------------------------------------------------------------------------
 * Lleva las preferencias locales (apariencia, dock, Trinity, memoria del Exocórtex)
 * a la cuenta soberana compartida por TODO el ecosistema (Supabase
 * `dzkjapinnewkxzjltadv`), para que la misma identidad —Nexus, Café, OS— recupere
 * su configuración en cualquier dispositivo.
 *
 * Principios (alineados con CLAUDE.md · Identidad Soberana e Invariantes):
 *  - ADITIVO Y OPT-IN: no cambia nada hasta que el usuario pulsa sincronizar.
 *    localStorage sigue siendo la fuente de verdad sin conexión.
 *  - TOLERANTE A FALLOS: si no hay sesión, o la tabla `user_settings` aún no
 *    existe, devuelve un resultado claro sin romper la app (nunca lanza).
 *  - DATOS DEL USUARIO, PROPIEDAD DEL USUARIO: solo su propia fila (RLS).
 *
 * Migración SQL requerida (documentada en el SOP, ejecutar una vez en Supabase):
 *   create table if not exists public.user_settings (
 *     user_id uuid primary key references auth.users(id) on delete cascade,
 *     prefs jsonb not null default '{}'::jsonb,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.user_settings enable row level security;
 *   create policy "own settings" on public.user_settings
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */

import { createClient } from "@/utils/supabase/client";

/** Claves de preferencia que viajan con la cuenta. Aditivo: ampliar sin migración. */
export const SYNCED_KEYS = [
    "appearance-config-v2",      // apariencia completa (incluye tema del sistema + Trinity táctil)
    "starseed.dock.items.v1",    // OmniDock personalizado
    "os.trinity.fab",            // visibilidad del botón Trinity
    "os.trinity.fab.pos",        // posición del botón Trinity
    "starseed_user_memory",      // memoria del Exocórtex (intereses/rasgos)
    // ── Astraura Intelligence (ola 2026-07): la MISMA inteligencia en OS,
    //    Nexus y Café, en todos los dispositivos de la cuenta. Las claves API
    //    NUNCA viajan (starseed.ai.providers queda local por diseño).
    "starseed.astraura.intelligence.v1", // modo auto/manual, overrides por tarea
    "starseed.oss.defaults.v1",          // servicio elegido por función/scope
    "starseed.ai.function-models.v1",    // preferencias de UI de modelos por función
    "starseed.neurons.prefs.v1",         // permisos/preferencias de neuronas (dispositivos)
    "starseed.library.installed.v1",     // paquetes instalados desde la Biblioteca
    "starseed.library.mine.v1",          // réplicas/forks editables del usuario (Cydia «Replicar»)
    "starseed.library.published.v1",     // ramas marcadas como públicas (preparadas para la red)
    "starseed.aurora.voice.v1",          // voz de Aurora: motor (navegador/Kokoro/Kitten) + voz elegida
    "starseed.aurora.vision.v1",             // visión de Aurora: activada + modelo elegido
    "starseed.astraura.installed-models.v1", // modelos de navegador instalados (opt-in) por el usuario
] as const;

export interface SyncResult {
    ok: boolean;
    reason?: "no-session" | "no-table" | "empty" | "error";
    message: string;
    updatedAt?: string;
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

function collectPrefs(): Record<string, unknown> {
    const bundle: Record<string, unknown> = {};
    if (typeof window === "undefined") return bundle;
    for (const key of SYNCED_KEYS) {
        const raw = window.localStorage.getItem(key);
        if (raw != null) {
            try { bundle[key] = JSON.parse(raw); }
            catch { bundle[key] = raw; } // valores no-JSON (p.ej. "on"/"off") tal cual
        }
    }
    return bundle;
}

/** ¿Hay una sesión StarSeed activa en este dispositivo? */
export async function hasStarseedSession(): Promise<boolean> {
    return (await getUserId()) != null;
}

/** Sube las preferencias locales a la cuenta (upsert de la fila propia). */
export async function pushPreferences(): Promise<SyncResult> {
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: "no-session", message: "Inicia sesión con tu cuenta StarSeed para sincronizar." };

    const prefs = collectPrefs();
    if (Object.keys(prefs).length === 0) return { ok: false, reason: "empty", message: "No hay preferencias locales que subir todavía." };

    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("user_settings")
            .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) {
            const missing = /relation .*user_settings.* does not exist/i.test(error.message);
            return {
                ok: false,
                reason: missing ? "no-table" : "error",
                message: missing
                    ? "Falta crear la tabla user_settings en Supabase (ver SOP). Tus ajustes siguen guardados localmente."
                    : `No se pudo subir: ${error.message}`,
            };
        }
        return { ok: true, message: "Preferencias guardadas en tu cuenta StarSeed.", updatedAt: new Date().toISOString() };
    } catch (e: any) {
        return { ok: false, reason: "error", message: `Error de red al subir: ${e?.message ?? e}` };
    }
}

/**
 * Descarga las preferencias de la cuenta y las aplica a localStorage.
 * No fuerza recarga: el llamador decide (recomendado recargar para que todos
 * los contextos relean su estado de forma limpia).
 */
export async function pullPreferences(): Promise<SyncResult & { applied?: string[] }> {
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: "no-session", message: "Inicia sesión con tu cuenta StarSeed para recuperar tus ajustes." };

    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_settings")
            .select("prefs, updated_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            const missing = /relation .*user_settings.* does not exist/i.test(error.message);
            return {
                ok: false,
                reason: missing ? "no-table" : "error",
                message: missing
                    ? "Falta crear la tabla user_settings en Supabase (ver SOP)."
                    : `No se pudo descargar: ${error.message}`,
            };
        }
        if (!data?.prefs || typeof data.prefs !== "object") {
            return { ok: false, reason: "empty", message: "Tu cuenta aún no tiene preferencias guardadas." };
        }

        const applied: string[] = [];
        for (const [key, value] of Object.entries(data.prefs as Record<string, unknown>)) {
            if (!SYNCED_KEYS.includes(key as any)) continue; // solo claves conocidas
            try {
                const serialized = typeof value === "string" ? value : JSON.stringify(value);
                window.localStorage.setItem(key, serialized);
                applied.push(key);
            } catch { /* clave individual ignorada */ }
        }
        return { ok: true, message: `Ajustes recuperados de tu cuenta (${applied.length}).`, applied, updatedAt: data.updated_at };
    } catch (e: any) {
        return { ok: false, reason: "error", message: `Error de red al descargar: ${e?.message ?? e}` };
    }
}
