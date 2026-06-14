// src/lib/os-social.ts
// ─────────────────────────────────────────────────────────────────────────────
// Capa de acceso a las entidades sociales REALES de StarSeed OS sobre Supabase
// (tablas os_*). Provee:
//   · Tipos tipados (OsPage / OsGroup / OsEvent / OsPost).
//   · Funciones de lectura (selecciones públicas, permitidas a anónimos por RLS).
//   · Funciones de escritura (follow / membership / attendance / publicar) que
//     exigen sesión (RLS comprueba auth.uid()).
//   · Helpers de FUSIÓN con los datos de ejemplo de `@/data/sample-entities` y
//     `@/data/sample-events`, para que la UI nunca muestre pantallas vacías.
//
// Filosofía de fallback: si Supabase falla, no está configurado o devuelve vacío,
// devolvemos los datos de ejemplo normalizados al mismo shape, marcados con
// `isSample: true`. Las escrituras, si no hay sesión, devuelven `{ needsAuth }`.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import {
    samplePages,
    sampleGroups,
    type SamplePage,
    type SampleGroup,
} from "@/data/sample-entities";
import { sampleEvents, type SampleEvent } from "@/data/sample-events";
import { pageSlug, groupSlug, slugify } from "@/lib/entity-links";

// ── Tipos del dominio OS (normalizados desde las tablas os_*) ──

export type OsEntityType = "page" | "group" | "event" | "profile";

export interface OsPage {
    id: string;
    slug: string;
    name: string;
    kind: "perfil" | "comunidad" | "proyecto" | "pagina";
    description: string;
    tags: string[];
    accent: string;
    avatarUrl?: string;
    coverUrl?: string;
    memberCount: number;
    /** true si proviene de los datos de ejemplo (no de Supabase). */
    isSample?: boolean;
}

export interface OsGroup {
    id: string;
    slug: string;
    name: string;
    kind: "asamblea" | "circulo" | "colectivo";
    description: string;
    tags: string[];
    accent: string;
    avatarUrl?: string;
    coverUrl?: string;
    memberCount: number;
    isSample?: boolean;
}

export interface OsEvent {
    id: string;
    slug: string;
    title: string;
    kind: string;
    description: string;
    startsAt: string | null;
    location: string;
    organizerSlug: string;
    tags: string[];
    coverUrl?: string;
    attendeeCount: number;
    isSample?: boolean;
}

export interface OsPost {
    id: string;
    authorId?: string;
    authorName: string;
    entityType: OsEntityType;
    entitySlug: string;
    body: string;
    mediaUrl?: string;
    createdAt: string;
    isSample?: boolean;
}

const DEFAULT_ACCENT = "#E9C46A";

// ── Normalizadores de filas crudas (snake_case → camelCase) ──

interface PageRow {
    id: string;
    slug: string;
    name: string;
    kind?: string | null;
    description?: string | null;
    tags?: string[] | null;
    accent?: string | null;
    avatar_url?: string | null;
    cover_url?: string | null;
    member_count?: number | null;
}

interface GroupRow extends Omit<PageRow, "kind"> {
    kind?: string | null;
}

interface EventRow {
    id: string;
    slug: string;
    title: string;
    kind?: string | null;
    description?: string | null;
    starts_at?: string | null;
    location?: string | null;
    organizer_slug?: string | null;
    tags?: string[] | null;
    cover_url?: string | null;
    attendee_count?: number | null;
}

interface PostRow {
    id: string;
    author_id?: string | null;
    author_name?: string | null;
    entity_type?: string | null;
    entity_slug?: string | null;
    body?: string | null;
    media_url?: string | null;
    created_at?: string | null;
}

function normalizePage(row: PageRow): OsPage {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        kind: (row.kind as OsPage["kind"]) || "pagina",
        description: row.description || "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        accent: row.accent || DEFAULT_ACCENT,
        avatarUrl: row.avatar_url || undefined,
        coverUrl: row.cover_url || undefined,
        memberCount: typeof row.member_count === "number" ? row.member_count : 0,
    };
}

function normalizeGroup(row: GroupRow): OsGroup {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        kind: (row.kind as OsGroup["kind"]) || "colectivo",
        description: row.description || "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        accent: row.accent || DEFAULT_ACCENT,
        avatarUrl: row.avatar_url || undefined,
        coverUrl: row.cover_url || undefined,
        memberCount: typeof row.member_count === "number" ? row.member_count : 0,
    };
}

function normalizeEvent(row: EventRow): OsEvent {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        kind: row.kind || "encuentro",
        description: row.description || "",
        startsAt: row.starts_at || null,
        location: row.location || "",
        organizerSlug: row.organizer_slug || "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        coverUrl: row.cover_url || undefined,
        attendeeCount: typeof row.attendee_count === "number" ? row.attendee_count : 0,
    };
}

