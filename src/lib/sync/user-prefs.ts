"use client";

/*
 * user-prefs — LA ÚNICA PUERTA DE ESCRITURA a `user_settings.prefs`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CAUSA RAÍZ que arregla (Adenda 69 · A — observada EN VIVO contra producción
 * el 2026-07-13, no teorizada):
 *
 *   `user_settings.prefs` es UNA sola columna jsonb que comparten ~12 módulos
 *   (realtime-sync, escritorios, biblioteca, dashboards, agentes, conectores,
 *   correo, señalización, registro de dispositivos, servicios OSS…). TODOS
 *   escribían así:
 *
 *       const { data } = await sb.from("user_settings").select("prefs")…   // LEER
 *       const prefs = { ...data.prefs };                                   // MUTAR
 *       prefs.loMio = …;
 *       await sb.from("user_settings").upsert({ user_id, prefs });         // PISAR TODO
 *
 *   El upsert reemplaza la columna ENTERA. Como al cargar la página todos
 *   estos módulos arrancan a la vez, cada uno lee un `prefs` y luego lo vuelve
 *   a escribir completo: el último en escribir BORRA todo lo que los demás
 *   hubieran guardado tras su propia lectura. Lost update de manual.
 *
 *   Medido en producción: la fila de la cuenta pasó de 16 claves a 4 en
 *   segundos. Desaparecieron `__meta` (marcas LWW), `capabilities`, `library`,
 *   `installed`, los `starseed.brain.*` y TODAS las claves de Aurora/Astraura
 *   que realtime-sync acababa de subir bien. De ahí el bug que el usuario veía:
 *   la personalidad de Aurora SÍ subía a la cuenta… y otro módulo la aniquilaba
 *   segundos después, así que el segundo dispositivo jamás la veía. Parecía
 *   "no sincroniza"; en realidad era "se sincroniza y se borra".
 *
 * SOLUCIÓN: nadie vuelve a mandar la columna entera. Se manda solo el PARCHE y
 * Postgres lo funde con la fila bloqueada, de forma atómica
 * (`merge_user_prefs`, ver supabase/migrations/20260714020000_*.sql):
 *   · primer nivel → mezcla superficial (cada módulo dueño de sus claves),
 *   · `__meta`     → mezcla profunda (sub-objeto compartido de marcas LWW),
 *   · valor `null` → BORRA la clave (semántica de patch).
 *
 * Degradación honesta: si la RPC todavía no existe en la base (migración sin
 * aplicar, proyecto self-hosted antiguo), se cae al patrón antiguo de
 * leer-mezclar-upsert. Sigue habiendo carrera, pero la app NO se rompe; y se
 * avisa UNA vez por consola para que el fallo sea diagnosticable.
 */

import { createClient } from "@/utils/supabase/client";

/** Parche de preferencias: claves de primer nivel. `null` BORRA la clave. */
export type PrefsPatch = Record<string, unknown>;

/** Cliente mínimo que necesitamos (permite pasar un cliente ajeno: Supabase propio del usuario). */
type MinimalClient = ReturnType<typeof createClient>;

export interface MergePrefsResult {
    ok: boolean;
    /** true si la escritura fue por la RPC atómica; false si se degradó al camino antiguo. */
    atomic: boolean;
    error?: string;
    /** true si falta la tabla `user_settings` (la UI lo explica al usuario). */
    missingTable?: boolean;
}

/** ¿El error dice que la RPC no existe? (base sin la migración de la Adenda 69). */
function isMissingRpc(message: string, code?: string): boolean {
    if (code === "PGRST202" || code === "42883") return true;
    return /could not find the function|function .*merge_user_prefs.* does not exist|schema cache/i.test(message);
}

function isMissingTable(message: string): boolean {
    return /relation .*user_settings.* does not exist/i.test(message);
}

let warnedFallback = false;

