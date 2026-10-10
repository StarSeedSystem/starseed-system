"use client";

/*
 * dashboards-sync — Respaldo NO invasivo de los tableros del usuario en la cuenta.
 * ------------------------------------------------------------------------------
 * Hace una COPIA DE SEGURIDAD de los tableros (dashboards) y su disposición de
 * widgets en la cuenta soberana (Supabase `user_settings.prefs.dashboards`), para
 * que la misma identidad pueda RECUPERARLOS si entra desde un dispositivo nuevo
 * (o si se borró el almacenamiento local). NO es la fuente de verdad ni altera la
 * lógica de siembra de `dashboard-layout.tsx`: solo lee/escribe localStorage.
 *
 * Principios (alineados con CLAUDE.md · Identidad Soberana, tolerancia a fallos):
 *  - LOCAL ES LA VERDAD: localStorage manda. La nube es red de seguridad.
 *  - RESTAURACIÓN SOLO SI VACÍO: si NO hay tableros locales pero SÍ respaldo,
 *    restaura a localStorage y avisa (evento + reload suave). Si hay locales,
 *    nunca los sobrescribe con la nube: solo sube el respaldo.
 *  - DEFENSIVO: sin sesión / sin tabla / red caída → no rompe (try/catch).
 *  - NO TOCA la lógica de dashboard-layout (no cambia `dashboard-layout` ni las
 *    claves de inicialización/orden; solo replica los datos).
 *
 * Persistencia en Supabase (merge no destructivo sobre el jsonb `prefs`):
 *   prefs.dashboards → { dashboards, widgets, order, savedAt }
 */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { huellaValor, mergeUserPrefs, type MergePrefsResult, type PrefsPatch } from "@/lib/sync/user-prefs";

// ── Claves de localStorage del dashboard (NO se modifica su lógica) ──
const LS_DASHBOARDS = "starseed_dashboards";
const LS_WIDGETS = "starseed_widgets";
const LS_ORDER = "dashboard_order";

// Evento emitido tras restaurar, por si la UI quiere reaccionar sin reload.
const DASHBOARDS_RESTORED_EVENT = "starseed:dashboards:restored";

const PUSH_DEBOUNCE_MS = 1500;
/**
 * (CON1010 · 2026-10-10) El intervalo ya NO sube nada por sí mismo: mira localStorage (sin red) y
 * solo sube si el CONTENIDO de los tableros cambió. Antes cada vuelta mandaba un respaldo con
 * `savedAt: Date.now()` — un valor distinto cada 30 s — así que `mergeUserPrefs` nunca lo veía
 * repetido: 2 peticiones por minuto por pestaña visible (1 en las ocultas). Medido el 2026-10-10:
 * 3.389 de las 25.022 peticiones del proyecto eran este respaldo, el 99 % idénticas.
 */
const POLL_INTERVAL_MS = 30_000;
/** Huella y fecha del último respaldo subido DESDE ESTE APARATO (no se sincroniza: no es `starseed.brain.*`). */
export const CLAVE_RESPALDO_TABLEROS = "starseed.consumo.respaldo-tableros.v1";
/** Aunque nada cambie, como mucho una re-subida de seguridad cada 6 h (otro medio pudo pisar la copia). */
export const RESUBIDA_SEGURIDAD_MS = 6 * 60 * 60_000;

// ── Helpers de bajo nivel ────────────────────────────────────────
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

async function getUserId(): Promise<string | null> {
    // (2026-09-29, consumo) Sin red: sesión local en caché — /auth/v1/user fue la ruta más pedida.
    return uidActual();
}

/** ¿Hay tableros propios guardados localmente? (la clave principal) */
function hasLocalDashboards(): boolean {
    const raw = readRaw(LS_DASHBOARDS);
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length > 0;
        // Algunos formatos guardan un objeto/diccionario de tableros.
        if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
        return false;
    } catch {
        // Si no parsea pero hay contenido, lo consideramos presente.
        return raw.trim().length > 0;
    }
}

interface DashboardsBackup {
    dashboards: unknown;
    widgets?: unknown;
    order?: unknown;
    savedAt: number;
}

interface RegistroRespaldo {
    /** Huella del CONTENIDO (tableros, widgets, orden), sin la fecha. */
    h: string;
    /** Cuándo cambió por última vez ese contenido (lo que viaja como `savedAt`). */
    savedAt: number;
    /** Cuándo se subió por última vez desde este aparato (0 = nunca). */
    subidoEn: number;
}

