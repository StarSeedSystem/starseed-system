"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * network-stories — Historias TEMPORALES reales, en red (Supabase), lanzadas
 * desde la Cámara/Galería.
 * ---------------------------------------------------------------------------
 * Distinto del prototipo local `src/contexts/stories-context.tsx` (localStorage
 * por navegador, usado hoy en /hub y /profile) — ESTE módulo persiste de
 * verdad, entre dispositivos y usuarios, reutilizando la API YA EXISTENTE de
 * publicación (`publish()` de `@/lib/publish/publish`, SIN modificarla):
 *
 *   · Escritura: `shareAsStory()` llama a `publish()` con `postKind:"historia"`
 *     y guarda expiración/audiencia/ubicación en `content.meta` (campo libre
 *     ya soportado por `PublishContent`). Cada destino (red/perfil/grupo) crea
 *     su propia fila en `posts`, igual que hace el compositor universal.
 *   · Lectura: consultas DIRECTAS y de solo-lectura a `posts` (mismo patrón
 *     `columna->>clave` que ya usa `src/lib/feed/network-feed.ts`, sin tocarlo)
 *     filtrando `post_references->>postKind = 'historia'` y expiración futura.
 *   · Borrado: DELETE directo (RLS ya restringe a `author_id = auth.uid()`).
 *   · Responder por mensaje: reutiliza `createDm`/`sendMessage` de
 *     `@/lib/messages/dm.ts` (capa de datos, sin tocar ninguna UI de Mensajes).
 *
 * Nunca lanza: cualquier fallo de red degrada a `[]` / `{ok:false}`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { publish, listProfiles, type PublishInput, type SelectedDestination } from "@/lib/publish/publish";
import { createDm, sendMessage } from "@/lib/messages/dm";
import { fetchProfilesByIds } from "@/lib/social/os-profiles";

export type StoryAudience = "personal" | "publica" | "grupo";

export const STORY_DURATION_PRESETS: { label: string; hours: number }[] = [
    { label: "1 hora", hours: 1 },
    { label: "6 horas", hours: 6 },
    { label: "24 horas", hours: 24 },
    { label: "72 horas", hours: 72 },
];
export const DEFAULT_STORY_HOURS = 24;

export interface NetworkStoryLocation {
    lat: number;
    lng: number;
    label?: string;
}

export interface NetworkStory {
    postId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    mediaKind: "image" | "video";
    url: string;
    caption?: string;
    createdAt: string;
    expiresAt: string;
    audience: StoryAudience;
    location?: NetworkStoryLocation;
}

interface StoryPostRow {
    id: string;
    author_id: string | null;
    content: Record<string, any> | null;
    post_references: Record<string, any> | null;
    created_at: string | null;
}

function normalizeRow(row: StoryPostRow): NetworkStory | null {
    const content = row.content && typeof row.content === "object" ? (row.content as Record<string, any>) : {};
    const meta = content.meta && typeof content.meta === "object" ? (content.meta as Record<string, any>) : {};
    const url = typeof content.url === "string" ? content.url : "";
    const expiresAt = typeof meta.expiresAt === "string" ? meta.expiresAt : "";
    if (!url || !expiresAt) return null;
    return {
        postId: row.id,
        authorId: row.author_id || "",
        authorName: "Ciudadano StarSeed",
        mediaKind: meta.mediaKind === "video" ? "video" : "image",
        url,
        caption: typeof meta.caption === "string" ? meta.caption : undefined,
        createdAt: row.created_at || new Date().toISOString(),
        expiresAt,
        audience: meta.audience === "personal" || meta.audience === "grupo" ? meta.audience : "publica",
        location:
            meta.location && typeof meta.location === "object"
                ? {
                      lat: Number(meta.location.lat),
                      lng: Number(meta.location.lng),
                      label: typeof meta.location.label === "string" ? meta.location.label : undefined,
                  }
                : undefined,
    };
}

async function enrichAuthors(stories: NetworkStory[]): Promise<NetworkStory[]> {
    const ids = Array.from(new Set(stories.map((s) => s.authorId).filter(Boolean)));
    if (ids.length === 0) return stories;
    try {
        const profiles = await fetchProfilesByIds(ids);
        return stories.map((s) => {
            const p = profiles[s.authorId];
            return p ? { ...s, authorName: p.displayName, authorAvatar: p.avatarUrl } : s;
        });
    } catch {
        return stories;
    }
}

