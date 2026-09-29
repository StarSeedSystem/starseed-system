"use client";
/**
 * Datos del Feed de la Red (Ola 0929 · D) — el Lienzo Universal REAL (`posts`, el mismo de
 * /network) con lo que hace falta para una tarjeta útil: autor de verdad (`os_profiles`, el
 * directorio del OS), reacciones reales (`os_post_likes`, las mismas del corazón de /network) y
 * comentarios reales. Una vuelta cada ≥ 10 min, a la vista: 4-5 peticiones. La consulta de
 * `posts` es la de `fetchNetworkFeedConEstado`, que ya sabe caer a «tolerante» o pararse ante
 * el 400 del esquema viejo (contrato «consumo»): aquí no se repite ninguna consulta ancha.
 */
import { createClient } from "@/utils/supabase/client";
import { enrichCommentCounts, feedNoDisponible, fetchNetworkFeedConEstado, type FeedPost } from "@/lib/feed/network-feed";
import { fetchLikes } from "@/lib/os-social";
import type { FalloConsulta } from "@/lib/network/bucle-fondo";
import { esImagen, esVideo, msDe } from "./formato";

export interface PublicacionRed {
    id: string;
    autorId: string | null;
    autor: string;
    handle: string | null;
    avatar: string | null;
    texto: string;
    /** Miniatura (imagen o vídeo) si la publicación trae alguna. */
    media: string | null;
    tipoMedia: "imagen" | "video" | "enlace" | "archivo" | null;
    nMedia: number;
    reacciones: number;
    meGusta: boolean;
    comentarios: number;
    area: string | null;
    ms: number;
}

export interface FeedRed {
    publicaciones: PublicacionRed[];
    /** La tabla no existe o no se puede leer en esta base: no se volverá a pedir hasta recargar. */
    noDisponible: boolean;
}

/** Miniatura y tipo de una publicación del Lienzo (PURO). */
export function mediaDe(p: Pick<FeedPost, "media" | "attachments" | "attachment">): { url: string | null; tipo: PublicacionRed["tipoMedia"]; n: number } {
    const lista = p.media ?? [];
    const img = lista.find((u) => esImagen(u) || (!esVideo(u) && /^https?:\/\//i.test(u)));
    const vid = lista.find((u) => esVideo(u));
    const adj = (p.attachments ?? []).find((a) => a.thumbnail || a.kind === "imagen" || a.kind === "video") ?? p.attachment ?? null;
    const n = Math.max(lista.length, p.attachments?.length ?? 0);
    if (img) return { url: img, tipo: "imagen", n };
    if (vid) return { url: vid, tipo: "video", n };
    if (adj) {
        const url = adj.thumbnail ?? (adj.kind === "imagen" || adj.kind === "video" ? adj.url ?? null : null);
        const tipo: PublicacionRed["tipoMedia"] = adj.kind === "video" ? "video" : adj.kind === "imagen" ? "imagen" : adj.kind === "enlace" ? "enlace" : "archivo";
        return { url: url ?? null, tipo, n: Math.max(n, 1) };
    }
    return { url: null, tipo: null, n: 0 };
}

export async function cargarFeedRed(limite = 12): Promise<{ datos?: FeedRed; fallo?: FalloConsulta | null }> {
    const { posts, fallo } = await fetchNetworkFeedConEstado({ limit: limite });
    if (fallo && posts.length === 0) {
        // Parado por el esquema (400/404): se dice, sin volver a pedir.
        if (feedNoDisponible()) return { datos: { publicaciones: [], noDisponible: true } };
        return { fallo };
    }
    if (posts.length === 0) return { datos: { publicaciones: [], noDisponible: feedNoDisponible() } };

    const ids = posts.map((p) => p.postId);
    const autores = Array.from(new Set(posts.map((p) => p.author.id).filter((id) => id && id !== "desconocido")));
    const sb = createClient();
    const [perfiles, likes, conComentarios] = await Promise.all([
        autores.length
            ? sb.from("os_profiles").select("user_id, username, display_name, avatar_url").in("user_id", autores).then((r) => (r.data as { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] | null) ?? [], () => [])
            : Promise.resolve([]),
        fetchLikes(ids).catch(() => ({ counts: {} as Record<string, number>, likedByMe: {} as Record<string, boolean> })),
        enrichCommentCounts(posts).catch(() => posts),
    ]);
    const porId = new Map(perfiles.map((p) => [p.user_id, p]));
    const comentarios = new Map(conComentarios.map((p) => [p.postId, p.commentsCount]));

    const publicaciones: PublicacionRed[] = posts.map((p) => {
        const perfil = porId.get(p.author.id);
        const m = mediaDe(p);
        return {
            id: p.postId,
            autorId: p.author.id === "desconocido" ? null : p.author.id,
            autor: perfil?.display_name || perfil?.username || p.author.name || "Persona de la Red",
            handle: perfil?.username ?? null,
            avatar: perfil?.avatar_url ?? null,
            texto: p.content ?? "",
            media: m.url,
            tipoMedia: m.tipo,
            nMedia: m.n,
            // Las mismas reacciones que el corazón de /network (`os_post_likes`).
            reacciones: likes.counts[p.postId] ?? 0,
            meGusta: !!likes.likedByMe[p.postId],
            comentarios: comentarios.get(p.postId) ?? p.commentsCount ?? 0,
            area: p.area ?? null,
            ms: msDe(p.createdAt),
        };
    });
    return { datos: { publicaciones, noDisponible: false } };
}
