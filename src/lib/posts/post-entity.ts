// src/lib/posts/post-entity.ts
// -----------------------------------------------------------------------------
// Módulo 5 · El Lienzo Universal — La Publicación como ENTIDAD ATÓMICA.
//
// Una publicación es UNA única entidad autocontenida en la tabla `posts`. Al
// compartirse en varios Perfiles/Páginas NO se crean copias: se crean
// REFERENCIAS / INSTANCIAS (`post_references.instances`). Toda interacción
// (reacción, voto, etiqueta, sugerencia, reporte) se realiza sobre la MISMA
// entidad mediante read-modify-write del jsonb `posts.interactions`, de modo que
// se refleja en cualquier instancia donde se esté viendo (sincronización).
//
// Los comentarios son a su vez publicaciones anidadas: filas `posts` con
// `type:'comment'` que apuntan a su publicación raíz (y opcionalmente a un
// comentario padre) vía `post_references.parent` / `post_references.parentComment`.
//
// Esquema (acordado):
//   posts(id, author_id, type, content jsonb, visibility,
//         post_references jsonb, interactions jsonb, created_at, updated_at)
//   profiles(id, user_id, handle, display_name)
//   pages(id, title)
//
// Capa de datos pura (sin JSX). SSR-safe: solo crea el cliente Supabase al
// invocarse, nunca en el ámbito del módulo.
// -----------------------------------------------------------------------------

import { createClient } from "@/utils/supabase/client";

// ----------------------------- Tipos ----------------------------------------

/** Un destino donde "vive" la publicación (su alcance): Perfil o Página. */
export interface ReachDestination {
    kind: "profile" | "page" | string;
    id: string;
    /** Etiqueta legible opcional ya resuelta (display_name / handle / title). */
    label?: string | null;
    handle?: string | null;
}

/** Una instancia/referencia visual de la entidad en un destino concreto. */
export interface PostInstance {
    id?: string;                 // id de la fila ligera de tipo 'repost' (si existe)
    destination: ReachDestination;
    by?: string | null;         // quién la creó (author_id)
    created_at?: string;
}

/** Configuración de votación avanzada (vive en post_references.voting). */
export interface VotingConfig {
    enabled?: boolean;
    question?: string;
    /** Opciones de la votación. */
    options?: { id: string; label: string }[];
    /** "single" (una opción) | "multiple" (varias). */
    mode?: "single" | "multiple" | string;
    closesAt?: string | null;
}

/** Estructura del jsonb `post_references`. */
export interface PostReferences {
    /** Destinos donde está publicada la entidad (su alcance). */
    destinations?: ReachDestination[];
    /** Instancias/referencias creadas al republicar. */
    instances?: PostInstance[];
    /** Configuración de votación avanzada. */
    voting?: VotingConfig | null;
    /** Para comentarios: id de la publicación raíz. */
    parent?: string | null;
    /** Para comentarios: id del comentario padre (anidamiento). */
    parentComment?: string | null;
    [key: string]: any;
}

/** Una sugerencia de cambio almacenada en interactions.suggestions. */
export interface Suggestion {
    id: string;
    by: string | null;
    text: string;
    created_at: string;
}

/** Un reporte almacenado en interactions.reports. */
export interface Report {
    id: string;
    by: string | null;
    reason: string;
    created_at: string;
}

/** Estructura del jsonb `interactions` (todo vive en la entidad única). */
export interface Interactions {
    /** Recuentos de reacciones por tipo, p.ej. { like: 3, celebrate: 1 }. */
    reactions?: Record<string, number>;
    /** Recuentos de votos por id de opción, p.ej. { opt_a: 5, opt_b: 2 }. */
    votes?: Record<string, number>;
    /** Etiquetas aplicadas a la entidad. */
    tags?: string[];
    /** Sugerencias de cambio (gobernanza). */
    suggestions?: Suggestion[];
    /** Reportes (moderación). */
    reports?: Report[];
    [key: string]: any;
}

/** Una fila `posts` normalizada para la UI. */
export interface PostEntity {
    id: string;
    author_id: string | null;
    type: string;                 // 'post' | 'repost' | 'comment' | ...
    content: Record<string, any>; // { text?, markdown?, image?, link?, canvas?, title? }
    visibility: string | null;
    post_references: PostReferences;
    interactions: Interactions;
    created_at: string | null;
    updated_at: string | null;
    /** Autor resuelto desde `profiles` (best-effort). */
    author?: { id: string; handle?: string | null; display_name?: string | null } | null;
}

