"use client";

/*
 * library-sync — Sincronización del store soberano (Biblioteca + Apps) con la cuenta StarSeed.
 * ------------------------------------------------------------------------------------------
 * Lleva el store soberano local (`library-store.ts`: recursos guardados + apps
 * instaladas) a la cuenta soberana DEL OS (Supabase **`nxstilnyidvkqeosofuh`**,
 * tabla `user_settings`), de modo que la misma cuenta del OS recupere su
 * Biblioteca y su Launcher en cualquier dispositivo.
 * ⚠️ Corregido el 2026-07-12: la cabecera decía `dzkjapinnewkxzjltadv` y hablaba
 * de una cuenta «compartida por TODO el ecosistema». FALSO:
 * `dzkjapinnewkxzjltadv` es el proyecto de Nexus/Café y sus cuentas están
 * SEPARADAS de las del OS (CLAUDE.md §2).
 * dispositivo.
 *
 * (2026-09-29 · contrato «consumo») Se RETIRA el espejo en `cafe_accounts.apps`: esa tabla es
 * del esquema del Café (cuentas SEPARADAS de las del OS, CLAUDE.md §2) y en la base del OS no
 * tiene la columna `user_id` por la que se filtraba → HTTP 400 en CADA subida de la biblioteca
 * (los «cafe_accounts 400 repetidos» del registro del 28-09). El espejo no le servía a nadie: la
 * verdad de la cuenta del OS es `user_settings.prefs.installed`. Además: debounce de 2 s, la
 * lectura trae solo las 5 claves que usa (no la columna `prefs` entera) y solo se relee al
 * cambiar de CUENTA, no en cada refresco de token.
 *
 * Principios (alineados con CLAUDE.md · Identidad Soberana, Singularidad del contenido):
 *  - LOCAL ES LA VERDAD: localStorage (vía library-store) sigue mandando sin
 *    conexión. La nube solo enriquece (unión, nunca resta).
 *  - TOLERANTE A FALLOS: sin sesión, sin tabla, o ante error de red, NO rompe
 *    (try/catch en todo). El usuario nunca pierde lo local.
 *  - DATOS DEL USUARIO, PROPIEDAD DEL USUARIO: solo su propia fila (RLS).
 *  - MERGE NO DESTRUCTIVO DE PREFS: se lee `prefs` actual y se mezcla; NO se
 *    pisan otras claves (p.ej. las de settings-sync ni `prefs.dashboards`).
 *
 * Persistencia en Supabase (la fila/tabla la gestiona settings-sync; aquí solo
 * añadimos claves al jsonb `prefs`):
 *   prefs.library    → SavedResource[]   (espejo de getSaved())
 *   prefs.installed  → InstalledApp[]    (espejo de getInstalled())
 */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import {
    getSaved,
    getInstalled,
    saveResource,
    installApp,
    type SavedResource,
    type InstalledApp,
} from "@/lib/library-store";
// Store "Cydia" (paquetes/skills) + Capacidades de Aurora: también SIGUEN a la
// cuenta soberana, para que las skills instaladas y el comportamiento de Aurora
// sean idénticos en OS · Nexus · Café con la misma identidad.
import {
    getInstalledMap,
    getInstalledFunctionIds,
    mergeInstalledFromAccount,
    type InstalledEntry,
} from "@/lib/library/packages";
import { recomputeCapabilityMirror, CAPS_KEY } from "@/ai/astraura/skills";

// Mismo nombre de evento que emite el store soberano tras cada mutación.
const LIBRARY_EVENT = "starseed:library";
// Debounce de subida (≥ 2 s, contrato «consumo») para agrupar ráfagas de cambios.
const PUSH_DEBOUNCE_MS = 2000;

// ── Helpers de bajo nivel ────────────────────────────────────────
function isClient(): boolean {
    return typeof window !== "undefined";
}

async function getUserId(): Promise<string | null> {
    // (2026-09-29, consumo) Sin red: sesión local en caché — /auth/v1/user fue la ruta más pedida.
    return uidActual();
}

/** Clave de dedup coherente con library-store: url+título / id. */
function savedKey(r: { id?: string; url?: string; title?: string }): string {
    const url = (r.url ?? "").trim().toLowerCase();
    const title = (r.title ?? "").trim().toLowerCase();
    if (url || title) return `u:${url}::t:${title}`;
    return `id:${(r.id ?? "").trim().toLowerCase()}`;
}