function leerRegistro(): RegistroRespaldo | null {
    const raw = readRaw(CLAVE_RESPALDO_TABLEROS);
    if (!raw) return null;
    try {
        const r = JSON.parse(raw) as Partial<RegistroRespaldo>;
        if (typeof r.h !== "string" || typeof r.savedAt !== "number") return null;
        return { h: r.h, savedAt: r.savedAt, subidoEn: typeof r.subidoEn === "number" ? r.subidoEn : 0 };
    } catch {
        return null;
    }
}

/** Snapshot local actual de los tableros (lo que respaldamos). `savedAt` = último cambio REAL. */
function collectLocalBackup(ahora: number = Date.now()): { backup: DashboardsBackup; huella: string } | null {
    const dashboardsRaw = readRaw(LS_DASHBOARDS);
    if (!dashboardsRaw) return null;
    let dashboards: unknown;
    try {
        dashboards = JSON.parse(dashboardsRaw);
    } catch {
        dashboards = dashboardsRaw;
    }

    const backup: DashboardsBackup = { dashboards, savedAt: ahora };

    const widgetsRaw = readRaw(LS_WIDGETS);
    if (widgetsRaw != null) {
        try {
            backup.widgets = JSON.parse(widgetsRaw);
        } catch {
            backup.widgets = widgetsRaw;
        }
    }

    const orderRaw = readRaw(LS_ORDER);
    if (orderRaw != null) {
        try {
            backup.order = JSON.parse(orderRaw);
        } catch {
            backup.order = orderRaw;
        }
    }

    const huella = huellaValor({ dashboards: backup.dashboards, widgets: backup.widgets, order: backup.order });
    const previo = leerRegistro();
    // Mismo contenido que la última vez ⇒ misma fecha: el respaldo es idéntico y no hay nada que subir.
    if (previo && previo.h === huella) backup.savedAt = previo.savedAt;
    return { backup, huella };
}

/** Restaura un respaldo remoto a localStorage (solo si no hay tableros locales). */
function restoreBackupToLocal(backup: DashboardsBackup): void {
    if (!isClient()) return;
    if (backup.dashboards === undefined || backup.dashboards === null) return;

    const ser = (v: unknown): string =>
        typeof v === "string" ? v : JSON.stringify(v);

    writeRaw(LS_DASHBOARDS, ser(backup.dashboards));
    if (backup.widgets !== undefined) writeRaw(LS_WIDGETS, ser(backup.widgets));
    if (backup.order !== undefined) writeRaw(LS_ORDER, ser(backup.order));

    // Aviso + reload suave para que dashboard-layout relea su estado limpio.
    try {
        window.dispatchEvent(new Event(DASHBOARDS_RESTORED_EVENT));
    } catch {
        /* noop */
    }
    try {
        // Reload suave: deja que React/efectos relean localStorage.
        window.location.reload();
    } catch {
        /* noop */
    }
}

function isBackup(x: unknown): x is DashboardsBackup {
    return (
        typeof x === "object" &&
        x !== null &&
        "dashboards" in x &&
        (x as DashboardsBackup).dashboards !== undefined
    );
}

// ── Lectura remota del respaldo ──────────────────────────────────
async function fetchRemoteBackup(userId: string): Promise<DashboardsBackup | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_settings")
            .select("prefs")
            .eq("user_id", userId)
            .maybeSingle();
        if (error || !data?.prefs || typeof data.prefs !== "object") return null;
        const prefs = data.prefs as Record<string, unknown>;
        const dash = prefs.dashboards;
        return isBackup(dash) ? dash : null;
    } catch {
        return null;
    }
}

// ── Escritura remota del respaldo (merge no destructivo de prefs) ─
export type ResultadoRespaldo = "subido" | "sin-cambios" | "sin-datos" | "fallo";

/**
 * Sube el respaldo SOLO si el contenido cambió desde la última subida de este aparato (o si pasó
 * `RESUBIDA_SEGURIDAD_MS`). Nunca lanza. `merge` y `ahora` se inyectan en las pruebas.
 */
