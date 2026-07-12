"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed Widget Data — Capa de DATOS REALES en vivo (os-live)
// ----------------------------------------------------------------
// Hooks de datos REALES, con alcance al usuario / RLS, que alimentan
// los widgets del Dashboard del SOSD. NO hay datos simulados aquí: cada
// hook consulta Supabase con el cliente de navegador (`@/utils/supabase/
// client`) y se MANTIENE EN VIVO vía `useRealtimeRows` (postgres_changes).
//
// Filosofía:
//   • Lo que existe → datos reales del usuario (páginas/grupos/eventos/
//     publicaciones de las tablas os_* del proyecto unificado).
//   • Lo que aún no tiene tabla en este proyecto (mensajes, memorias,
//     cerebros, baúles, documentos…) → consulta real que degrada en
//     silencio a lista vacía → el widget muestra un estado vacío limpio
//     en español con una llamada a la acción. Nunca se inyectan datos
//     falsos: en cuanto la tabla exista y tenga filas, el widget se
//     enciende solo (la consulta y el realtime ya están cableados).
//
// SSR-safe: `useRealtimeRows` y `createClient` sólo tocan red en cliente.
// Todas las cargas son tolerantes a fallos (try/catch → []).
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
    useRealtimeRows,
    type UseRealtimeRowsResult,
} from "@/lib/realtime/realtime";

// ───────────────────────────── Identidad ─────────────────────────

/**
 * Resuelve el `uid` del usuario autenticado (o `null`). Reactivo a
 * cambios de sesión (onAuthStateChange). SSR-safe.
 */
export function useCurrentUid(): { uid: string | null; ready: boolean } {
    const [uid, setUid] = useState<string | null>(null);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        let active = true;
        const supabase = createClient();

        (async () => {
            try {
                const { data } = await supabase.auth.getUser();
                if (active) {
                    setUid(data?.user?.id ?? null);
                    setReady(true);
                }
            } catch {
                if (active) {
                    setUid(null);
                    setReady(true);
                }
            }
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
            if (active) setUid(session?.user?.id ?? null);
        });

        return () => {
            active = false;
            try {
                sub.subscription.unsubscribe();
            } catch {
                /* noop */
            }
        };
    }, []);

    return { uid, ready };
}

// ───────────────────────── Tipos de filas ────────────────────────

export interface OsPageRow {
    id: string;
    slug: string;
    name: string;
    kind: string | null;
    description: string | null;
    tags: string[] | null;
    accent: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    member_count: number | null;
    owner_id: string | null;
    created_at: string | null;
}

export interface OsGroupRow {
    id: string;
    slug: string;
    name: string;
    kind: string | null;
    description: string | null;
    tags: string[] | null;
    accent: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    member_count: number | null;
    owner_id: string | null;
    created_at: string | null;
}

export interface OsEventRow {
    id: string;
    slug: string;
    title: string;
    kind: string | null;
    description: string | null;
    starts_at: string | null;
    location: string | null;
    organizer_slug: string | null;
    tags: string[] | null;
    cover_url: string | null;
    attendee_count: number | null;
    owner_id: string | null;
    created_at: string | null;
}

export interface OsPostRow {
    id: string;
    author_id: string | null;
    author_name: string | null;
    entity_type: string | null;
    entity_slug: string | null;
    body: string | null;
    media_url: string | null;
    created_at: string | null;
}

export interface OsMembershipRow {
    user_id: string;
    group_slug: string;
    role: string | null;
    created_at: string | null;
}

// ───────────────────────── Helpers de carga ──────────────────────

const DEFAULT_ACCENT = "#7FB8FF";

/** Carga tolerante: ejecuta una query y devuelve [] ante cualquier fallo. */
async function safeRows<T>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    if (typeof window === "undefined") return [];
    try {
        const { data, error } = await run();
        if (error || !Array.isArray(data)) return [];
        return data;
    } catch {
        return [];
    }
}

// ───────────────────── Páginas reales (os_pages) ─────────────────
//
// Públicas (legibles por RLS), en vivo. Para "mis páginas" filtra por
// owner localmente cuando hay sesión (la consulta trae el catálogo
// legible y el widget decide qué resaltar).

export function useLivePages(): UseRealtimeRowsResult<OsPageRow> {
    return useRealtimeRows<OsPageRow>(
        "os_pages",
        () =>
            safeRows<OsPageRow>(() =>
                createClient()
                    .from("os_pages")
                    .select("*")
                    .order("member_count", { ascending: false })
                    .limit(40),
            ),
        { idKey: "id" },
    );
}

