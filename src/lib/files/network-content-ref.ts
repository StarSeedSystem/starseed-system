"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * network-content-ref — "Contenido de la red" (referencias adjuntables EN VIVO)
 * ---------------------------------------------------------------------------
 * Busca páginas/grupos/eventos/publicaciones REALES (propios y públicos, tablas
 * `os_pages`/`os_groups`/`os_events`/`os_posts`, todas con lectura pública por
 * RLS) para adjuntarlas como REFERENCIA en un mensaje/comentario/correo — la
 * pestaña "Contenido de la red" del selector universal de archivos
 * (@/components/files/universal-file-picker.tsx).
 *
 * Un adjunto de referencia NO copia contenido: guarda `{refKind, refId, route}`
 * y, al mostrarse (@/components/files/universal-attachment-view.tsx), se
 * EMBEBE la propia ruta interna en un iframe de confianza — así cualquier
 * superficie viva (servidor/espacio con realtime) se ve en tiempo real dentro
 * del mensaje/comentario/correo, sin duplicar lógica de sincronización.
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a [] sin sesión/red.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { fetchPages, fetchGroups, fetchEvents, type OsPage, type OsGroup, type OsEvent } from "@/lib/os-social";

export type NetworkRefKind = "page" | "group" | "event" | "post";

export interface NetworkContentRef {
    refKind: NetworkRefKind;
    /** slug (page/group/event) o id (post). */
    refId: string;
    name: string;
    description?: string;
    coverUrl?: string;
    route: string;
}

/** Ruta in-app de una referencia, dado su tipo + slug/id. Fuente única para picker + vistas. */
export function networkRefRoute(kind: NetworkRefKind, refId: string): string {
    switch (kind) {
        case "page":
            return `/pagina/${refId}`;
        case "group":
            return `/grupo/${refId}`;
        case "event":
            return `/evento/${refId}`;
        case "post":
            return `/post/${refId}`;
        default:
            return "/";
    }
}

/** Etiqueta legible en español por tipo de referencia. */
export function networkRefLabel(kind: NetworkRefKind | string): string {
    switch (kind) {
        case "page":
            return "Página";
        case "group":
            return "Grupo";
        case "event":
            return "Evento";
        case "post":
            return "Publicación";
        default:
            return "Referencia";
    }
}

function pageToRef(p: OsPage): NetworkContentRef {
    return {
        refKind: "page",
        refId: p.slug,
        name: p.name,
        description: p.description,
        coverUrl: p.coverUrl || p.avatarUrl,
        route: networkRefRoute("page", p.slug),
    };
}

function groupToRef(g: OsGroup): NetworkContentRef {
    return {
        refKind: "group",
        refId: g.slug,
        name: g.name,
        description: g.description,
        coverUrl: g.coverUrl || g.avatarUrl,
        route: networkRefRoute("group", g.slug),
    };
}

function eventToRef(e: OsEvent): NetworkContentRef {
    return {
        refKind: "event",
        refId: e.slug,
        name: e.title,
        description: e.description,
        coverUrl: e.coverUrl,
        route: networkRefRoute("event", e.slug),
    };
}

interface PostSearchRow {
    id: string;
    author_name?: string | null;
    body?: string | null;
    media_url?: string | null;
}

/** Publicaciones (cualquier entidad) cuyo cuerpo contenga el término. Lectura pública. */
async function searchPostsByText(term: string, limit = 12): Promise<NetworkContentRef[]> {
    if (!term.trim()) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_posts")
            .select("id, author_name, body, media_url")
            .ilike("body", `%${term.trim()}%`)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        return (data as PostSearchRow[]).map((row) => ({
            refKind: "post" as const,
            refId: row.id,
            name: (row.body || "Publicación").slice(0, 60) || "Publicación",
            description: row.author_name ? `De ${row.author_name}` : undefined,
            coverUrl: row.media_url || undefined,
            route: networkRefRoute("post", row.id),
        }));
    } catch {
        return [];
    }
}

/**
 * Busca contenido de la red (páginas/grupos/eventos/publicaciones, propios y
 * públicos) que coincida con `query` en nombre/descripción. Combina lecturas
 * ya existentes (`fetchPages`/`fetchGroups`/`fetchEvents`) con una búsqueda de
 * texto en `os_posts`. Nunca lanza: [] ante cualquier fallo o consulta vacía.
 */
export async function searchNetworkContent(query: string): Promise<NetworkContentRef[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    try {
        const [pages, groups, events, posts] = await Promise.all([
            fetchPages().catch(() => [] as OsPage[]),
            fetchGroups().catch(() => [] as OsGroup[]),
            fetchEvents().catch(() => [] as OsEvent[]),
            searchPostsByText(q),
        ]);
        const hit = (...texts: (string | undefined | null)[]) =>
            texts.some((t) => (t || "").toLowerCase().includes(q));

        const pageRefs = pages.filter((p) => hit(p.name, p.description)).slice(0, 8).map(pageToRef);
        const groupRefs = groups.filter((g) => hit(g.name, g.description)).slice(0, 8).map(groupToRef);
        const eventRefs = events.filter((e) => hit(e.title, e.description)).slice(0, 8).map(eventToRef);

        return [...pageRefs, ...groupRefs, ...eventRefs, ...posts];
    } catch {
        return [];
    }
}
