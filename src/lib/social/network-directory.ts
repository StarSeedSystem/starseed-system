"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Directorio de PERFILES DE TODA LA RED (os_profiles)
 * ---------------------------------------------------------------------------
 * Capa fina y DEFENSIVA sobre `public.os_profiles` para el Hub de Conexiones:
 * lo que faltaba allí era poder VER y BUSCAR a todas las personas de la red,
 * no solo las sugeridas por afinidad.
 *
 * Qué aporta (y qué NO duplica):
 *   · listNetworkProfiles() — TODOS los perfiles visibles, paginados por
 *     KEYSET (created_at, user_id) descendente: estable ante inserciones
 *     concurrentes y sin el coste de `offset` grande. Si el entorno no tiene
 *     `created_at` (bases antiguas) degrada SOLO a paginación por rango.
 *   · countNetworkProfiles() — total real (COUNT exact con `head`, una única
 *     petición sin traer filas). Devuelve null si no está disponible: la UI
 *     entonces no muestra un número inventado.
 *   · searchNetworkProfiles() — REUTILIZA `searchUsers` de
 *     `@/lib/search/unified-search` (Typesense si el usuario lo tiene listo →
 *     si no, el `ilike` de `os-profiles`), y solo AÑADE lo que esa búsqueda no
 *     cubre hoy: coincidencias en `bio` y en `handle`. Cero duplicación del
 *     motor de búsqueda.
 *   · suggestedProfiles() — envuelve `recommendations()` de `os-profiles`
 *     (etiquetas y grupos en común) para que el Hub tenga UN solo tipo de
 *     perfil en pantalla. No reimplementa la heurística.
 *
 * Filosofía del repo: SSR-safe, nunca lanza, degrada a lista vacía honesta si
 * no hay sesión, tabla, red o columnas. `os-profiles.ts` NO se toca.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import { searchUsers as searchUsersUnified } from "@/lib/search/unified-search";
import { recommendations } from "@/lib/social/os-profiles";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Perfil de la red, normalizado para tarjetas del Hub. */
export interface NetworkProfile {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio: string;
    tags: string[];
    /** ISO íntegro tal cual lo devuelve Postgres (frontera del keyset). */
    createdAt?: string;
}

/** Sugerencia por afinidad (misma forma + el porqué honesto de `recommendations`). */
export interface SuggestedProfile extends NetworkProfile {
    reason: string;
    score: number;
}

/**
 * Cursor de paginación. `mode` recuerda qué estrategia funcionó en la primera
 * página para no volver a intentar la que ya falló en este entorno.
 */
export interface NetworkCursor {
    mode: "keyset" | "range";
    /** Keyset: `created_at` de la última fila entregada (ISO de Postgres). */
    createdAt?: string;
    /** Keyset: `user_id` de la última fila entregada (desempate del keyset). */
    userId?: string;
    /** Rango: nº de filas ya pedidas (solo modo `range`). */
    offset: number;
}

export interface NetworkProfilePage {
    profiles: NetworkProfile[];
    /** Cursor de la SIGUIENTE página, o null si no hay más. */
    cursor: NetworkCursor | null;
    hasMore: boolean;
    /** true si el directorio no está disponible (SSR, sin tabla, sin red). */
    unavailable: boolean;
}

/** Tamaño de página por defecto del directorio (Hub de Conexiones). */
export const NETWORK_PAGE_SIZE = 24;

const EMPTY_PAGE: NetworkProfilePage = { profiles: [], cursor: null, hasMore: false, unavailable: true };

/* ────────────────────────────── Helpers ────────────────────────────────── */

interface ProfileRowLike {
    user_id?: string | null;
    username?: string | null;
    handle?: string | null;
    display_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    about?: string | null;
    tags?: unknown;
    searchable?: boolean | null;
    created_at?: string | null;
}

function isClient(): boolean {
    return typeof window !== "undefined";
}

/** Tolera `tags` como array real (text[]) o como jsonb ya parseado. */
function toTags(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((t): t is string => typeof t === "string");
    return [];
}

/**
 * Fila → NetworkProfile. Devuelve null si la fila no es utilizable (sin id) o
 * si el perfil se marcó como NO buscable (`searchable=false`): la RLS ya filtra
 * por visibilidad, esto respeta además la preferencia explícita del usuario.
 */
function normalizeRow(row: ProfileRowLike): NetworkProfile | null {
    const userId = typeof row.user_id === "string" ? row.user_id : "";
    if (!userId) return null;
    if (row.searchable === false) return null;
    const username = (row.username || row.handle || "").replace(/^@+/, "");
    return {
        userId,
        username: username || userId.slice(0, 8),
        displayName: row.display_name || row.full_name || username || "Ciudadano StarSeed",
        avatarUrl: row.avatar_url || undefined,
        bio: row.bio || row.about || "",
        tags: toTags(row.tags),
        createdAt: row.created_at || undefined,
    };
}