// ───────────────────── Grupos reales (os_groups) ────────────────

export function useLiveGroups(): UseRealtimeRowsResult<OsGroupRow> {
    return useRealtimeRows<OsGroupRow>(
        "os_groups",
        () =>
            safeRows<OsGroupRow>(() =>
                createClient()
                    .from("os_groups")
                    .select("*")
                    .order("member_count", { ascending: false })
                    .limit(40),
            ),
        { idKey: "id" },
    );
}

/** Membresías del usuario actual (os_memberships), en vivo. */
export function useMyMemberships(uid: string | null): UseRealtimeRowsResult<OsMembershipRow> {
    return useRealtimeRows<OsMembershipRow>(
        "os_memberships",
        () => {
            if (!uid) return Promise.resolve([]);
            return safeRows<OsMembershipRow>(() =>
                createClient()
                    .from("os_memberships")
                    .select("*")
                    .eq("user_id", uid),
            );
        },
        { idKey: "group_slug", filter: uid ? `user_id=eq.${uid}` : undefined },
    );
}

// ───────────────────── Eventos reales (os_events) ───────────────
//
// Próximos eventos (starts_at >= ahora) ordenados ascendentemente, en
// vivo. Si no hay próximos, el widget puede mostrar los más recientes.

export function useLiveEvents(): UseRealtimeRowsResult<OsEventRow> {
    return useRealtimeRows<OsEventRow>(
        "os_events",
        () =>
            safeRows<OsEventRow>(() =>
                createClient()
                    .from("os_events")
                    .select("*")
                    .order("starts_at", { ascending: true })
                    .limit(40),
            ),
        { idKey: "id" },
    );
}

// ─────────────── Publicaciones recientes (os_posts) ─────────────
//
// Corriente de actividad real de la red, en vivo. Sirve a "Actividad
// Reciente" y a cualquier widget que muestre el pulso social.

export function useLivePosts(limit = 24): UseRealtimeRowsResult<OsPostRow> {
    return useRealtimeRows<OsPostRow>(
        "os_posts",
        () =>
            safeRows<OsPostRow>(() =>
                createClient()
                    .from("os_posts")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(limit),
            ),
        { idKey: "id" },
    );
}

// ════════════════════════════════════════════════════════════════
// Tablas con alcance al PROPIETARIO (owner = auth.uid()).
// ----------------------------------------------------------------
// Mensajes, memorias, cerebros, baúles, documentos, notificaciones…
// Estas tablas pertenecen al usuario (columna `owner`/`user_id`). En el
// proyecto unificado actual puede que aún no existan; la consulta
// degrada a [] y el widget muestra su estado vacío. En cuanto la tabla
// exista, el hook devuelve filas reales y el realtime las mantiene vivas.
// ════════════════════════════════════════════════════════════════

export interface OwnerLiveOptions {
    /** Nombre de la columna de propiedad (por defecto `owner`). */
    ownerKey?: string;
    /** Clave identificadora de fila (por defecto `id`). */
    idKey?: string;
    /** Columna por la que ordenar (desc) — por defecto `updated_at`. */
    orderBy?: string;
    /** Orden ascendente (por defecto false → desc). */
    ascending?: boolean;
    /** Límite de filas. */
    limit?: number;
    /** Columnas a seleccionar (por defecto "*"). */
    select?: string;
}

export interface OwnerLiveResult<T> {
    rows: T[];
    loading: boolean;
    /** true mientras se resuelve la sesión. */
    authPending: boolean;
    /** true si NO hay sesión (el widget debe invitar a entrar). */
    needsAuth: boolean;
    reload: () => Promise<void>;
}

/**
 * Hook genérico para una tabla con alcance al propietario, EN VIVO.
 * Resuelve la sesión, consulta `where owner = uid` y se suscribe a
 * postgres_changes filtrando por el propietario. Tolerante: cualquier
 * fallo (incluida "tabla inexistente") → filas vacías, sin romper.
 */
