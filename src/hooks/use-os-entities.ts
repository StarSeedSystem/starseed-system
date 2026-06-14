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
import {
    detectMedia,
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
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, loading, usingFallback, error, refetch: load };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICACIONES de una entidad (lectura + realtime + crear)
// ─────────────────────────────────────────────────────────────────────────────

/** Convierte una fila OsPost al shape de UI NormalizedPost (con detección de media). */
function osPostToNormalized(p: OsPost): NormalizedPost {
    const body = p.mediaUrl ? `${p.body}\n${p.mediaUrl}` : p.body;
    return {
        id: p.id,
        authorName: p.authorName,
        body: p.body,
        kind: "post",
        createdAt: p.createdAt,
        likes: 0,
        commentsCount: 0,
        media: detectMedia({ body, recipe: p.mediaUrl ? { media: [p.mediaUrl] } : null }),
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

        let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
        if (realtime) {
            try {
                const supabase = createClient();
                channel = supabase
                    .channel(`os-posts-${entityType}-${slug}`)
                    .on(
                        "postgres_changes",
                        { event: "*", schema: "public", table: "os_posts" },
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