/** Escapa los comodines de `ilike` (`%`, `_`) en texto libre del usuario. */
function escapeLike(q: string): string {
    return q.replace(/[%_]/g, (m) => `\\${m}`);
}

function clampLimit(n: number): number {
    if (!Number.isFinite(n)) return NETWORK_PAGE_SIZE;
    return Math.min(96, Math.max(1, Math.floor(n)));
}

/**
 * Construye la página a partir de las filas crudas (se piden `limit + 1` para
 * saber si hay más SIN un COUNT por página). El cursor se toma de la ÚLTIMA
 * fila VISIBLE **antes** de filtrar en cliente (perfil propio / no buscables):
 * si se tomara después, un filtrado completo dejaría el cursor congelado y
 * "Cargar más" repetiría la misma página para siempre.
 */
function buildPage(
    rows: ProfileRowLike[],
    limit: number,
    mode: NetworkCursor["mode"],
    consumed: number,
    excludeUserId: string | null,
): NetworkProfilePage {
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible[visible.length - 1];
    const profiles = visible
        .map(normalizeRow)
        .filter((p): p is NetworkProfile => !!p && p.userId !== excludeUserId);

    const nextOffset = consumed + visible.length;
    const cursor: NetworkCursor | null = !hasMore
        ? null
        : mode === "keyset"
          ? { mode, createdAt: last?.created_at || undefined, userId: last?.user_id || undefined, offset: nextOffset }
          : { mode, offset: nextOffset };

    // Keyset sin frontera utilizable (fila sin created_at/user_id) → no podemos
    // avanzar con honestidad: cerramos la lista en vez de repetir la página.
    if (cursor && cursor.mode === "keyset" && (!cursor.createdAt || !cursor.userId)) {
        return { profiles, cursor: null, hasMore: false, unavailable: false };
    }
    return { profiles, cursor, hasMore, unavailable: false };
}

/* ───────────────────────── listNetworkProfiles ─────────────────────────── */

export interface ListNetworkProfilesOptions {
    limit?: number;
    /** Cursor devuelto por la llamada anterior (null/omitido = primera página). */
    cursor?: NetworkCursor | null;
    /** Por defecto se excluye al usuario de la sesión (no te "descubres" a ti). */
    includeSelf?: boolean;
}

/**
 * Lista TODOS los perfiles públicos de la red, de más nuevo a más antiguo.
 * Estrategia 1 (keyset por `created_at`,`user_id`) y, si ese entorno no la
 * soporta, estrategia 2 (rango por `updated_at`, y en último término sin orden).
 * Nunca lanza: ante cualquier fallo devuelve una página vacía con
 * `unavailable: true` para que la UI muestre un estado honesto.
 */
export async function listNetworkProfiles(
    opts: ListNetworkProfilesOptions = {},
): Promise<NetworkProfilePage> {
    if (!isClient()) return EMPTY_PAGE;
    const limit = clampLimit(opts.limit ?? NETWORK_PAGE_SIZE);
    const cursor = opts.cursor ?? null;

    let excludeUserId: string | null = null;
    if (!opts.includeSelf) {
        try {
            excludeUserId = await getCurrentUserId();
        } catch {
            excludeUserId = null;
        }
    }

    let supabase: ReturnType<typeof createClient>;
    try {
        supabase = createClient();
    } catch {
        return EMPTY_PAGE;
    }

    // ── 1) Keyset (created_at desc, user_id desc) ──
    if (!cursor || cursor.mode === "keyset") {
        try {
            const base = supabase.from("os_profiles").select("*");
            const bounded =
                cursor?.createdAt && cursor.userId
                    ? base.or(
                          `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",user_id.lt.${cursor.userId})`,
                      )
                    : base;
            const { data, error } = await bounded
                .order("created_at", { ascending: false })
                .order("user_id", { ascending: false })
                .limit(limit + 1);
            if (!error && Array.isArray(data)) {
                return buildPage(data as ProfileRowLike[], limit, "keyset", cursor?.offset ?? 0, excludeUserId);
            }
        } catch {
            /* entorno sin created_at o fallo puntual → rango */
        }
        // Si ya íbamos por keyset con cursor y ha fallado, no podemos traducir la
        // frontera a un offset fiable: cerramos la lista sin romper.
        if (cursor) return { profiles: [], cursor: null, hasMore: false, unavailable: false };
    }

    // ── 2) Rango (fallback): `updated_at` desc y, si tampoco existe, sin orden ──
    const offset = cursor?.offset ?? 0;
    for (const orderCol of ["updated_at", null] as const) {
        try {
            const base = supabase.from("os_profiles").select("*");
            const ordered = orderCol ? base.order(orderCol, { ascending: false }) : base;
            const { data, error } = await ordered.range(offset, offset + limit);
            if (!error && Array.isArray(data)) {
                return buildPage(data as ProfileRowLike[], limit, "range", offset, excludeUserId);
            }
        } catch {
            /* siguiente estrategia */
        }
    }

    return EMPTY_PAGE;
}

