// src/hooks/use-os-entities.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hooks de React (patrón useState + useEffect, sin react-query) que conectan las
// entidades sociales de StarSeed OS con Supabase (tablas os_*), con FALLBACK
// elegante a los datos de ejemplo (@/data/sample-entities, sample-events) cuando:
//   · Supabase falla o no está configurado.
//   · La consulta devuelve vacío.
//   · No hay sesión (las lecturas siguen funcionando por RLS anónimo).
//
// Las acciones (seguir / unirse / asistir / publicar) escriben en Supabase si hay
// sesión; si no, devuelven `needsAuth: true` para que la UI invite a iniciar sesión.
//
// SSR-safe: todo acceso a Supabase ocurre dentro de useEffect / handlers.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
    fetchPages,
    fetchGroups,
    fetchEvents,
    fetchPageBySlug,
    fetchGroupBySlug,
    fetchEventBySlug,
    fetchPosts,
    mergePages,
    mergeGroups,
    mergeEvents,
    samplePagesAsOs,
    sampleGroupsAsOs,
    sampleEventsAsOs,
    findSamplePageBySlug,
    findSampleGroupBySlug,
    findSampleEventBySlug,
    isFollowing,
    setFollow,
    isMember,
    setMembership,
    getAttendance,
    setAttendance,
    createPost,
    getCurrentUserId,
    createPage,
    createGroup,
    createEvent,
    updatePage,
    updateGroup,
    updateEvent,
    deleteEntity,
    isEntityOwner,
    fetchMyEntities,
    fetchLikes,
    toggleLike,
    fetchComments,
    addComment,
    deleteComment,
    type OsComment,
    type OsPage,
    type OsGroup,
    type OsEvent,
    type OsPost,
    type OsEntityType,
    type MutationResult,
    type EntityMutationResult,
    type CreatePageInput,
    type CreateGroupInput,
    type CreateEventInput,
    type UpdatePageInput,
    type UpdateGroupInput,
    type UpdateEventInput,
} from "@/lib/os-social";
// Señal en vivo por BROADCAST (no depende de la publicación `supabase_realtime`).
import {
    changeKey,
    entityFeedTopic,
    onChange as onLiveChange,
    shouldProcessChange,
} from "@/lib/sync/live-signal";
import {
    detectMedia,
    splitBodyAttachments,
    type NormalizedPost,
} from "@/lib/social-posts";

// ── Estado de lista genérico ──
interface ListState<T> {
    data: T[];
    loading: boolean;
    error: string | null;
    /** true si los datos mostrados provienen (al menos en parte) de ejemplo. */
    usingFallback: boolean;
    refetch: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAS: páginas / grupos / eventos
// ─────────────────────────────────────────────────────────────────────────────

export function useOsPages(): ListState<OsPage> {
    const [data, setData] = useState<OsPage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingFallback, setUsingFallback] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const real = await fetchPages();
            if (!mounted.current) return;
            if (real.length === 0) {
                setData(samplePagesAsOs());
                setUsingFallback(true);
            } else {
                setData(mergePages(real));
                setUsingFallback(false);
            }
            setError(null);
        } catch (e: any) {
            if (!mounted.current) return;
            setData(samplePagesAsOs());
            setUsingFallback(true);
            setError(e?.message || "error");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, loading, error, usingFallback, refetch: load };
}

export function useOsGroups(): ListState<OsGroup> {
    const [data, setData] = useState<OsGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingFallback, setUsingFallback] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const real = await fetchGroups();
            if (!mounted.current) return;
            if (real.length === 0) {
                setData(sampleGroupsAsOs());
                setUsingFallback(true);
            } else {
                setData(mergeGroups(real));
                setUsingFallback(false);
            }
            setError(null);
        } catch (e: any) {
            if (!mounted.current) return;
            setData(sampleGroupsAsOs());
            setUsingFallback(true);
            setError(e?.message || "error");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, loading, error, usingFallback, refetch: load };
}