/** Un comentario (publicación anidada) con sus hijos para el árbol. */
export interface CommentNode extends PostEntity {
    parentComment: string | null;
    children: CommentNode[];
}

// ----------------------------- Utilidades -----------------------------------

function rid(prefix = "id"): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asObject<T extends object>(v: any, fallback: T): T {
    if (v && typeof v === "object" && !Array.isArray(v)) return v as T;
    return fallback;
}

/** Normaliza una fila cruda de Supabase a `PostEntity` (defensivo con jsonb). */
function normalize(row: any): PostEntity {
    return {
        id: String(row?.id ?? ""),
        author_id: row?.author_id ?? null,
        type: row?.type ?? "post",
        content: asObject<Record<string, any>>(row?.content, {}),
        visibility: row?.visibility ?? null,
        post_references: asObject<PostReferences>(row?.post_references, {}),
        interactions: asObject<Interactions>(row?.interactions, {}),
        created_at: row?.created_at ?? null,
        updated_at: row?.updated_at ?? null,
        author: null,
    };
}

/** id del usuario actual (o null si no hay sesión). SSR-safe. */
async function currentUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ----------------------------- Carga ----------------------------------------

/** Carga UNA publicación (la entidad atómica) + su autor (best-effort). */
export async function loadPost(id: string): Promise<PostEntity | null> {
    if (!id) return null;
    const supabase = createClient();
    const { data, error } = await supabase.from("posts").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;

    const post = normalize(data);

    // Resolver autor desde `profiles` (no rompe si la tabla/perfil no existe).
    if (post.author_id) {
        try {
            const { data: prof } = await supabase
                .from("profiles")
                .select("id, handle, display_name")
                .eq("id", post.author_id)
                .maybeSingle();
            if (prof) {
                post.author = { id: prof.id, handle: prof.handle, display_name: prof.display_name };
            }
        } catch {
            /* sin perfil: degradación elegante */
        }
    }
    return post;
}

/**
 * Resuelve el ALCANCE de la entidad a partir de `post_references.destinations`
 * (la lista de Perfiles/Páginas donde vive) y devuelve una lista legible en
 * español. Intenta enriquecer las etiquetas faltantes consultando `profiles`
 * (display_name/handle) y `pages` (title); si no puede, usa el id.
 */
export async function reachOf(post: PostEntity | null): Promise<string[]> {
    const dests = post?.post_references?.destinations ?? [];
    if (!Array.isArray(dests) || dests.length === 0) return [];

    const supabase = createClient();
    const out: string[] = [];

    for (const d of dests) {
        if (!d) continue;
        let label = d.label || null;

        if (!label) {
            try {
                if (d.kind === "page") {
                    const { data } = await supabase.from("pages").select("title").eq("id", d.id).maybeSingle();
                    label = data?.title ?? null;
                } else {
                    const { data } = await supabase
                        .from("profiles")
                        .select("display_name, handle")
                        .eq("id", d.id)
                        .maybeSingle();
                    label = data?.display_name || (data?.handle ? `@${data.handle}` : null);
                }
            } catch {
                /* degradar al id */
            }
        }

        const kindEs = d.kind === "page" ? "Página" : "Perfil";
        out.push(label ? `${kindEs}: ${label}` : `${kindEs}: ${d.id}`);
    }
    return out;
}

// ------------------- Interacciones (read-modify-write atómico) ---------------
//
// Patrón común: leer el jsonb `interactions` de la entidad única, mutarlo en
// memoria y reescribirlo. Nunca se duplica el contenido — siempre opera sobre
// la MISMA fila `posts`.

async function patchInteractions(
    postId: string,
    mutate: (i: Interactions) => Interactions,
): Promise<Interactions> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("posts")
        .select("interactions")
        .eq("id", postId)
        .maybeSingle();
    if (error) throw error;

    const current = asObject<Interactions>(data?.interactions, {});
    const next = mutate({ ...current });

    const { error: upErr } = await supabase
        .from("posts")
        .update({ interactions: next, updated_at: new Date().toISOString() })
        .eq("id", postId);
    if (upErr) throw upErr;
    return next;
}

async function patchReferences(
    postId: string,
    mutate: (r: PostReferences) => PostReferences,
): Promise<PostReferences> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("posts")
        .select("post_references")
        .eq("id", postId)
        .maybeSingle();
    if (error) throw error;

    const current = asObject<PostReferences>(data?.post_references, {});
    const next = mutate({ ...current });

    const { error: upErr } = await supabase
        .from("posts")
        .update({ post_references: next, updated_at: new Date().toISOString() })
        .eq("id", postId);
    if (upErr) throw upErr;
    return next;
}

