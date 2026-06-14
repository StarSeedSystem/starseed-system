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

// ─────────────────────────────────────────────────────────────────────────────
// CREAR / EDITAR / BORRAR entidades (páginas, grupos, eventos)
//
// RLS exige owner_id = auth.uid() para INSERT y propiedad para UPDATE/DELETE.
// Todas estas funciones fijan owner_id al usuario actual, generan slug desde el
// nombre/título (slugify + sufijo corto si choca con el unique) y devuelven un
// resultado uniforme `{ ok, slug?, needsAuth?, error? }`.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de una mutación de entidad: incluye el `slug` definitivo si tuvo éxito. */
export interface EntityMutationResult {
    ok: boolean;
    slug?: string;
    needsAuth?: boolean;
    error?: string;
}

/** Sufijo aleatorio corto y URL-safe para desambiguar slugs. */
function shortSuffix(): string {
    return Math.random().toString(36).slice(2, 6);
}

/** Genera un slug base desde un texto; si queda vacío, usa un fallback estable. */
function buildSlug(text: string, fallback = "entidad"): string {
    return slugify(text) || `${fallback}-${shortSuffix()}`;
}

/**
 * ¿El error de Supabase corresponde a violación del índice único (slug duplicado)?
 * Postgres devuelve el código `23505` para unique_violation.
 */
function isUniqueViolation(error: any): boolean {
    if (!error) return false;
    const code = error.code || error?.details?.code;
    const msg = (error.message || "").toLowerCase();
    return code === "23505" || msg.includes("duplicate key") || msg.includes("unique");
}

const SLUG_RETRIES = 5;

/** Inputs para crear (slug se autogenera; owner_id se inyecta). */
export interface CreatePageInput {
    name: string;
    kind?: OsPage["kind"];
    description?: string;
    tags?: string[];
    accent?: string;
    avatarUrl?: string;
    coverUrl?: string;
}

export interface CreateGroupInput {
    name: string;
    kind?: OsGroup["kind"];
    description?: string;
    tags?: string[];
    accent?: string;
    avatarUrl?: string;
    coverUrl?: string;
}

export interface CreateEventInput {
    title: string;
    kind?: string;
    description?: string;
    startsAt?: string | null;
    location?: string;
    organizerSlug?: string;
    tags?: string[];
    coverUrl?: string;
}

/** Crea una página fijando owner_id = usuario actual; reintenta si el slug choca. */
export async function createPage(input: CreatePageInput): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    let slug = buildSlug(input.name, "pagina");
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
        const { data, error } = await supabase
            .from("os_pages")
            .insert({
                slug,
                name: input.name,
                kind: input.kind || "pagina",
                description: input.description ?? "",
                tags: input.tags ?? [],
                accent: input.accent || DEFAULT_ACCENT,
                avatar_url: input.avatarUrl ?? null,
                cover_url: input.coverUrl ?? null,
                owner_id: uid,
            })
            .select("slug")
            .single();
        if (!error) return { ok: true, slug: (data as { slug: string })?.slug ?? slug };
        if (isUniqueViolation(error)) {
            slug = `${buildSlug(input.name, "pagina")}-${shortSuffix()}`;
            continue;
        }
        return { ok: false, error: error.message || "error" };
    }
    return { ok: false, error: "No se pudo generar un slug único." };
}

/** Crea un grupo fijando owner_id = usuario actual; reintenta si el slug choca. */
export async function createGroup(input: CreateGroupInput): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    let slug = buildSlug(input.name, "grupo");
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
        const { data, error } = await supabase
            .from("os_groups")
            .insert({
                slug,
                name: input.name,
                kind: input.kind || "colectivo",
                description: input.description ?? "",
                tags: input.tags ?? [],
                accent: input.accent || DEFAULT_ACCENT,
                avatar_url: input.avatarUrl ?? null,
                cover_url: input.coverUrl ?? null,
                owner_id: uid,
            })
            .select("slug")
            .single();
        if (!error) return { ok: true, slug: (data as { slug: string })?.slug ?? slug };
        if (isUniqueViolation(error)) {
            slug = `${buildSlug(input.name, "grupo")}-${shortSuffix()}`;
            continue;
        }
        return { ok: false, error: error.message || "error" };
    }
    return { ok: false, error: "No se pudo generar un slug único." };
}

/** Crea un evento fijando owner_id = usuario actual; reintenta si el slug choca. */
export async function createEvent(input: CreateEventInput): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    let slug = buildSlug(input.title, "evento");
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
        const { data, error } = await supabase
            .from("os_events")
            .insert({
                slug,
                title: input.title,
                kind: input.kind || "encuentro",
                description: input.description ?? "",
                starts_at: input.startsAt ?? null,
                location: input.location ?? "",
                organizer_slug: input.organizerSlug ?? "",
                tags: input.tags ?? [],
                cover_url: input.coverUrl ?? null,
                owner_id: uid,
            })
            .select("slug")
            .single();
        if (!error) return { ok: true, slug: (data as { slug: string })?.slug ?? slug };
        if (isUniqueViolation(error)) {
            slug = `${buildSlug(input.title, "evento")}-${shortSuffix()}`;
            continue;
        }
        return { ok: false, error: error.message || "error" };
    }
    return { ok: false, error: "No se pudo generar un slug único." };
}

// ── Subida de medios a Supabase Storage (bucket público `os-media`) ──

/** Resultado uniforme de una subida de medios. */
export interface UploadMediaResult {
    ok: boolean;
    url?: string;
    needsAuth?: boolean;
    error?: string;
}