/** Historias públicas activas de TODA la red (para la fila arriba del feed de Cultura). */
export async function fetchPublicActiveStories(limit = 60): Promise<NetworkStory[]> {
    try {
        const supabase = createClient();
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
            .from("posts")
            .select("id, author_id, content, post_references, created_at")
            .eq("post_references->>postKind", "historia")
            .eq("post_references->target->>kind", "red")
            .gt("content->meta->>expiresAt", nowIso)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        const stories = (data as StoryPostRow[]).map(normalizeRow).filter((s): s is NetworkStory => !!s);
        return enrichAuthors(stories);
    } catch {
        return [];
    }
}

/** Mis historias activas (cualquier audiencia) — para la fila en /galeria. */
export async function fetchMyActiveStories(): Promise<NetworkStory[]> {
    try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id;
        if (!uid) return [];
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
            .from("posts")
            .select("id, author_id, content, post_references, created_at")
            .eq("author_id", uid)
            .eq("post_references->>postKind", "historia")
            .gt("content->meta->>expiresAt", nowIso)
            .order("created_at", { ascending: false })
            .limit(100);
        if (error || !Array.isArray(data)) return [];
        const stories = (data as StoryPostRow[]).map(normalizeRow).filter((s): s is NetworkStory => !!s);
        return enrichAuthors(stories);
    } catch {
        return [];
    }
}

export interface ShareStoryInput {
    url: string;
    mime?: string;
    mediaKind: "image" | "video";
    caption?: string;
    hours: number;
    audience: StoryAudience;
    /** ids de página/grupo destino (obligatorio cuando audience === "grupo"). */
    groupIds?: string[];
    location?: NetworkStoryLocation;
}

export interface ShareStoryResult {
    ok: boolean;
    error?: string;
}

/** Publica una historia real vía la API de publicación existente (`publish()`), sin tocarla. */
export async function shareAsStory(input: ShareStoryInput): Promise<ShareStoryResult> {
    const expiresAt = new Date(Date.now() + Math.max(1, input.hours) * 3_600_000).toISOString();

    let destinations: SelectedDestination[];
    if (input.audience === "publica") {
        destinations = [{ kind: "red", id: "feed", label: "Feed público" }];
    } else if (input.audience === "personal") {
        const profiles = await listProfiles();
        const mine = profiles[0];
        if (!mine) return { ok: false, error: "No se encontró tu perfil para publicar la historia." };
        destinations = [{ kind: "perfil", id: mine.id, label: mine.displayName }];
    } else {
        if (!input.groupIds || input.groupIds.length === 0) {
            return { ok: false, error: "Elige al menos un grupo para esta historia." };
        }
        destinations = input.groupIds.map((id) => ({ kind: "grupo" as const, id }));
    }

    const publishInput: PublishInput = {
        type: input.mediaKind === "video" ? "galeria" : "imagen",
        format: input.mediaKind === "video" ? "carrusel" : "single",
        fromProfiles: [],
        destinations,
        postKind: "historia",
        content: {
            url: input.url,
            mainRatio: "auto",
            attachments: [
                {
                    id: `story-${Date.now()}`,
                    kind: input.mediaKind === "video" ? "video" : "imagen",
                    url: input.url,
                    mime: input.mime,
                },
            ],
            meta: {
                expiresAt,
                mediaKind: input.mediaKind,
                audience: input.audience,
                caption: input.caption,
                location: input.location,
            },
        },
    };

    const res = await publish(publishInput);
    if (!res.ok) {
        return { ok: false, error: res.needsAuth ? "Inicia sesión para compartir historias." : "No se pudo publicar la historia." };
    }
    return { ok: true };
}

/** Borra una historia propia (RLS restringe el DELETE al autor). */
export async function deleteStory(postId: string): Promise<boolean> {
    if (!postId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase.from("posts").delete().eq("id", postId);
        return !error;
    } catch {
        return false;
    }
}

/** Responde a una historia por mensaje directo (capa de datos de Mensajes, sin UI). */
export async function replyToStoryByMessage(story: NetworkStory, text: string): Promise<{ ok: boolean; error?: string }> {
    if (!story.authorId) return { ok: false, error: "No se pudo identificar a quien compartió esta historia." };
    const res = await createDm(story.authorId);
    if (!res.ok || !res.thread) return { ok: false, error: res.error || "No se pudo abrir la conversación." };
    const sent = await sendMessage(res.thread.id, {
        body: text,
        attachments: [{ kind: story.mediaKind, url: story.url, name: "Historia" }],
    });
    return { ok: !!sent };
}