/** Reaccionar a la entidad (incrementa interactions.reactions[kind]). */
export async function react(postId: string, kind: string): Promise<Interactions> {
    return patchInteractions(postId, (i) => {
        const reactions = { ...(i.reactions ?? {}) };
        reactions[kind] = (reactions[kind] ?? 0) + 1;
        return { ...i, reactions };
    });
}

/**
 * Votar en la votación avanzada de la entidad. La configuración se LEE de
 * `post_references.voting`; el recuento se acumula en `interactions.votes`.
 */
export async function vote(postId: string, choice: string): Promise<Interactions> {
    const supabase = createClient();

    // Validar la opción contra la configuración (si existe).
    const { data } = await supabase
        .from("posts")
        .select("post_references")
        .eq("id", postId)
        .maybeSingle();
    const voting = asObject<PostReferences>(data?.post_references, {}).voting ?? null;
    if (voting && Array.isArray(voting.options) && voting.options.length > 0) {
        const valid = voting.options.some((o) => o.id === choice);
        if (!valid) throw new Error("Opción de voto no válida");
    }

    return patchInteractions(postId, (i) => {
        const votes = { ...(i.votes ?? {}) };
        votes[choice] = (votes[choice] ?? 0) + 1;
        return { ...i, votes };
    });
}

/** Etiquetar la entidad (une etiquetas nuevas a interactions.tags, sin duplicar). */
export async function tag(postId: string, tags: string[]): Promise<Interactions> {
    const clean = (tags || []).map((t) => t.trim()).filter(Boolean);
    return patchInteractions(postId, (i) => {
        const set = new Set([...(i.tags ?? []), ...clean]);
        return { ...i, tags: Array.from(set) };
    });
}

/**
 * Republicar = crear una REFERENCIA / INSTANCIA (no una copia). Añade los
 * destinos a `post_references.instances` de la entidad ORIGINAL y, además,
 * crea una fila `posts` ligera de tipo 'repost' que apunta a la original
 * (sin duplicar el contenido). Devuelve los ids de repost creados.
 */
export async function republish(
    postId: string,
    destinations: ReachDestination[],
): Promise<{ instances: PostInstance[]; repostIds: string[] }> {
    const supabase = createClient();
    const by = await currentUserId();
    const dests = (destinations || []).filter(Boolean);
    const now = new Date().toISOString();
    const repostIds: string[] = [];
    const created: PostInstance[] = [];

    for (const destination of dests) {
        const instance: PostInstance = { destination, by, created_at: now };

        // Fila ligera 'repost' que referencia a la entidad original (no copia).
        try {
            const { data, error } = await supabase
                .from("posts")
                .insert({
                    author_id: by,
                    type: "repost",
                    content: {}, // sin contenido: la entidad real es la original
                    visibility: "public",
                    post_references: { original: postId, destination },
                    interactions: {},
                })
                .select("id")
                .maybeSingle();
            if (!error && data?.id) {
                instance.id = data.id;
                repostIds.push(data.id);
            }
        } catch {
            /* si la inserción falla, igualmente registramos la instancia */
        }

        created.push(instance);
    }

    // Registrar las instancias en la entidad original (alcance vivo).
    await patchReferences(postId, (r) => {
        const instances = [...(r.instances ?? []), ...created];
        // Reflejar también los nuevos destinos en `destinations` (alcance).
        const destKey = (d: ReachDestination) => `${d.kind}:${d.id}`;
        const existing = new Set((r.destinations ?? []).map(destKey));
        const mergedDests = [...(r.destinations ?? [])];
        for (const c of created) {
            if (!existing.has(destKey(c.destination))) {
                mergedDests.push(c.destination);
                existing.add(destKey(c.destination));
            }
        }
        return { ...r, instances, destinations: mergedDests };
    });

    return { instances: created, repostIds };
}

/** Sugerir un cambio (gobernanza) → interactions.suggestions. */
export async function suggestChange(postId: string, text: string): Promise<Suggestion> {
    const by = await currentUserId();
    const suggestion: Suggestion = {
        id: rid("sug"),
        by,
        text: (text || "").trim(),
        created_at: new Date().toISOString(),
    };
    await patchInteractions(postId, (i) => ({
        ...i,
        suggestions: [...(i.suggestions ?? []), suggestion],
    }));
    return suggestion;
}