export function useOsEvents(): ListState<OsEvent> {
    const [data, setData] = useState<OsEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingFallback, setUsingFallback] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const real = await fetchEvents();
            if (!mounted.current) return;
            if (real.length === 0) {
                setData(sampleEventsAsOs());
                setUsingFallback(true);
            } else {
                setData(mergeEvents(real));
                setUsingFallback(false);
            }
            setError(null);
        } catch (e: any) {
            if (!mounted.current) return;
            setData(sampleEventsAsOs());
            setUsingFallback(true);
            setError(e?.message || "error");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, loading, error, usingFallback, refetch: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE: una entidad por (slug, tipo)
// ─────────────────────────────────────────────────────────────────────────────

type EntityKind = "page" | "group" | "event";

interface EntityState<T> {
    data: T | null;
    loading: boolean;
    usingFallback: boolean;
    error: string | null;
    refetch: () => void;
}

export function useOsEntity(
    slug: string,
    type: "page",
): EntityState<OsPage>;
export function useOsEntity(
    slug: string,
    type: "group",
): EntityState<OsGroup>;
export function useOsEntity(
    slug: string,
    type: "event",
): EntityState<OsEvent>;
export function useOsEntity(
    slug: string,
    type: EntityKind,
): EntityState<OsPage | OsGroup | OsEvent> {
    const [data, setData] = useState<OsPage | OsGroup | OsEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        const sampleFallback = (): OsPage | OsGroup | OsEvent | null => {
            if (type === "page") return findSamplePageBySlug(slug) ?? null;
            if (type === "group") return findSampleGroupBySlug(slug) ?? null;
            return findSampleEventBySlug(slug) ?? null;
        };

        try {
            let real: OsPage | OsGroup | OsEvent | null = null;
            if (type === "page") real = await fetchPageBySlug(slug);
            else if (type === "group") real = await fetchGroupBySlug(slug);
            else real = await fetchEventBySlug(slug);

            if (!mounted.current) return;
            if (real) {
                setData(real);
                setUsingFallback(false);
            } else {
                setData(sampleFallback());
                setUsingFallback(true);
            }
            setError(null);
        } catch (e: any) {
            if (!mounted.current) return;
            setData(sampleFallback());
            setUsingFallback(true);
            setError(e?.message || "error");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [slug, type]);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        
        let unsub = () => {};
        try {
            const { syncManager } = require("@/lib/sync/sync-manager");
            const table = type === "page" ? "os_pages" : type === "group" ? "os_groups" : "os_events";
            unsub = syncManager.subscribe(table, "slug", slug, () => {
                load();
            });
        } catch {
            /* noop */
        }

        return () => {
            mounted.current = false;
            unsub();
        };
    }, [load, type, slug]);

    return { data, loading, usingFallback, error, refetch: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICACIONES de una entidad (lectura + realtime + crear)
// ─────────────────────────────────────────────────────────────────────────────

/** Convierte una fila OsPost al shape de UI NormalizedPost (con detección de media). */
function osPostToNormalized(p: OsPost): NormalizedPost {
    // Adenda 63 §8 · Adjuntos visibles: separa el bloque "**Adjuntos:**" y la
    // metadata ss:meta que /publish embebe en el body (miniaturas/chips en la
    // tarjeta en lugar de markdown crudo; el tipo especializado → badge).
    const split = splitBodyAttachments(p.body);
    const body = p.mediaUrl ? `${split.body}\n${p.mediaUrl}` : split.body;
    return {
        id: p.id,
        authorName: p.authorName,
        body: split.body,
        kind: split.meta?.tipo || "post",
        createdAt: p.createdAt,
        likes: 0,
        commentsCount: 0,
        media: detectMedia({ body, recipe: p.mediaUrl ? { media: [p.mediaUrl] } : null }),
        attachments: split.attachments.length > 0 ? split.attachments : undefined,
    };
}

interface PostsState {
    posts: NormalizedPost[];
    loading: boolean;
    usingFallback: boolean;
    needsAuth: boolean;
    error: string | null;
    refetch: () => void;
    /** Publica en Supabase (si hay sesión). Devuelve needsAuth si no la hay. */
    publish: (body: string, mediaUrl?: string, authorName?: string) => Promise<MutationResult>;
}

export function useOsPosts(
    entityType: OsEntityType,
    slug: string,
    realtime = true,
): PostsState {
    const [posts, setPosts] = useState<NormalizedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [usingFallback, setUsingFallback] = useState(false);
    const [needsAuth, setNeedsAuth] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const real = await fetchPosts(entityType, slug);
            if (!mounted.current) return;
            setPosts(real.map(osPostToNormalized));
            setUsingFallback(false);
            setError(null);
        } catch (e: any) {
            if (!mounted.current) return;
            setPosts([]);
            setUsingFallback(true);
            setError(e?.message || "error");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [entityType, slug]);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        getCurrentUserId().then((uid) => {
            if (mounted.current) setNeedsAuth(!uid);
        });

        // TIEMPO REAL (Adenda 63 §4 · "Sync sin DDL: broadcast primero").
        // Dos caminos redundantes, deduplicados con la MISMA clave:
        //   (a) BROADCAST — SIEMPRE funciona (no exige que `os_posts` esté en la
        //       publicación `supabase_realtime`). El canal de entidad hace que
        //       lleguen también las publicaciones de OTRAS cuentas.
        //   (b) postgres_changes vía syncManager — solo con la migración aplicada.
        let unsubLive = () => {};
        let unsubPg = () => {};
        if (realtime) {
            const topic = entityFeedTopic(entityType, slug);
            try {
                unsubLive = onLiveChange(topic, () => load(), { entity: { kind: entityType, id: slug } });
            } catch {
                /* broadcast no disponible */
            }
            try {
                const { syncManager } = require("@/lib/sync/sync-manager");
                // The os_posts table has a composite filter logically (entity_type and entity_slug)
                // However, SyncManager currently supports single column filters by default in subscribe.
                // We'll subscribe to the table generally or by entity_slug, but since the slug is unique enough, we can filter by entity_slug.
                unsubPg = syncManager.subscribe(
                    "os_posts",
                    "entity_slug",
                    slug,
                    (payload: { record?: { id?: string | null; created_at?: string | null } | null }) => {
                        const row = payload?.record ?? null;
                        // Si este mismo cambio ya entró por broadcast, no recargamos dos veces.
                        if (!shouldProcessChange(changeKey(topic, row?.id, row?.created_at))) return;
                        load();
                    },
                );
            } catch {
                /* realtime no disponible */
            }
        }

        return () => {
            mounted.current = false;
            unsubLive();
            unsubPg();
        };
    }, [load, entityType, slug, realtime]);

    const publish = useCallback(
        async (body: string, mediaUrl?: string, authorName?: string): Promise<MutationResult> => {
            const res = await createPost({ entityType, entitySlug: slug, body, mediaUrl, authorName });
            if (res.needsAuth) setNeedsAuth(true);
            if (res.ok) load(); // refresco inmediato (realtime también lo cubriría)
            return res;
        },
        [entityType, slug, load],
    );

    return { posts, loading, usingFallback, needsAuth, error, refetch: load, publish };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCIONES: seguir / unirse / asistir (estado real persistido en Supabase)