function isSavedResource(x: unknown): x is SavedResource {
    return (
        typeof x === "object" &&
        x !== null &&
        typeof (x as { title?: unknown }).title === "string" &&
        typeof (x as { kind?: unknown }).kind === "string"
    );
}

function isInstalledApp(x: unknown): x is InstalledApp {
    return (
        typeof x === "object" &&
        x !== null &&
        typeof (x as { id?: unknown }).id === "string" &&
        typeof (x as { name?: unknown }).name === "string"
    );
}

// ── Fusión: nube → store local (unión, nunca resta) ──────────────
/**
 * Trae lo remoto y lo FUSIONA con lo local usando las funciones del store
 * soberano (que ya deduplican). Nunca elimina nada local.
 */
function mergeRemoteIntoLocal(remote: {
    library?: unknown;
    installed?: unknown;
}): void {
    if (!isClient()) return;

    // Recursos guardados (dedup por url+título lo hace saveResource()).
    if (Array.isArray(remote.library)) {
        const localKeys = new Set(getSaved().map((r) => savedKey(r)));
        for (const item of remote.library) {
            if (!isSavedResource(item)) continue;
            if (localKeys.has(savedKey(item))) continue;
            try {
                saveResource({
                    id: item.id,
                    kind: item.kind,
                    title: item.title,
                    url: item.url,
                    origin: item.origin,
                });
            } catch {
                /* item ignorado */
            }
        }
    }

    // Apps instaladas (dedup por id lo hace installApp()).
    if (Array.isArray(remote.installed)) {
        const localIds = new Set(getInstalled().map((a) => a.id));
        for (const item of remote.installed) {
            if (!isInstalledApp(item)) continue;
            if (localIds.has(item.id)) continue;
            try {
                installApp({ id: item.id, name: item.name });
            } catch {
                /* item ignorado */
            }
        }
    }
}

// ── Lectura remota ───────────────────────────────────────────────
async function pullAndMerge(userId: string): Promise<void> {
    try {
        const supabase = createClient();
        // Solo las claves de este módulo (rutas JSON de PostgREST), no la columna entera.
        const { data, error } = await supabase
            .from("user_settings")
            .select(
                "library:prefs->library, installed:prefs->installed, cydiaInstalled:prefs->cydiaInstalled, " +
                    "cydiaFunctions:prefs->cydiaFunctions, capabilities:prefs->capabilities",
            )
            .eq("user_id", userId)
            .maybeSingle();
        if (error || !data || typeof data !== "object") return;
        const prefs = data as Record<string, unknown>;
        mergeRemoteIntoLocal({ library: prefs.library, installed: prefs.installed });

        // Cydia (paquetes/skills) de la cuenta → unión con lo local (nunca resta).
        try {
            mergeInstalledFromAccount(
                (prefs.cydiaInstalled as Record<string, InstalledEntry> | undefined) ?? undefined,
                (prefs.cydiaFunctions as string[] | undefined) ?? undefined,
            );
        } catch { /* noop */ }

        // Capacidades de Aurora: unión de las remotas con las locales; si no hay
        // remotas, recomputa desde lo instalado. Así el COMPORTAMIENTO de Aurora
        // (system prompt + routing) es el mismo en cualquier dispositivo.
        try {
            if (Array.isArray(prefs.capabilities)) {
                const remote = (prefs.capabilities as unknown[]).filter(
                    (x): x is string => typeof x === "string",
                );
                const union = Array.from(new Set([...readLocalCaps(), ...remote]));
                if (isClient()) window.localStorage.setItem(CAPS_KEY, JSON.stringify(union));
            } else {
                recomputeCapabilityMirror();
            }
        } catch { /* noop */ }
    } catch {
        /* sin sesión / sin tabla / red: localStorage manda */
    }
}