/**
 * Mezcla `patch` dentro de `user_settings.prefs` SIN pisar las claves de nadie.
 * Es la única forma correcta de escribir en esa columna. Nunca lanza.
 *
 * @param patch  Claves de primer nivel a fusionar (`null` borra la clave).
 * @param opts.client  Cliente Supabase alternativo (p. ej. el Supabase propio
 *                     del usuario en sync-providers). Por defecto, el del OS.
 * @param opts.userId  Solo se usa en el camino de degradación (la RPC toma
 *                     SIEMPRE `auth.uid()` y no acepta un id ajeno).
 */
export async function mergeUserPrefs(
    patch: PrefsPatch,
    opts?: { client?: MinimalClient; userId?: string },
): Promise<MergePrefsResult> {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return { ok: false, atomic: false, error: "El parche debe ser un objeto." };
    }
    if (Object.keys(patch).length === 0) return { ok: true, atomic: true };

    const sb = opts?.client ?? createClient();

    // ── Camino BUENO: mezcla atómica en el servidor ─────────────────────────
    try {
        const { error } = await sb.rpc("merge_user_prefs", { p_patch: patch });
        if (!error) return { ok: true, atomic: true };

        const msg = error.message ?? String(error);
        if (isMissingTable(msg)) return { ok: false, atomic: false, error: msg, missingTable: true };
        if (!isMissingRpc(msg, (error as { code?: string }).code)) {
            return { ok: false, atomic: false, error: msg };
        }
        // RPC ausente ⇒ seguimos al camino de degradación.
        if (!warnedFallback) {
            warnedFallback = true;
            // eslint-disable-next-line no-console
            console.warn(
                "[StarSeed] Falta la función merge_user_prefs() en la base. Los ajustes se guardan con el método antiguo " +
                    "(leer-mezclar-escribir), que puede perder cambios si dos módulos escriben a la vez. " +
                    "Aplica supabase/migrations/20260714020000_merge_user_prefs_atomic.sql.",
            );
        }
    } catch (e) {
        return { ok: false, atomic: false, error: (e as Error)?.message ?? String(e) };
    }

    // ── Degradación: leer-mezclar-upsert (con la carrera conocida) ──────────
    return legacyMerge(sb, patch, opts?.userId);
}

async function legacyMerge(
    sb: MinimalClient,
    patch: PrefsPatch,
    userId?: string,
): Promise<MergePrefsResult> {
    try {
        let uid = userId;
        if (!uid) {
            const { data } = await sb.auth.getUser();
            uid = data?.user?.id;
        }
        if (!uid) return { ok: false, atomic: false, error: "Sin sesión." };

        let prefs: Record<string, unknown> = {};
        try {
            const { data } = await sb
                .from("user_settings")
                .select("prefs")
                .eq("user_id", uid)
                .maybeSingle();
            if (data?.prefs && typeof data.prefs === "object") {
                prefs = { ...(data.prefs as Record<string, unknown>) };
            }
        } catch {
            /* mezclamos sobre objeto vacío */
        }

        // Mezcla profunda del sub-objeto reservado `__meta` (igual que la RPC).
        const patchMeta = patch.__meta;
        for (const [k, v] of Object.entries(patch)) {
            if (k === "__meta") continue;
            if (v === null) delete prefs[k];
            else prefs[k] = v;
        }
        if (patchMeta && typeof patchMeta === "object") {
            const prev = (prefs.__meta && typeof prefs.__meta === "object" ? prefs.__meta : {}) as Record<string, unknown>;
            prefs.__meta = { ...prev, ...(patchMeta as Record<string, unknown>) };
        }

        const { error } = await sb
            .from("user_settings")
            .upsert(
                { user_id: uid, prefs, updated_at: new Date().toISOString() },
                { onConflict: "user_id" },
            );
        if (error) {
            const msg = error.message ?? String(error);
            return { ok: false, atomic: false, error: msg, missingTable: isMissingTable(msg) };
        }
        return { ok: true, atomic: false };
    } catch (e) {
        return { ok: false, atomic: false, error: (e as Error)?.message ?? String(e) };
    }
}