// ─────────────────────────────────────────────────────────────────────────────

interface ToggleState {
    active: boolean;
    loading: boolean;
    needsAuth: boolean;
    /** Alterna el estado. Devuelve needsAuth si no hay sesión. */
    toggle: () => Promise<MutationResult>;
}

export function useFollow(pageSlug: string): ToggleState {
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        (async () => {
            const uid = await getCurrentUserId();
            if (!mounted.current) return;
            setNeedsAuth(!uid);
            if (uid) {
                const following = await isFollowing(pageSlug);
                if (mounted.current) setActive(following);
            }
            if (mounted.current) setLoading(false);
        })();
        return () => {
            mounted.current = false;
        };
    }, [pageSlug]);

    const toggle = useCallback(async (): Promise<MutationResult> => {
        const next = !active;
        const res = await setFollow(pageSlug, next);
        if (res.needsAuth) {
            setNeedsAuth(true);
        } else if (res.ok) {
            setActive(next);
            setNeedsAuth(false);
        }
        return res;
    }, [active, pageSlug]);

    return { active, loading, needsAuth, toggle };
}

export function useMembership(groupSlug: string, role = "miembro"): ToggleState {
    const [active, setActive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        (async () => {
            const uid = await getCurrentUserId();
            if (!mounted.current) return;
            setNeedsAuth(!uid);
            if (uid) {
                const member = await isMember(groupSlug);
                if (mounted.current) setActive(member);
            }
            if (mounted.current) setLoading(false);
        })();
        return () => {
            mounted.current = false;
        };
    }, [groupSlug]);

    const toggle = useCallback(async (): Promise<MutationResult> => {
        const next = !active;
        const res = await setMembership(groupSlug, next, role);
        if (res.needsAuth) {
            setNeedsAuth(true);
        } else if (res.ok) {
            setActive(next);
            setNeedsAuth(false);
        }
        return res;
    }, [active, groupSlug, role]);

    return { active, loading, needsAuth, toggle };
}

interface AttendanceState {
    status: string | null;
    active: boolean;
    loading: boolean;
    needsAuth: boolean;
    /** Alterna la asistencia entre `status` y nada. */
    toggle: (status?: string) => Promise<MutationResult>;
}