function normalizePost(row: PostRow): OsPost {
    return {
        id: row.id,
        authorId: row.author_id || undefined,
        authorName: row.author_name || "Ciudadano StarSeed",
        entityType: (row.entity_type as OsEntityType) || "page",
        entitySlug: row.entity_slug || "",
        body: row.body || "",
        mediaUrl: row.media_url || undefined,
        createdAt: row.created_at || new Date().toISOString(),
    };
}

// ── Adaptadores de datos de EJEMPLO al shape OS (para el fallback) ──

function samplePageToOs(p: SamplePage): OsPage {
    // Mapea el `kind` de muestra (ley/curso/exposicion/comunidad/obra) al de OS.
    const kind: OsPage["kind"] = p.kind === "comunidad" ? "comunidad" : "pagina";
    return {
        id: p.id,
        slug: pageSlug(p),
        name: p.title,
        kind,
        description: p.description,
        tags: p.tags,
        accent: p.accent || DEFAULT_ACCENT,
        coverUrl: p.cover,
        memberCount: p.members,
        isSample: true,
    };
}

function sampleGroupToOs(g: SampleGroup): OsGroup {
    return {
        id: g.id,
        slug: groupSlug(g),
        name: g.name,
        kind: g.kind === "asamblea" ? "asamblea" : g.kind === "circulo" ? "circulo" : "colectivo",
        description: g.description,
        tags: [],
        accent: g.accent || DEFAULT_ACCENT,
        avatarUrl: g.avatar,
        coverUrl: g.cover,
        memberCount: g.members,
        isSample: true,
    };
}

function sampleEventToOs(e: SampleEvent): OsEvent {
    return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        kind: e.kind,
        description: e.description,
        startsAt: e.startsAt,
        location: e.location,
        organizerSlug: e.organizerPageSlug,
        tags: e.tags,
        coverUrl: e.cover,
        attendeeCount: e.attendees,
        isSample: true,
    };
}

export const samplePagesAsOs = (): OsPage[] => samplePages.map(samplePageToOs);
export const sampleGroupsAsOs = (): OsGroup[] => sampleGroups.map(sampleGroupToOs);
export const sampleEventsAsOs = (): OsEvent[] => sampleEvents.map(sampleEventToOs);

// ── Helpers de fusión (Supabase tiene prioridad; ejemplo rellena huecos) ──

/** Une dos listas por `slug`, prefiriendo las filas reales sobre las de ejemplo. */
function mergeBySlug<T extends { slug: string }>(real: T[], sample: T[]): T[] {
    const bySlug = new Map<string, T>();
    for (const s of sample) bySlug.set(s.slug, s);
    for (const r of real) bySlug.set(r.slug, r); // las reales pisan las de ejemplo
    return Array.from(bySlug.values());
}

export const mergePages = (real: OsPage[], sample = samplePagesAsOs()) =>
    mergeBySlug(real, sample);
export const mergeGroups = (real: OsGroup[], sample = sampleGroupsAsOs()) =>
    mergeBySlug(real, sample);
export const mergeEvents = (real: OsEvent[], sample = sampleEventsAsOs()) =>
    mergeBySlug(real, sample);

// ── Resolución tolerante por slug O id (incluye fallback a ejemplo) ──

export function findSamplePageBySlug(slug: string): OsPage | undefined {
    const key = slugify(slug);
    return samplePagesAsOs().find((p) => p.slug === key || p.id === slug || slugify(p.id) === key);
}
export function findSampleGroupBySlug(slug: string): OsGroup | undefined {
    const key = slugify(slug);
    return sampleGroupsAsOs().find((g) => g.slug === key || g.id === slug || slugify(g.id) === key);
}
export function findSampleEventBySlug(slug: string): OsEvent | undefined {
    return sampleEventsAsOs().find((e) => e.slug === slug || e.id === slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// LECTURAS (SELECT públicos — RLS permite anónimos)
// ─────────────────────────────────────────────────────────────────────────────

/** Páginas reales de Supabase. Lanza si error para que el hook decida el fallback. */
export async function fetchPages(): Promise<OsPage[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_pages")
        .select("*")
        .order("member_count", { ascending: false });
    if (error) throw error;
    return ((data as PageRow[]) || []).map(normalizePage);
}

export async function fetchGroups(): Promise<OsGroup[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_groups")
        .select("*")
        .order("member_count", { ascending: false });
    if (error) throw error;
    return ((data as GroupRow[]) || []).map(normalizeGroup);
}

export async function fetchEvents(): Promise<OsEvent[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_events")
        .select("*")
        .order("starts_at", { ascending: true });
    if (error) throw error;
    return ((data as EventRow[]) || []).map(normalizeEvent);
}

export async function fetchPageBySlug(slug: string): Promise<OsPage | null> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_pages")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
    if (error) throw error;
    return data ? normalizePage(data as PageRow) : null;
}

export async function fetchGroupBySlug(slug: string): Promise<OsGroup | null> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_groups")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
    if (error) throw error;
    return data ? normalizeGroup(data as GroupRow) : null;
}

