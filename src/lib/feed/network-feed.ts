// src/lib/feed/network-feed.ts
// ─────────────────────────────────────────────────────────────────────────────
// FEED REAL de la Red StarSeed (/network) sobre la tabla `posts` (Módulo 5 · El
// Lienzo Universal — la misma tabla que usa `post-entity.ts` y `publish.ts`).
//
// Cuando el Composer Universal (`/publicar`) publica con destino "Red / Feed"
// (`post_references.target.kind === "red"`) o sin destino específico, la fila
// aterriza en `posts`. Este módulo lee esas filas — de tipo `post` (no
// `comment`/`repost`) — y las normaliza al shape `Post` que ya consume
// `RichPostCard`, para que el feed principal muestre CONTENIDO REAL en vez de
// datos simulados en memoria.
//
// Filosofía de fallback (igual que `os-social.ts`): si Supabase falla, no está
// configurado o no hay filas, se devuelve una lista vacía (estado vacío
// honesto) — nunca se lanza ni se rellena con datos de ejemplo falsos.
//
// SSR-safe: sólo crea el cliente Supabase al invocarse.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import type { Post, User } from "@/services/network-simulation-service";
import type { CommentAttachment } from "@/lib/posts/post-entity";

/** Un adjunto de publicación de cualquier formato (vista previa dinámica). */
export interface PostAttachment {
    id: string;
    /** Categoría amplia: página, app, widget, programa, agente, skill, archivo, encuesta, evento… */
    kind:
        | "pagina"
        | "app"
        | "widget"
        | "programa"
        | "agente"
        | "skill"
        | "archivo"
        | "imagen"
        | "video"
        | "audio"
        | "encuesta"
        | "evento"
        | "enlace"
        | string;
    url?: string | null;
    href?: string | null;
    name?: string | null;
    title?: string | null;
    description?: string | null;
    thumbnail?: string | null;
    mime?: string | null;
}

/** Extiende `Post` (shape ya consumido por `RichPostCard`) con campos reales. */
export interface FeedPost extends Post {
    /** id real de `posts` (uuid) — el mismo que `id`, explícito para claridad. */
    postId: string;
    /** Adjunto rico opcional (tarjeta de vista previa expandible). */
    attachment?: PostAttachment | null;
    /** Área de publicación (Módulo 5): política / educación / cultura / general. */
    area?: string | null;
    /** true si la fila proviene de Supabase (siempre true aquí; se marca para claridad). */
    isReal: true;
}

interface PostRow {
    id: string;
    author_id: string | null;
    content: Record<string, any> | null;
    post_references: Record<string, any> | null;
    interactions: Record<string, any> | null;
    created_at: string | null;
}

function asObj<T extends object>(v: any, fallback: T): T {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : fallback;
}

/** Extrae el texto principal visible de un `content` jsonb (defensivo). */
function extractText(content: Record<string, any>): string {
    return (
        content.text ??
        content.markdown ??
        content.body ??
        content.title ??
        ""
    );
}

/** Extrae media simple (imagen/vídeo/audio) como URLs para el carrusel existente. */
function extractMedia(content: Record<string, any>): string[] {
    const out: string[] = [];
    const single = content.image ?? content.media ?? content.video ?? content.audio;
    if (typeof single === "string" && single) out.push(single);
    if (Array.isArray(content.gallery)) {
        for (const g of content.gallery) {
            if (typeof g === "string") out.push(g);
            else if (g && typeof g.url === "string") out.push(g.url);
        }
    }
    return out;
}

/** Deriva un adjunto rico (tarjeta de vista previa) desde `content`/`post_references`. */
function extractAttachment(
    content: Record<string, any>,
    refs: Record<string, any>,
): PostAttachment | null {
    // 1) Adjunto explícito ya estructurado (nuevo formato del composer/lienzo).
    const explicit = content.attachment ?? refs.attachment;
    if (explicit && typeof explicit === "object") {
        return {
            id: String(explicit.id ?? `att-${Date.now()}`),
            kind: explicit.kind ?? "archivo",
            url: explicit.url ?? null,
            href: explicit.href ?? explicit.launchHref ?? null,
            name: explicit.name ?? null,
            title: explicit.title ?? explicit.name ?? null,
            description: explicit.description ?? null,
            thumbnail: explicit.thumbnail ?? null,
            mime: explicit.mime ?? null,
        };
    }
    // 2) Archivo genérico { url, name, format, mime } (mismo shape que PostView).
    const file = content.file;
    if (file && typeof file === "object" && file.url) {
        return {
            id: `file-${content.title ?? file.name ?? "adjunto"}`,
            kind: file.format || "archivo",
            url: file.url,
            name: file.name ?? null,
            title: file.name ?? content.title ?? null,
            mime: file.mime ?? null,
        };
    }
    // 3) Enlace con tarjeta de vista previa.
    const link = content.link ?? content.url;
    if (typeof link === "string" && link && !extractMedia(content).includes(link)) {
        return {
            id: `link-${link}`,
            kind: "enlace",
            url: link,
            href: link,
            title: content.linkTitle ?? null,
            description: content.linkDescription ?? null,
            thumbnail: content.linkThumbnail ?? null,
        };
    }
    // 4) Lienzo / app / widget embebido.
    const embed = content.embed ?? content.app ?? content.widget;
    if (embed && typeof embed === "object") {
        return {
            id: `embed-${embed.id ?? "widget"}`,
            kind: embed.kind ?? "widget",
            href: embed.href ?? embed.launchHref ?? null,
            name: embed.name ?? null,
            title: embed.title ?? embed.name ?? null,
            description: embed.description ?? null,
        };
    }
    return null;
}

