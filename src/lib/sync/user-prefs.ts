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
 *
 * SIN CAMBIOS, SIN PETICIÓN (contrato «consumo», 2026-09-29): 1.112 llamadas a
 * `merge_user_prefs` en 4 h, casi todas con el MISMO valor que ya tenía la cuenta (copias de
 * seguridad periódicas, re-subidas de otras pestañas). Se guarda la huella de lo que la cuenta
 * tiene en cada clave (lo último que subimos o que vimos llegar por realtime/lectura) y se
 * omite toda clave cuyo valor no cambió; si no queda ninguna, no hay petición. La huella vale
 * 30 min: pasado ese tiempo, una escritura idéntica vuelve a salir (acota el caso raro de un
 * cambio remoto que esta pestaña no llegó a ver).
 */

import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";

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
    /** true si no hubo petición porque la cuenta ya tenía exactamente esos valores. */
    sinCambios?: boolean;
}

/* ── Huellas del estado de la cuenta por clave ──────────────────────────────── */

/** Una huella de clave deja de valer pasado este tiempo. */
export const HUELLA_VIGENCIA_MS = 30 * 60_000;
const huellas = new Map<string, { h: string; en: number }>();

/** JSON con las claves de objeto ORDENADAS (jsonb reordena: la huella no debe depender del orden). */
function estable(v: unknown): string {
    if (v === undefined) return "null";
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${estable(o[k])}`)
        .join(",")}}`;
}

/** Huella corta y estable de un valor (FNV-1a de 32 bits + longitud). */
export function huellaValor(v: unknown): string {
    const texto = estable(v);
    let h = 0x811c9dc5;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `${h.toString(16)}:${texto.length}`;
}

/**
 * Anota lo que la CUENTA tiene ahora (fila leída, cambio recibido por realtime o broadcast):
 * a partir de aquí, subir ese mismo valor no genera petición. `__meta` no se anota.
 */
export function recordarPrefsServidor(prefs: Record<string, unknown> | null | undefined): void {
    if (!prefs || typeof prefs !== "object") return;
    const en = Date.now();
    for (const [k, v] of Object.entries(prefs)) {
        if (k === "__meta") continue;
        huellas.set(k, { h: huellaValor(v), en });
    }
}

/** Olvida todas las huellas (cambio de cuenta o cierre de sesión). */
export function olvidarHuellasPrefs(): void {
    huellas.clear();
}

/** ¿La cuenta ya tiene exactamente este valor en esta clave (según una huella vigente)? */
function yaEnLaCuenta(k: string, v: unknown, ahora: number): boolean {
    const prev = huellas.get(k);
    return !!prev && ahora - prev.en < HUELLA_VIGENCIA_MS && prev.h === huellaValor(v);
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

    // Solo con el cliente del OS: un Supabase propio del usuario es otra cuenta, otras huellas.
    const conHuellas = !opts?.client;
    if (conHuellas) {
        const ahora = Date.now();
        const claves = Object.keys(patch).filter((k) => k !== "__meta");
        const cambiadas = claves.filter((k) => !yaEnLaCuenta(k, patch[k], ahora));
        if (claves.length > 0 && cambiadas.length === 0) return { ok: true, atomic: true, sinCambios: true };
        if (cambiadas.length < claves.length) {
            // Fuera las claves sin cambios, y su marca LWW con ellas (no marcar lo que no se sube).
            const omitidas = new Set(claves.filter((k) => !cambiadas.includes(k)));
            const reducido: PrefsPatch = {};
            for (const k of cambiadas) reducido[k] = patch[k];
            const meta = patch.__meta;
            if (meta && typeof meta === "object" && !Array.isArray(meta)) {
                const m: Record<string, unknown> = {};
                for (const [mk, mv] of Object.entries(meta as Record<string, unknown>)) {
                    if (!omitidas.has(mk)) m[mk] = mv;
                }
                if (Object.keys(m).length > 0) reducido.__meta = m;
            }
            patch = reducido;
        }
    }
    const anotar = (res: MergePrefsResult): MergePrefsResult => {
        if (res.ok && conHuellas) recordarPrefsServidor(patch);
        return res;
    };

    const sb = opts?.client ?? createClient();

    // ── Camino BUENO: mezcla atómica en el servidor ─────────────────────────
    try {
        const { error } = await sb.rpc("merge_user_prefs", { p_patch: patch });
        if (!error) return anotar({ ok: true, atomic: true });

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
    return anotar(await legacyMerge(sb, patch, opts?.userId, conHuellas));
}

async function legacyMerge(
    sb: MinimalClient,
    patch: PrefsPatch,
    userId?: string,
    clienteDelOS = true,
): Promise<MergePrefsResult> {
    try {
        let uid = userId;
        if (!uid && clienteDelOS) uid = (await uidActual()) ?? undefined; // sin red
        if (!uid && !clienteDelOS) {
            const { data } = await sb.auth.getUser(); // Supabase propio del usuario: su sesión
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