export async function fetchEventBySlug(slug: string): Promise<OsEvent | null> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_events")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
    if (error) throw error;
    return data ? normalizeEvent(data as EventRow) : null;
}

/** Publicaciones de una entidad concreta (por tipo + slug). */
export async function fetchPosts(
    entityType: OsEntityType,
    entitySlug: string,
    limit = 30,
): Promise<OsPost[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("os_posts")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_slug", entitySlug)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return ((data as PostRow[]) || []).map(normalizePost);
}

// ─────────────────────────────────────────────────────────────────────────────
// SESIÓN
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve el user id actual o null (sin sesión). SSR-safe (solo en cliente). */
export async function getCurrentUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

// Resultado uniforme de mutaciones: needsAuth si no hay sesión; ok/active si fue bien.
export interface MutationResult {
    ok: boolean;
    needsAuth?: boolean;
    active?: boolean;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCRITURAS (requieren sesión; RLS valida follower_id/user_id/author_id = auth.uid())
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Sigue el usuario actual esta página? (false si no hay sesión). */
export async function isFollowing(pageSlugKey: string): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    const supabase = createClient();
    const { data } = await supabase
        .from("os_follows")
        .select("page_slug")
        .eq("follower_id", uid)
        .eq("page_slug", pageSlugKey)
        .maybeSingle();
    return Boolean(data);
}

export async function setFollow(pageSlugKey: string, follow: boolean): Promise<MutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    try {
        if (follow) {
            const { error } = await supabase
                .from("os_follows")
                .upsert({ follower_id: uid, page_slug: pageSlugKey });
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from("os_follows")
                .delete()
                .eq("follower_id", uid)
                .eq("page_slug", pageSlugKey);
            if (error) throw error;
        }
        return { ok: true, active: follow };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

export async function isMember(groupSlugKey: string): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    const supabase = createClient();
    const { data } = await supabase
        .from("os_memberships")
        .select("group_slug")
        .eq("user_id", uid)
        .eq("group_slug", groupSlugKey)
        .maybeSingle();
    return Boolean(data);
}

export async function setMembership(
    groupSlugKey: string,
    join: boolean,
    role = "miembro",
): Promise<MutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    try {
        if (join) {
            const { error } = await supabase
                .from("os_memberships")
                .upsert({ user_id: uid, group_slug: groupSlugKey, role });
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from("os_memberships")
                .delete()
                .eq("user_id", uid)
                .eq("group_slug", groupSlugKey);
            if (error) throw error;
        }
        return { ok: true, active: join };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

export async function getAttendance(eventSlugKey: string): Promise<string | null> {
    const uid = await getCurrentUserId();
    if (!uid) return null;
    const supabase = createClient();
    const { data } = await supabase
        .from("os_event_attendance")
        .select("status")
        .eq("user_id", uid)
        .eq("event_slug", eventSlugKey)
        .maybeSingle();
    return (data as { status?: string } | null)?.status ?? null;
}

/** Establece la asistencia. `status` null elimina la asistencia. */
export async function setAttendance(
    eventSlugKey: string,
    status: string | null,
): Promise<MutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    try {
        if (status) {
            const { error } = await supabase
                .from("os_event_attendance")
                .upsert({ user_id: uid, event_slug: eventSlugKey, status });
            if (error) throw error;
            return { ok: true, active: true };
        } else {
            const { error } = await supabase
                .from("os_event_attendance")
                .delete()
                .eq("user_id", uid)
                .eq("event_slug", eventSlugKey);
            if (error) throw error;
            return { ok: true, active: false };
        }
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

export interface CreatePostInput {
    entityType: OsEntityType;
    entitySlug: string;
    body: string;
    mediaUrl?: string;
    authorName?: string;
}

export async function createPost(input: CreatePostInput): Promise<MutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    try {
        const { error } = await supabase.from("os_posts").insert({
            author_id: uid,
            author_name: input.authorName || "Ciudadano StarSeed",
            entity_type: input.entityType,
            entity_slug: input.entitySlug,
            body: input.body,
            media_url: input.mediaUrl ?? null,
        });
        if (error) throw error;
        return { ok: true, active: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}