/** Espejo local de capacidades (para la unión no destructiva en el pull). */
function readLocalCaps(): string[] {
    if (!isClient()) return [];
    try {
        const raw = window.localStorage.getItem(CAPS_KEY);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

// ── Escritura remota (merge no destructivo de prefs) ─────────────
async function pushSnapshot(userId: string): Promise<void> {
    try {

        // 1) Solo NUESTRAS claves: nunca volvemos a mandar la columna entera.
        //
        // Adenda 69 · A — antes esto leía `prefs`, le añadía sus claves y hacía
        // `upsert` de la COLUMNA COMPLETA. `user_settings.prefs` es UNA columna
        // jsonb compartida por ~12 módulos que arrancan a la vez al cargar la
        // página: el último en escribir borraba lo que los demás hubieran
        // guardado tras su lectura. Medido en producción: este push dejó la fila
        // en 6 claves y se llevó por delante `__meta` y TODAS las de
        // Aurora/Astraura que realtime-sync acababa de subir bien — por eso la
        // personalidad "solo se guardaba en el dispositivo donde se configura".
        // Ahora se manda SOLO el parche y Postgres lo funde atómicamente.
        const installed = getInstalled();
        const patch: Record<string, unknown> = {
            library: getSaved(),
            installed,
        };

        // Store "Cydia" (paquetes/skills) + Capacidades de Aurora → cuenta, para
        // que las skills instaladas y el COMPORTAMIENTO de Aurora sigan a la
        // misma identidad en OS · Nexus · Café. recompute escribe además el
        // espejo local `starseed.capabilities.v1`.
        try {
            patch.cydiaInstalled = getInstalledMap();
            patch.cydiaFunctions = getInstalledFunctionIds();
            patch.capabilities = recomputeCapabilityMirror();
        } catch {
            /* defensivo: nunca rompemos la subida por esto */
        }

        // 2) Mezcla atómica (ver src/lib/sync/user-prefs.ts). Si la cuenta ya tiene
        //    exactamente estos valores, `mergeUserPrefs` no hace ninguna petición.
        await mergeUserPrefs(patch, { userId });
    } catch {
        /* nunca rompemos: localStorage sigue siendo la verdad */
    }
}

// ── API imperativa ───────────────────────────────────────────────
/**
 * Fuerza una subida inmediata del store soberano a la cuenta (si hay sesión).
 * Resuelve siempre (defensivo). Útil tras una acción crítica.
 */
export async function syncNow(): Promise<void> {
    const userId = await getUserId();
    if (!userId) return;
    await pushSnapshot(userId);
}

// ── Hook ─────────────────────────────────────────────────────────
/**
 * useLibrarySync — móntalo UNA vez (vía SovereignSyncMount) en el RootLayout.
 *
 * Comportamiento:
 *  - Al montar y en cada cambio de sesión (onAuthStateChange): si hay usuario,
 *    LEE `prefs.library` / `prefs.installed` y los FUSIONA con el store local
 *    (unión por url+título / id, sin perder lo local).
 *  - Al disparar `starseed:library` (con debounce ~1s): UPSERT de
 *    `{ library, installed }` dentro de `prefs` (merge no destructivo).
 *  - Todo defensivo y SSR-safe (no toca window/localStorage en servidor).
 */
export function useLibrarySync(): void {
    useEffect(() => {
        if (!isClient()) return;

        const supabase = createClient();
        let active = true;
        let pushTimer: ReturnType<typeof setTimeout> | null = null;

        const schedulePush = () => {
            if (pushTimer) clearTimeout(pushTimer);
            pushTimer = setTimeout(() => {
                void (async () => {
                    const userId = await getUserId();
                    if (!active || !userId) return;
                    await pushSnapshot(userId);
                })();
            }, PUSH_DEBOUNCE_MS);
        };

        // Fusión inicial: trae lo remoto y lo une a lo local (una vez por cuenta).
        let cuentaFundida: string | null = null;
        void (async () => {
            const userId = await getUserId();
            if (!active || !userId || cuentaFundida === userId) return;
            cuentaFundida = userId;
            await pullAndMerge(userId);
        })();

        // Cambios locales del store soberano → subida con debounce.
        const onLibraryChange = () => schedulePush();
        window.addEventListener(LIBRARY_EVENT, onLibraryChange);

        // Cambios de sesión: al entrar con OTRA cuenta, refundir lo remoto sobre lo local.
        // (Antes cada evento —TOKEN_REFRESHED cada hora, SIGNED_IN al volver a la pestaña—
        // releía la columna `prefs` entera.)
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            void (async () => {
                if (!active) return;
                const userId = session?.user?.id ?? null;
                if (!userId) {
                    cuentaFundida = null;
                    return;
                }
                if (userId === cuentaFundida) return;
                cuentaFundida = userId;
                await pullAndMerge(userId);
            })();
        });

        return () => {
            active = false;
            if (pushTimer) clearTimeout(pushTimer);
            window.removeEventListener(LIBRARY_EVENT, onLibraryChange);
            try {
                sub.subscription.unsubscribe();
            } catch {
                /* noop */
            }
        };
    }, []);
}