export function useAttendance(eventSlug: string, defaultStatus = "asiste"): AttendanceState {
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        (async () => {
            const uid = await getCurrentUserId();
            if (!mounted.current) return;
            setNeedsAuth(!uid);
            if (uid) {
                const s = await getAttendance(eventSlug);
                if (mounted.current) setStatus(s);
            }
            if (mounted.current) setLoading(false);
        })();
        return () => {
            mounted.current = false;
        };
    }, [eventSlug]);

    const toggle = useCallback(
        async (nextStatus = defaultStatus): Promise<MutationResult> => {
            // Si ya estaba en ese estado, lo quitamos; si no, lo fijamos.
            const target = status === nextStatus ? null : nextStatus;
            const res = await setAttendance(eventSlug, target);
            if (res.needsAuth) {
                setNeedsAuth(true);
            } else if (res.ok) {
                setStatus(target);
                setNeedsAuth(false);
            }
            return res;
        },
        [status, eventSlug, defaultStatus],
    );

    return { status, active: status !== null, loading, needsAuth, toggle };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPIEDAD + MUTACIONES (crear / editar / borrar entidades)
// ─────────────────────────────────────────────────────────────────────────────

interface OwnerState {
    isOwner: boolean;
    loading: boolean;
    /** Re-evalúa la propiedad (útil tras login o tras crear la entidad). */
    refresh: () => void;
}