export async function respaldarTableros(
    userId: string,
    deps: { merge?: (patch: PrefsPatch, opts?: { userId?: string }) => Promise<MergePrefsResult>; ahora?: () => number } = {},
): Promise<ResultadoRespaldo> {
    try {
        const ahora = (deps.ahora ?? Date.now)();
        const local = collectLocalBackup(ahora);
        if (!local) return "sin-datos"; // nada local que respaldar
        const previo = leerRegistro();
        if (previo && previo.h === local.huella && previo.subidoEn > 0 && ahora - previo.subidoEn < RESUBIDA_SEGURIDAD_MS) {
            return "sin-cambios";
        }
        // Adenda 69 · A — antes: leer `prefs` + `upsert` de la COLUMNA ENTERA.
        // Eso borraba las claves que otros módulos hubieran escrito después de
        // nuestra lectura (lost update: `prefs` es una sola columna jsonb que
        // comparten ~12 módulos). Ahora se manda SOLO el parche y Postgres lo
        // funde de forma atómica. Ver src/lib/sync/user-prefs.ts.
        const res = await (deps.merge ?? mergeUserPrefs)({ dashboards: local.backup }, { userId });
        if (!res.ok) return "fallo";
        writeRaw(
            CLAVE_RESPALDO_TABLEROS,
            JSON.stringify({ h: local.huella, savedAt: local.backup.savedAt, subidoEn: ahora } satisfies RegistroRespaldo),
        );
        return res.sinCambios ? "sin-cambios" : "subido";
    } catch {
        return "fallo"; // nunca rompemos: el respaldo es best-effort
    }
}

async function pushBackup(userId: string): Promise<void> {
    await respaldarTableros(userId);
}

// ── Hook ─────────────────────────────────────────────────────────
/**
 * useDashboardsBackup — móntalo UNA vez (vía SovereignSyncMount) en el RootLayout.
 *
 * Comportamiento:
 *  - Al montar con sesión:
 *      · Si NO hay tableros locales pero SÍ respaldo remoto → RESTAURA a
 *        localStorage (evento `starseed:dashboards:restored` + reload suave).
 *      · Si hay tableros locales → sube el respaldo a `prefs.dashboards`.
 *  - Mientras hay sesión: sube respaldo (debounce) al detectar 'storage' y en
 *    un intervalo suave (~30s). Es respaldo/seguridad, no fuente de verdad.
 *  - Defensivo y SSR-safe.
 */
export function useDashboardsBackup(): void {
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
                    if (!hasLocalDashboards()) return; // nada propio que respaldar
                    await pushBackup(userId);
                })();
            }, PUSH_DEBOUNCE_MS);
        };

        // Arranque: restaurar si vacío, o respaldar si hay local.
        const bootstrap = async (userId: string) => {
            if (!active) return;
            if (!hasLocalDashboards()) {
                const remote = await fetchRemoteBackup(userId);
                if (active && remote) {
                    restoreBackupToLocal(remote); // dispara reload suave
                    return;
                }
            }
            // Hay tableros locales (o no había respaldo): respaldar.
            if (active && hasLocalDashboards()) await pushBackup(userId);
        };

        // Cuenta con la que ya se arrancó: el arranque inicial y el INITIAL_SESSION no se duplican.
        let cuentaArrancada: string | null = null;
        void (async () => {
            const userId = await getUserId();
            if (!active || !userId || userId === cuentaArrancada) return;
            cuentaArrancada = userId;
            await bootstrap(userId);
        })();

        // Cambios entre pestañas de las claves de dashboard → respaldo con debounce.
        const onStorage = (e: StorageEvent) => {
            if (e.key === LS_DASHBOARDS || e.key === LS_WIDGETS || e.key === LS_ORDER || e.key === null) {
                schedulePush();
            }
        };
        window.addEventListener("storage", onStorage);

        // Intervalo suave de respaldo (la pestaña activa no recibe su propio 'storage'). Sin red: solo
        // compara la huella del contenido y sube si cambió (`respaldarTableros`). Con la pestaña oculta
        // no se mira (ahí no se editan tableros).
        const poll = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
            schedulePush();
        }, POLL_INTERVAL_MS);

        // Cambios de sesión: al iniciar sesión (o cambiar de cuenta), re-evaluar restauración/respaldo.
        // La renovación del token y el eco de volver a la pestaña no relanzan nada.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            void (async () => {
                if (!active) return;
                const userId = session?.user?.id ?? null;
                if (!userId) {
                    cuentaArrancada = null;
                    return;
                }
                if (userId === cuentaArrancada) return;
                cuentaArrancada = userId;
                await bootstrap(userId);
            })();
        });

        return () => {
            active = false;
            if (pushTimer) clearTimeout(pushTimer);
            clearInterval(poll);
            window.removeEventListener("storage", onStorage);
            try {
                sub.subscription.unsubscribe();
            } catch {
                /* noop */
            }
        };
    }, []);
}