/* ───────────────────────── countNetworkProfiles ────────────────────────── */

/**
 * Total de perfiles VISIBLES para quien consulta (la RLS decide). Una sola
 * petición `head` (sin cuerpo, sin filas). null si no se puede saber — la UI
 * omite el dato en vez de inventarlo.
 *
 * Ojo: es el total de la RED tal cual (incluye tu propio perfil, que el listado
 * no muestra). Por eso la UI enseña "N personas · M en la red" y no una resta
 * que fingiría una precisión que no tenemos.
 */
export async function countNetworkProfiles(): Promise<number | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { count, error } = await supabase
            .from("os_profiles")
            .select("user_id", { count: "exact", head: true });
        if (error || typeof count !== "number") return null;
        return count;
    } catch {
        return null;
    }
}

/* ───────────────────────── searchNetworkProfiles ───────────────────────── */

/** Búsqueda complementaria por `bio` / `handle` (lo que `searchUsers` no cubre). */
async function searchByBioOrHandle(term: string, limit: number): Promise<ProfileRowLike[]> {
    const like = `%${escapeLike(term)}%`;
    let supabase: ReturnType<typeof createClient>;
    try {
        supabase = createClient();
    } catch {
        return [];
    }
    // Dos consultas simples e independientes en vez de un `or(...)` compuesto:
    // el texto del usuario NUNCA entra en la gramática de filtros de PostgREST
    // (una coma o comilla en la búsqueda rompería la expresión), y si una
    // columna no existe en este entorno la otra sigue funcionando.
    const [bio, handle] = await Promise.all([
        (async () => {
            try {
                const { data } = await supabase.from("os_profiles").select("*").ilike("bio", like).limit(limit);
                return Array.isArray(data) ? (data as ProfileRowLike[]) : [];
            } catch {
                return [];
            }
        })(),
        (async () => {
            try {
                const { data } = await supabase.from("os_profiles").select("*").ilike("handle", like).limit(limit);
                return Array.isArray(data) ? (data as ProfileRowLike[]) : [];
            } catch {
                return [];
            }
        })(),
    ]);
    return [...bio, ...handle];
}

/**
 * Busca personas en TODA la red por nombre, handle/username o bio.
 * Orden: primero lo que devuelve el motor unificado (relevancia de Typesense
 * cuando está configurado; si no, `ilike` de Supabase), después las
 * coincidencias solo-por-bio/handle. Deduplica por `user_id` y excluye al
 * usuario de la sesión. Nunca lanza.
 */
export async function searchNetworkProfiles(q: string, limit = NETWORK_PAGE_SIZE): Promise<NetworkProfile[]> {
    const term = (q ?? "").trim();
    if (!isClient() || term.length < 1) return [];
    const max = clampLimit(limit);

    let me: string | null = null;
    try {
        me = await getCurrentUserId();
    } catch {
        me = null;
    }

    const [engineHits, extraRows] = await Promise.all([
        (async () => {
            try {
                return await searchUsersUnified(term, max);
            } catch {
                return [];
            }
        })(),
        searchByBioOrHandle(term, max),
    ]);

    const out: NetworkProfile[] = [];
    const seen = new Set<string>();
    for (const p of engineHits) {
        if (!p?.userId || seen.has(p.userId) || p.userId === me) continue;
        seen.add(p.userId);
        out.push({
            userId: p.userId,
            username: (p.username || "").replace(/^@+/, "") || p.userId.slice(0, 8),
            displayName: p.displayName || p.username || "Ciudadano StarSeed",
            avatarUrl: p.avatarUrl,
            bio: p.bio || "",
            tags: toTags(p.tags),
        });
    }
    for (const row of extraRows) {
        const p = normalizeRow(row);
        if (!p || seen.has(p.userId) || p.userId === me) continue;
        seen.add(p.userId);
        out.push(p);
    }
    return out.slice(0, max);
}

/* ─────────────────────────── suggestedProfiles ─────────────────────────── */

/**
 * Sugerencias por afinidad — envoltorio de `recommendations()` (etiquetas y
 * grupos en común). Sin sesión o sin señales propias devuelve [] (la UI lo
 * explica, no rellena con perfiles al azar). Nunca lanza.
 */
export async function suggestedProfiles(limit = 12): Promise<SuggestedProfile[]> {
    if (!isClient()) return [];
    try {
        const recs = await recommendations(clampLimit(limit));
        return recs.map((r) => ({
            userId: r.userId,
            username: (r.username || "").replace(/^@+/, "") || r.userId.slice(0, 8),
            displayName: r.displayName || r.username || "Ciudadano StarSeed",
            avatarUrl: r.avatarUrl,
            bio: r.bio || "",
            tags: toTags(r.tags),
            reason: r.reason,
            score: r.score,
        }));
    } catch {
        return [];
    }
}