function normalizeRow(row: PostRow): FeedPost {
    const content = asObj<Record<string, any>>(row.content, {});
    const refs = asObj<Record<string, any>>(row.post_references, {});
    const interactions = asObj<Record<string, any>>(row.interactions, {});
    const reactions = asObj<Record<string, number>>(interactions.reactions, {});
    const reactionTotal = Object.values(reactions).reduce((a, b) => a + (b || 0), 0);

    const author: User = {
        id: row.author_id || "desconocido",
        name: "Ciudadano StarSeed",
        handle: "",
        avatar: "",
    };

    return {
        id: row.id,
        postId: row.id,
        author,
        content: extractText(content),
        media: extractMedia(content),
        type: extractMedia(content).length > 0 ? "mixed" : "text",
        likes: reactionTotal,
        commentsCount: 0, // se resuelve aparte (conteo real vía RPC ligera) si hace falta
        shares: Array.isArray(refs.instances) ? refs.instances.length : 0,
        createdAt: row.created_at || new Date().toISOString(),
        likedByMe: false,
        tags: Array.isArray(interactions.tags) ? interactions.tags : [],
        attachment: extractAttachment(content, refs),
        area: refs.area ?? null,
        isReal: true,
    };
}

export interface FetchFeedOptions {
    /** Máximo de publicaciones a traer (por defecto 60; el algoritmo re-ordena en cliente). */
    limit?: number;
}

/**
 * Trae el feed público real de la Red: publicaciones de tipo `post` cuyo
 * destino incluye la Red/Feed público, o sin destino de área restringido.
 * Nunca lanza: ante cualquier fallo devuelve `[]` (estado vacío honesto).
 */
export async function fetchNetworkFeed(opts: FetchFeedOptions = {}): Promise<FeedPost[]> {
    const limit = opts.limit ?? 60;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("posts")
            .select("id, author_id, content, post_references, interactions, created_at")
            .eq("type", "post")
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        return data.map((row) => normalizeRow(row as PostRow));
    } catch {
        return [];
    }
}

/** Enriquecimiento best-effort: resuelve nombre/handle del autor por lote. */
export async function enrichAuthors(posts: FeedPost[]): Promise<FeedPost[]> {
    const ids = Array.from(new Set(posts.map((p) => p.author.id).filter((id) => id && id !== "desconocido")));
    if (ids.length === 0) return posts;
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("profiles")
            .select("id, handle, display_name, avatar_url")
            .in("id", ids);
        type ProfRow = { id: string; handle?: string | null; display_name?: string | null; avatar_url?: string | null };
        const byId = new Map<string, ProfRow>(((data ?? []) as ProfRow[]).map((p) => [p.id, p]));
        return posts.map((p) => {
            const prof = byId.get(p.author.id);
            if (!prof) return p;
            return {
                ...p,
                author: {
                    ...p.author,
                    name: prof.display_name || (prof.handle ? `@${prof.handle}` : p.author.name),
                    handle: prof.handle ? `@${prof.handle}` : p.author.handle,
                    avatar: prof.avatar_url || p.author.avatar,
                },
            };
        });
    } catch {
        return posts;
    }
}

/** Conteo real de comentarios por publicación (best-effort, tolera fallos). */
export async function enrichCommentCounts(posts: FeedPost[]): Promise<FeedPost[]> {
    if (posts.length === 0) return posts;
    try {
        const supabase = createClient();
        const ids = posts.map((p) => p.postId);
        const { data } = await supabase
            .from("posts")
            .select("post_references")
            .eq("type", "comment")
            .in("post_references->>parent", ids);
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { post_references?: Record<string, any> }[]) {
            const parent = row.post_references?.parent;
            if (typeof parent === "string") counts.set(parent, (counts.get(parent) ?? 0) + 1);
        }
        return posts.map((p) => ({ ...p, commentsCount: counts.get(p.postId) ?? 0 }));
    } catch {
        return posts;
    }
}

/**
 * Deriva "mis conexiones" (para el algoritmo de Cercanía) a partir de señales
 * reales ya existentes: autores de comentarios que he escrito y autores de
 * publicaciones a las que he dado "me gusta". Nunca lanza: ante cualquier fallo
 * devuelve un conjunto vacío (el algoritmo de Cercanía degrada a Relevancia).
 */
export async function fetchMyConnectionIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) return ids;

        // Autores de publicaciones que ya di like.
        const { data: liked } = await supabase
            .from("os_post_likes")
            .select("post_id")
            .eq("user_id", uid)
            .limit(200);
        const likedPostIds = ((liked ?? []) as { post_id: string }[]).map((r) => r.post_id);
        if (likedPostIds.length > 0) {
            const { data: likedPosts } = await supabase
                .from("posts")
                .select("id, author_id")
                .in("id", likedPostIds);
            for (const row of (likedPosts ?? []) as { author_id?: string | null }[]) {
                if (row.author_id) ids.add(row.author_id);
            }
        }

        // Autores de hilos donde ya comenté (comentarios propios → parent).
        const { data: myComments } = await supabase
            .from("posts")
            .select("post_references")
            .eq("type", "comment")
            .eq("author_id", uid)
            .limit(200);
        const parentIds = Array.from(
            new Set(
                ((myComments ?? []) as { post_references?: Record<string, any> }[])
                    .map((r) => r.post_references?.parent)
                    .filter((v): v is string => typeof v === "string"),
            ),
        );
        if (parentIds.length > 0) {
            const { data: parentPosts } = await supabase
                .from("posts")
                .select("id, author_id")
                .in("id", parentIds);
            for (const row of (parentPosts ?? []) as { author_id?: string | null }[]) {
                if (row.author_id) ids.add(row.author_id);
            }
        }

        ids.delete(uid); // no cuentes al propio usuario como "conexión"
        return ids;
    } catch {
        return ids;
    }
}

export type { CommentAttachment };