/** Reportar la entidad (moderación) → interactions.reports. */
export async function report(postId: string, reason: string): Promise<Report> {
    const by = await currentUserId();
    const rep: Report = {
        id: rid("rep"),
        by,
        reason: (reason || "").trim(),
        created_at: new Date().toISOString(),
    };
    await patchInteractions(postId, (i) => ({
        ...i,
        reports: [...(i.reports ?? []), rep],
    }));
    return rep;
}

// ----------------------- Comentarios anidados -------------------------------
//
// Los comentarios son publicaciones: filas `posts` con `type:'comment'`,
// `content:{text}` y `post_references:{ parent, parentComment? }`. Anidables.

/** Lista plana de comentarios de una publicación (todos sus descendientes). */
export async function listComments(postId: string): Promise<CommentNode[]> {
    if (!postId) return [];
    const supabase = createClient();
    const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("type", "comment")
        .eq("post_references->>parent", postId)
        .order("created_at", { ascending: true });
    if (error || !Array.isArray(data)) return [];

    const nodes: CommentNode[] = data.map((row) => {
        const base = normalize(row);
        return {
            ...base,
            parentComment: base.post_references?.parentComment ?? null,
            children: [],
        };
    });

    // Enriquecer autores en lote (best-effort).
    const authorIds = Array.from(
        new Set(nodes.map((n) => n.author_id).filter(Boolean) as string[]),
    );
    if (authorIds.length > 0) {
        try {
            const { data: profs } = await supabase
                .from("profiles")
                .select("id, handle, display_name")
                .in("id", authorIds);
            type ProfRow = { id: string; handle?: string | null; display_name?: string | null };
            const byId = new Map<string, ProfRow>(
                ((profs ?? []) as ProfRow[]).map((p) => [p.id, p]),
            );
            for (const n of nodes) {
                const p = n.author_id ? byId.get(n.author_id) : null;
                if (p) n.author = { id: p.id, handle: p.handle, display_name: p.display_name };
            }
        } catch {
            /* degradar sin autores */
        }
    }
    return nodes;
}

/**
 * Añade un comentario (publicación anidada). Si se indica `parentId`, el
 * comentario cuelga de otro comentario (respuesta); si no, del post raíz.
 */
export async function addComment(
    postId: string,
    content: string,
    parentId?: string | null,
): Promise<PostEntity | null> {
    const text = (content || "").trim();
    if (!postId || !text) return null;
    const supabase = createClient();
    const by = await currentUserId();

    const { data, error } = await supabase
        .from("posts")
        .insert({
            author_id: by,
            type: "comment",
            content: { text },
            visibility: "public",
            post_references: { parent: postId, parentComment: parentId ?? null },
            interactions: {},
        })
        .select("*")
        .maybeSingle();
    if (error || !data) return null;
    return normalize(data);
}

/** Construye el árbol de comentarios anidados a partir de la lista plana. */
export async function commentTree(postId: string): Promise<CommentNode[]> {
    const flat = await listComments(postId);
    const byId = new Map<string, CommentNode>();
    flat.forEach((c) => byId.set(c.id, c));

    const roots: CommentNode[] = [];
    for (const c of flat) {
        const parent = c.parentComment ? byId.get(c.parentComment) : null;
        if (parent) parent.children.push(c);
        else roots.push(c);
    }
    return roots;
}

// ----------------------- Tiempo real (HONESTO: polling) ----------------------
//
// No asumimos canales de realtime de Supabase configurados. Hacemos polling
// cada ~8s y notificamos al callback con la entidad + su árbol de comentarios.
// Devuelve una función de limpieza para cancelar el intervalo.

export interface PostSnapshot {
    post: PostEntity | null;
    comments: CommentNode[];
}

export function subscribe(
    postId: string,
    cb: (snap: PostSnapshot) => void,
    intervalMs = 8000,
): () => void {
    let cancelled = false;

    const tick = async () => {
        if (cancelled) return;
        try {
            const [post, comments] = await Promise.all([loadPost(postId), commentTree(postId)]);
            if (!cancelled) cb({ post, comments });
        } catch {
            /* silencioso: el siguiente tick reintenta */
        }
    };

    // Primer disparo inmediato + intervalo.
    void tick();
    const handle = setInterval(tick, Math.max(3000, intervalMs));

    return () => {
        cancelled = true;
        clearInterval(handle);
    };
}