export function useOwnerRows<T = Record<string, unknown>>(
    table: string,
    opts: OwnerLiveOptions = {},
): OwnerLiveResult<T> {
    const ownerKey = opts.ownerKey ?? "owner";
    const idKey = opts.idKey ?? "id";
    const orderBy = opts.orderBy ?? "updated_at";
    const ascending = opts.ascending ?? false;
    const limit = opts.limit ?? 30;
    const select = opts.select ?? "*";

    const { uid, ready } = useCurrentUid();

    const result = useRealtimeRows<T>(
        table,
        () => {
            if (!uid) return Promise.resolve([]);
            return safeRows<T>(() => {
                let q = createClient().from(table).select(select).eq(ownerKey, uid);
                // El orden puede fallar si la columna no existe en una tabla
                // hipotética; lo aplicamos con tolerancia.
                try {
                    q = q.order(orderBy, { ascending });
                } catch {
                    /* sin orden si la columna no existe */
                }
                // El builder de PostgREST no puede inferir la fila de una tabla
                // cuyo nombre llega en runtime (queda como GenericStringError):
                // la reafirmamos a `T`, que es el contrato de `useOwnerRows<T>`.
                return q.limit(limit) as unknown as PromiseLike<{
                    data: T[] | null;
                    error: unknown;
                }>;
            });
        },
        { idKey, filter: uid ? `${ownerKey}=eq.${uid}` : undefined },
    );

    return {
        rows: result.rows,
        loading: result.loading,
        authPending: !ready,
        needsAuth: ready && !uid,
        reload: result.reload,
    };
}

// ───────────────────── Atajos por dominio ───────────────────────
//
// Azúcar tipado sobre useOwnerRows para cada área. Las tablas y sus
// columnas siguen el esquema del proyecto StarSeed (owner-scoped).

export interface BrainRow {
    id: string;
    owner: string | null;
    name: string | null;
    scope: string | null;
    scope_ref: string | null;
    description: string | null;
    config: Record<string, unknown> | null;
    includes: Record<string, unknown> | null;
    servers: unknown[] | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface VaultRow {
    id: string;
    owner: string | null;
    name: string | null;
    scope: string | null;
    scope_ref: string | null;
    connections: unknown[] | null;
    preferences: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface MemoryRow {
    id: string;
    owner: string | null;
    scope: string | null;
    scope_ref: string | null;
    name: string | null;
    kinds: string[] | null;
    format: string | null;
    storage: string[] | null;
    sync: boolean | null;
    config: Record<string, unknown> | null;
    content: string | null;
    vault_id: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface ConversationRow {
    id: string;
    owner: string | null;
    title: string | null;
    kind: string | null;
    members: unknown[] | null;
    folder: string | null;
    updated_at: string | null;
    created_at: string | null;
}

export interface DocumentRow {
    account_id: string | null;
    name: string | null;
    content: string | null;
    meta: Record<string, unknown> | null;
    updated_at: string | null;
}

export interface NotificationRow {
    id: string;
    user_id: string | null;
    kind: string | null;
    title: string | null;
    body: string | null;
    link: string | null;
    seen: boolean | null;
    created_at: string | null;
}

export function useMyBrains() {
    return useOwnerRows<BrainRow>("brains", { ownerKey: "owner", orderBy: "updated_at", limit: 20 });
}

export function useMyVaults() {
    return useOwnerRows<VaultRow>("vaults", { ownerKey: "owner", orderBy: "updated_at", limit: 20 });
}

export function useMyMemories() {
    return useOwnerRows<MemoryRow>("memories", { ownerKey: "owner", orderBy: "updated_at", limit: 24 });
}

export function useMyConversations() {
    return useOwnerRows<ConversationRow>("conversations", { ownerKey: "owner", orderBy: "updated_at", limit: 24 });
}

export function useMyDocuments() {
    return useOwnerRows<DocumentRow>("documents", {
        ownerKey: "account_id",
        idKey: "name",
        orderBy: "updated_at",
        limit: 24,
    });
}

export function useMyNotifications() {
    return useOwnerRows<NotificationRow>("notifications", {
        ownerKey: "user_id",
        orderBy: "created_at",
        limit: 30,
    });
}

// ───────────────────────── Utilidades UI ────────────────────────

/** Acento seguro a partir de una fila (o el acento por defecto). */
export function rowAccent(accent: string | null | undefined): string {
    return accent || DEFAULT_ACCENT;
}

/** Convierte un ISO a epoch ms (o 0 si nulo/incorrecto). */
export function tsOf(iso: string | null | undefined): number {
    if (!iso) return 0;
    const n = Date.parse(iso);
    return Number.isNaN(n) ? 0 : n;
}

/** ¿El evento (ISO) es futuro respecto a ahora? */
export function isUpcoming(iso: string | null | undefined): boolean {
    const t = tsOf(iso);
    return t > 0 && t >= Date.now();
}