/** ¿Es el usuario actual dueño (owner_id) de la entidad (type, slug)? */
export function useEntityOwner(
    type: "page" | "group" | "event",
    slug: string,
): OwnerState {
    const [isOwner, setIsOwner] = useState(false);
    const [loading, setLoading] = useState(true);
    const mounted = useRef(true);

    const check = useCallback(async () => {
        if (!slug) {
            setIsOwner(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        const owner = await isEntityOwner(type, slug);
        if (mounted.current) {
            setIsOwner(owner);
            setLoading(false);
        }
    }, [type, slug]);

    useEffect(() => {
        mounted.current = true;
        check();
        return () => {
            mounted.current = false;
        };
    }, [check]);

    return { isOwner, loading, refresh: check };
}

interface MyEntitiesState {
    pages: OsPage[];
    groups: OsGroup[];
    events: OsEvent[];
    loading: boolean;
    needsAuth: boolean;
    refetch: () => void;
}

/** Lista las entidades (páginas/grupos/eventos) propiedad del usuario actual. */
export function useMyEntities(): MyEntitiesState {
    const [pages, setPages] = useState<OsPage[]>([]);
    const [groups, setGroups] = useState<OsGroup[]>([]);
    const [events, setEvents] = useState<OsEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        const uid = await getCurrentUserId();
        if (!mounted.current) return;
        if (!uid) {
            setNeedsAuth(true);
            setPages([]);
            setGroups([]);
            setEvents([]);
            setLoading(false);
            return;
        }
        setNeedsAuth(false);
        try {
            const res = await fetchMyEntities();
            if (!mounted.current) return;
            setPages(res.pages);
            setGroups(res.groups);
            setEvents(res.events);
        } catch {
            /* deja listas vacías */
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { pages, groups, events, loading, needsAuth, refetch: load };
}

interface EntityMutations {
    createPage: (input: CreatePageInput) => Promise<EntityMutationResult>;
    createGroup: (input: CreateGroupInput) => Promise<EntityMutationResult>;
    createEvent: (input: CreateEventInput) => Promise<EntityMutationResult>;
    updatePage: (slug: string, input: UpdatePageInput) => Promise<EntityMutationResult>;
    updateGroup: (slug: string, input: UpdateGroupInput) => Promise<EntityMutationResult>;
    updateEvent: (slug: string, input: UpdateEventInput) => Promise<EntityMutationResult>;
    deleteEntity: (
        type: "page" | "group" | "event",
        slug: string,
    ) => Promise<EntityMutationResult>;
}

/**
 * Expone las mutaciones de entidades envueltas en `useCallback` para usarlas
 * cómodamente desde formularios/diálogos sin reimportar la capa de acceso.
 */
export function useEntityMutations(): EntityMutations {
    return {
        createPage: useCallback((input) => createPage(input), []),
        createGroup: useCallback((input) => createGroup(input), []),
        createEvent: useCallback((input) => createEvent(input), []),
        updatePage: useCallback((slug, input) => updatePage(slug, input), []),
        updateGroup: useCallback((slug, input) => updateGroup(slug, input), []),
        updateEvent: useCallback((slug, input) => updateEvent(slug, input), []),
        deleteEntity: useCallback((type, slug) => deleteEntity(type, slug), []),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIKES y COMENTARIOS de una publicación (os_post_likes / os_post_comments)
//
// Pensados para usarse por-tarjeta en el feed. Sólo deben recibir IDs reales de
// `os_posts` (uuid). Para publicaciones de ejemplo, la UI degrada a estado local
// y no debe montar estos hooks (o pasarles un id inválido), porque las escrituras
// fallarían en RLS / clave foránea.
// ─────────────────────────────────────────────────────────────────────────────

interface LikeState {
    count: number;
    liked: boolean;
    loading: boolean;
    needsAuth: boolean;
    /** Alterna el like. Devuelve needsAuth si no hay sesión. */
    toggle: () => Promise<void>;
}

/**
 * Likes reales de una publicación. Carga el conteo y si el usuario actual le dio
 * like; `toggle` persiste en Supabase con actualización optimista y reconciliación.
 */
export function useLikes(postId: string, initialCount = 0): LikeState {
    const [count, setCount] = useState(initialCount);
    const [liked, setLiked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        (async () => {
            const uid = await getCurrentUserId();
            if (!mounted.current) return;
            setNeedsAuth(!uid);
            try {
                const info = await fetchLikes([postId]);
                if (!mounted.current) return;
                setCount(info.counts[postId] ?? 0);
                setLiked(Boolean(info.likedByMe[postId]));
            } catch {
                /* deja el conteo inicial */
            } finally {
                if (mounted.current) setLoading(false);
            }
        })();
        return () => {
            mounted.current = false;
        };
    }, [postId]);

    const toggle = useCallback(async () => {
        // Optimista.
        const prevLiked = liked;
        const prevCount = count;
        setLiked(!prevLiked);
        setCount((c) => c + (prevLiked ? -1 : 1));

        const res = await toggleLike(postId);
        if (!mounted.current) return;
        if (res.needsAuth) {
            setNeedsAuth(true);
            setLiked(prevLiked);
            setCount(prevCount);
            return;
        }
        if (res.ok) {
            setNeedsAuth(false);
            setLiked(res.active);
            setCount(res.count);
        } else {
            // Revertir si falló.
            setLiked(prevLiked);
            setCount(prevCount);
        }
    }, [postId, liked, count]);

    return { count, liked, loading, needsAuth, toggle };
}

interface CommentsState {
    comments: OsComment[];
    loading: boolean;
    needsAuth: boolean;
    /** Publica un comentario. Devuelve needsAuth si no hay sesión. */
    add: (body: string, authorName?: string) => Promise<MutationResult>;
    /** Borra un comentario propio. */
    remove: (id: string) => Promise<MutationResult>;
    refetch: () => void;
}

/**
 * Comentarios reales de una publicación con carga, alta y baja persistidas.
 * Realtime opcional: re-carga el hilo ante cambios en os_post_comments del post.
 */
export function useComments(postId: string, realtime = false): CommentsState {
    const [comments, setComments] = useState<OsComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [needsAuth, setNeedsAuth] = useState(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        try {
            const rows = await fetchComments(postId);
            if (mounted.current) setComments(rows);
        } catch {
            if (mounted.current) setComments([]);
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [postId]);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        load();
        getCurrentUserId().then((uid) => {
            if (mounted.current) setNeedsAuth(!uid);
        });

        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
        if (realtime && postId) {
            try {
                const supabase = createClient();
                channel = supabase
                    .channel(`os-comments-${postId}`)
                    .on(
                        "postgres_changes",
                        {
                            event: "*",
                            schema: "public",
                            table: "os_post_comments",
                            filter: `post_id=eq.${postId}`,
                        },
                        () => load(),
                    )
                    .subscribe();
            } catch {
                /* realtime no disponible */
            }
        }

        return () => {
            mounted.current = false;
            if (channel) {
                try {
                    createClient().removeChannel(channel);
                } catch {
                    /* noop */
                }
            }
        };
    }, [load, postId, realtime]);

    const add = useCallback(
        async (body: string, authorName?: string): Promise<MutationResult> => {
            const res = await addComment(postId, body, authorName);
            if (res.needsAuth) {
                setNeedsAuth(true);
                return { ok: false, needsAuth: true };
            }
            if (res.ok && res.comment) {
                setNeedsAuth(false);
                // Inserción optimista (realtime también lo cubriría sin duplicar
                // gracias al filtro por id en el merge).
                setComments((prev) =>
                    prev.some((c) => c.id === res.comment!.id) ? prev : [...prev, res.comment!],
                );
                return { ok: true, active: true };
            }
            return { ok: false, error: res.error };
        },
        [postId],
    );

    const remove = useCallback(async (id: string): Promise<MutationResult> => {
        const res = await deleteComment(id);
        if (res.ok) {
            setComments((prev) => prev.filter((c) => c.id !== id));
        }
        return res;
    }, []);

    return { comments, loading, needsAuth, add, remove, refetch: load };
}