/** Bucket público de Storage donde se guardan avatares y portadas. */
const OS_MEDIA_BUCKET = "os-media";

/** Sanitiza el nombre de archivo a algo URL-safe para usar como ruta en Storage. */
function sanitizeFileName(name: string): string {
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    const safeBase =
        base
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60) || "media";
    const safeExt = ext.replace(/[^a-z0-9]/g, "").slice(0, 8);
    return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * Sube un archivo de imagen (avatar o portada) al bucket público `os-media` y
 * devuelve su URL pública. Exige sesión (RLS de Storage permite INSERT/UPDATE a
 * usuarios autenticados). La ruta queda namespaced por usuario:
 *   `${userId}/${kind}-${timestamp}-${nombreSanitizado}`
 * SSR-safe: usa el cliente de navegador (createClient) en los handlers del cliente.
 */
export async function uploadEntityMedia(
    file: File,
    kind: "avatar" | "cover",
): Promise<UploadMediaResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };

    const supabase = createClient();
    const safeName = sanitizeFileName(file.name || `${kind}.png`);
    const path = `${uid}/${kind}-${Date.now()}-${safeName}`;

    try {
        const { error } = await supabase.storage
            .from(OS_MEDIA_BUCKET)
            .upload(path, file, {
                upsert: true,
                cacheControl: "3600",
                contentType: file.type || undefined,
            });
        if (error) throw error;

        const { data } = supabase.storage.from(OS_MEDIA_BUCKET).getPublicUrl(path);
        const url = data?.publicUrl;
        if (!url) return { ok: false, error: "No se pudo obtener la URL pública." };
        return { ok: true, url };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error al subir el archivo." };
    }
}

// ── Updates (solo dueño; RLS valida owner_id = auth.uid()) ──

export type UpdatePageInput = Partial<CreatePageInput>;
export type UpdateGroupInput = Partial<CreateGroupInput>;
export type UpdateEventInput = Partial<CreateEventInput>;

export async function updatePage(
    slug: string,
    input: UpdatePageInput,
): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.description !== undefined) patch.description = input.description;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.accent !== undefined) patch.accent = input.accent;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl || null;
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl || null;
    try {
        const { error } = await supabase
            .from("os_pages")
            .update(patch)
            .eq("slug", slug)
            .eq("owner_id", uid);
        if (error) throw error;
        return { ok: true, slug };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

export async function updateGroup(
    slug: string,
    input: UpdateGroupInput,
): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.description !== undefined) patch.description = input.description;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.accent !== undefined) patch.accent = input.accent;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl || null;
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl || null;
    try {
        const { error } = await supabase
            .from("os_groups")
            .update(patch)
            .eq("slug", slug)
            .eq("owner_id", uid);
        if (error) throw error;
        return { ok: true, slug };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

export async function updateEvent(
    slug: string,
    input: UpdateEventInput,
): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.description !== undefined) patch.description = input.description;
    if (input.startsAt !== undefined) patch.starts_at = input.startsAt || null;
    if (input.location !== undefined) patch.location = input.location;
    if (input.organizerSlug !== undefined) patch.organizer_slug = input.organizerSlug;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.coverUrl !== undefined) patch.cover_url = input.coverUrl || null;
    try {
        const { error } = await supabase
            .from("os_events")
            .update(patch)
            .eq("slug", slug)
            .eq("owner_id", uid);
        if (error) throw error;
        return { ok: true, slug };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

/** Borra una entidad por tipo + slug (solo dueño; RLS valida owner_id). */
export async function deleteEntity(
    type: "page" | "group" | "event",
    slug: string,
): Promise<EntityMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const table = type === "page" ? "os_pages" : type === "group" ? "os_groups" : "os_events";
    try {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq("slug", slug)
            .eq("owner_id", uid);
        if (error) throw error;
        return { ok: true, slug };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPIEDAD: ¿es el usuario actual dueño de una entidad? (lee owner_id)
// ─────────────────────────────────────────────────────────────────────────────

/** Devuelve true si el usuario actual es owner_id de la entidad (false si anónimo). */
export async function isEntityOwner(
    type: "page" | "group" | "event",
    slug: string,
): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid) return false;
    const supabase = createClient();
    const table = type === "page" ? "os_pages" : type === "group" ? "os_groups" : "os_events";
    try {
        const { data } = await supabase
            .from(table)
            .select("owner_id")
            .eq("slug", slug)
            .maybeSingle();
        return (data as { owner_id?: string } | null)?.owner_id === uid;
    } catch {
        return false;
    }
}

/** Lista las entidades (páginas, grupos, eventos) propiedad del usuario actual. */
export async function fetchMyEntities(): Promise<{
    pages: OsPage[];
    groups: OsGroup[];
    events: OsEvent[];
}> {
    const uid = await getCurrentUserId();
    if (!uid) return { pages: [], groups: [], events: [] };
    const supabase = createClient();
    const [pagesRes, groupsRes, eventsRes] = await Promise.all([
        supabase.from("os_pages").select("*").eq("owner_id", uid),
        supabase.from("os_groups").select("*").eq("owner_id", uid),
        supabase.from("os_events").select("*").eq("owner_id", uid),
    ]);
    return {
        pages: ((pagesRes.data as PageRow[]) || []).map(normalizePage),
        groups: ((groupsRes.data as GroupRow[]) || []).map(normalizeGroup),
        events: ((eventsRes.data as EventRow[]) || []).map(normalizeEvent),
    };
}
