"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Directorio de usuarios (os_profiles) — búsqueda + recomendaciones
 * ---------------------------------------------------------------------------
 * Capa de datos sobre `public.os_profiles` en la base del OS: Supabase
 * **`nxstilnyidvkqeosofuh`** (ref corregida el 2026-07-12 -- decia
 * `dzkjapinnewkxzjltadv`, que es el proyecto de Nexus/Cafe. La tabla SI existe
 * en el OS; verificado):
 *   os_profiles(user_id, username unique, display_name, avatar_url, bio,
 *               tags[], searchable, updated_at)
 *   RLS: SELECT → searchable=true OR propio; UPSERT → solo propio (user_id=auth.uid()).
 *
 * Responsabilidades:
 *   · seedMyProfile()   — siembra/actualiza el perfil propio al iniciar sesión
 *                          (username derivado de email/metadata, editable después).
 *   · searchUsers(q)     — búsqueda de usuarios en TODA la red por username/nombre.
 *   · searchGroups(q)    — búsqueda de grupos/páginas por nombre/slug/tags
 *                          (reutiliza os_pages/os_groups ya existentes; no las toca).
 *   · recommendations()  — sugerencias honestas y simples: tags compartidos +
 *                          membresías comunes (os_memberships), sin IA de red.
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a [] sin sesión/red/tabla.
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export interface OsProfile {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio: string;
    tags: string[];
    searchable: boolean;
    updatedAt: string;
}

interface ProfileRow {
    user_id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    tags?: string[] | null;
    searchable?: boolean | null;
    updated_at?: string | null;
}

function normalizeProfile(row: ProfileRow): OsProfile {
    return {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name || row.username,
        avatarUrl: row.avatar_url || undefined,
        bio: row.bio || "",
        tags: Array.isArray(row.tags) ? row.tags : [],
        searchable: row.searchable !== false,
        updatedAt: row.updated_at || new Date().toISOString(),
    };
}

/** Resultado de búsqueda de un grupo/página (unifica os_pages + os_groups). */
export interface SocialGroupHit {
    id: string;
    slug: string;
    name: string;
    kind: "pagina" | "comunidad" | "grupo";
    description: string;
    avatarUrl?: string;
    memberCount: number;
    tags: string[];
}

/** Sugerencia razonada de usuario (para "Personas que quizá conozcas"). */
export interface UserRecommendation extends OsProfile {
    /** Por qué se sugiere (honesto y simple: tags o grupos en común). */
    reason: string;
    /** Nº de señales compartidas (para ordenar). */
    score: number;
}

/* ────────────────────────────── Helpers ────────────────────────────────── */

function isClient(): boolean {
    return typeof window !== "undefined";
}

/** Slugifica un texto a un username URL-safe (solo minúsculas/números/guion bajo). */
function usernameSlug(input: string): string {
    return (input || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_{2,}/g, "_")
        .slice(0, 24) || "starseeder";
}

/** Sufijo corto para desambiguar usernames que colisionen. */
function shortSuffix(): string {
    return Math.random().toString(36).slice(2, 6);
}

/** Escapa comodines de `ilike` (`%`, `_`) en texto libre del usuario. */
function escapeLike(q: string): string {
    return q.replace(/[%_]/g, (m) => `\\${m}`);
}

async function getCurrentUser(): Promise<{ id: string; email?: string; metadata: Record<string, unknown> } | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) return null;
        return {
            id: data.user.id,
            email: data.user.email ?? undefined,
            metadata: (data.user.user_metadata as Record<string, unknown>) ?? {},
        };
    } catch {
        return null;
    }
}

/* ───────────────────────────── seedMyProfile ───────────────────────────── */

/**
 * Siembra (o confirma) el perfil propio en `os_profiles` al haber sesión.
 * Deriva `username` del email (parte local) o de `user_metadata` (nombre),
 * garantiza unicidad reintentando con sufijo si choca, y NUNCA sobreescribe
 * un `display_name`/`bio`/`tags` ya personalizados por el usuario (solo crea
 * si no existe la fila; si ya existe, no toca nada — es editable aparte).
 * Defensivo: nunca lanza; devuelve el perfil (existente o recién creado) o null.
 */
export async function seedMyProfile(): Promise<OsProfile | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    const supabase = createClient();

    try {
        // ¿Ya existe? No lo tocamos (evita pisar ediciones del usuario).
        const { data: existing } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
        if (existing) return normalizeProfile(existing as ProfileRow);
    } catch {
        /* sigue al intento de creación igualmente */
    }

    const metaName =
        (user.metadata?.["full_name"] as string) ||
        (user.metadata?.["name"] as string) ||
        (user.metadata?.["user_name"] as string) ||
        "";
    const emailLocal = user.email ? user.email.split("@")[0] : "";
    const baseUsername = usernameSlug(metaName || emailLocal || "starseeder");
    const displayName = metaName || emailLocal || "Ciudadano StarSeed";

    let username = baseUsername;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const { data, error } = await supabase
                .from("os_profiles")
                .insert({
                    user_id: user.id,
                    username,
                    display_name: displayName,
                    bio: "",
                    tags: [],
                    searchable: true,
                })
                .select("*")
                .single();
            if (!error && data) return normalizeProfile(data as ProfileRow);
            const code = (error as { code?: string } | null)?.code;
            const msg = (error?.message || "").toLowerCase();
            if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
                username = `${baseUsername}_${shortSuffix()}`;
                continue;
            }
            // Error distinto (RLS, red…): intenta releer por si otra pestaña ya lo creó.
            break;
        } catch {
            break;
        }
    }

    // Último recurso: releer (por si una carrera con otra pestaña ya insertó).
    try {
        const { data } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
        return data ? normalizeProfile(data as ProfileRow) : null;
    } catch {
        return null;
    }
}

/** Actualiza campos editables del perfil propio (username/display_name/bio/tags/searchable). */
export interface UpdateMyProfileInput {
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
    bio?: string;
    tags?: string[];
    searchable?: boolean;
}

export interface ProfileMutationResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    profile?: OsProfile;
}

export async function updateMyProfile(input: UpdateMyProfileInput): Promise<ProfileMutationResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if (input.username !== undefined) patch.username = usernameSlug(input.username);
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.searchable !== undefined) patch.searchable = input.searchable;
    try {
        let { data, error } = await supabase
            .from("os_profiles")
            .update(patch)
            .eq("user_id", user.id)
            .select("*")
            .single();
        
        if (error && error.code === 'PGRST116') {
            // No profile exists yet, insert instead
            const insertPatch = { ...patch, user_id: user.id };
            const res = await supabase
                .from("os_profiles")
                .insert(insertPatch)
                .select("*")
                .single();
            data = res.data;
            error = res.error;
        }

        if (error) throw error;
        return { ok: true, profile: normalizeProfile(data as ProfileRow) };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

/** Perfil propio (o null sin sesión / sin fila todavía). */
export async function fetchMyProfile(): Promise<OsProfile | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
        return data ? normalizeProfile(data as ProfileRow) : null;
    } catch {
        return null;
    }
}

/** Perfil público por username (para tarjetas/menciones). */
export async function fetchProfileByUsername(username: string): Promise<OsProfile | null> {
    if (!username) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase
            .from("os_profiles")
            .select("*")
            .eq("username", username)
            .maybeSingle();
        return data ? normalizeProfile(data as ProfileRow) : null;
    } catch {
        return null;
    }
}

/** Perfiles públicos por lote de user_id (para pintar remitentes en hilos). */
export async function fetchProfilesByIds(userIds: string[]): Promise<Record<string, OsProfile>> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    const out: Record<string, OsProfile> = {};
    if (!ids.length) return out;
    try {
        const supabase = createClient();
        const { data } = await supabase.from("os_profiles").select("*").in("user_id", ids);
        for (const row of (data as ProfileRow[]) || []) {
            out[row.user_id] = normalizeProfile(row);
        }
    } catch {
        /* degrada a objeto parcial/vacío */
    }
    return out;
}

/* ───────────────────────────── searchUsers ─────────────────────────────── */

/**
 * Busca usuarios en TODA la red por username o nombre visible. RLS ya filtra
 * por `searchable=true OR propio`; excluye al usuario actual del resultado
 * (no tiene sentido "añadirte a ti mismo" en el buscador de contactos).
 * Nunca lanza: [] ante cualquier fallo.
 */
export async function searchUsers(q: string, limit = 12): Promise<OsProfile[]> {
    const term = (q ?? "").trim();
    if (term.length < 1) return [];
    try {
        const supabase = createClient();
        const like = `%${escapeLike(term)}%`;
        const me = await getCurrentUser();
        const query = supabase
            .from("os_profiles")
            .select("*")
            .or(`username.ilike.${like},display_name.ilike.${like}`)
            .limit(limit + (me ? 1 : 0));
        const { data, error } = await query;
        if (error || !Array.isArray(data)) return [];
        const rows = (data as ProfileRow[])
            .filter((r) => !me || r.user_id !== me.id)
            .slice(0, limit);
        return rows.map(normalizeProfile);
    } catch {
        return [];
    }
}

/* ───────────────────────────── searchGroups ────────────────────────────── */

/**
 * Busca grupos/comunidades/páginas por nombre, slug o etiquetas — reutiliza
 * las tablas `os_pages` y `os_groups` ya existentes (lectura pública por RLS),
 * sin duplicar esa capa. Devuelve un tipo unificado listo para tarjetas.
 */
export async function searchGroups(q: string, limit = 12): Promise<SocialGroupHit[]> {
    const term = (q ?? "").trim();
    if (term.length < 1) return [];
    const like = `%${escapeLike(term)}%`;
    const supabase = createClient();

    const [pagesRes, groupsRes] = await Promise.all([
        (async () => {
            try {
                const { data } = await supabase
                    .from("os_pages")
                    .select("id, slug, name, kind, description, avatar_url, member_count, tags")
                    .or(`name.ilike.${like},slug.ilike.${like}`)
                    .limit(limit);
                return Array.isArray(data) ? data : [];
            } catch {
                return [];
            }
        })(),
        (async () => {
            try {
                const { data } = await supabase
                    .from("os_groups")
                    .select("id, slug, name, kind, description, avatar_url, member_count, tags")
                    .or(`name.ilike.${like},slug.ilike.${like}`)
                    .limit(limit);
                return Array.isArray(data) ? data : [];
            } catch {
                return [];
            }
        })(),
    ]);

    const pageHits: SocialGroupHit[] = pagesRes.map((r: any) => ({
        id: String(r.id),
        slug: r.slug,
        name: r.name,
        kind: r.kind === "comunidad" ? "comunidad" : "pagina",
        description: r.description || "",
        avatarUrl: r.avatar_url || undefined,
        memberCount: typeof r.member_count === "number" ? r.member_count : 0,
        tags: Array.isArray(r.tags) ? r.tags : [],
    }));
    const groupHits: SocialGroupHit[] = groupsRes.map((r: any) => ({
        id: String(r.id),
        slug: r.slug,
        name: r.name,
        kind: "grupo",
        description: r.description || "",
        avatarUrl: r.avatar_url || undefined,
        memberCount: typeof r.member_count === "number" ? r.member_count : 0,
        tags: Array.isArray(r.tags) ? r.tags : [],
    }));

    // También busca por coincidencia de tag exacto (además del ilike de nombre/slug).
    let tagPageHits: SocialGroupHit[] = [];
    try {
        const { data } = await supabase
            .from("os_pages")
            .select("id, slug, name, kind, description, avatar_url, member_count, tags")
            .contains("tags", [term])
            .limit(limit);
        tagPageHits = ((data as any[]) || []).map((r) => ({
            id: String(r.id),
            slug: r.slug,
            name: r.name,
            kind: r.kind === "comunidad" ? "comunidad" : "pagina",
            description: r.description || "",
            avatarUrl: r.avatar_url || undefined,
            memberCount: typeof r.member_count === "number" ? r.member_count : 0,
            tags: Array.isArray(r.tags) ? r.tags : [],
        }));
    } catch {
        /* opcional: si falla, seguimos solo con name/slug */
    }

    const bySlug = new Map<string, SocialGroupHit>();
    for (const h of [...pageHits, ...groupHits, ...tagPageHits]) bySlug.set(`${h.kind}:${h.slug}`, h);
    return Array.from(bySlug.values()).slice(0, limit);
}

/* ───────────────────────────── recommendations ─────────────────────────── */

/**
 * Recomienda usuarios "honestos y simples": personas que comparten al menos
 * una etiqueta de perfil O pertenecen a un grupo (os_memberships) en común
 * con el usuario actual. Sin sesión devuelve []. Nunca lanza.
 *
 * Heurística (transparente, sin IA de red):
 *   +2 por cada grupo compartido (os_memberships.group_slug en común)
 *   +1 por cada tag de perfil compartido
 * Se ordena por score desc y se recorta a `limit`.
 */
export async function recommendations(limit = 8): Promise<UserRecommendation[]> {
    const me = await getCurrentUser();
    if (!me) return [];
    const supabase = createClient();

    try {
        const [myProfileRes, myMembershipsRes] = await Promise.all([
            supabase.from("os_profiles").select("tags").eq("user_id", me.id).maybeSingle(),
            supabase.from("os_memberships").select("group_slug").eq("user_id", me.id),
        ]);

        const myTags: string[] = Array.isArray(myProfileRes.data?.tags) ? myProfileRes.data!.tags : [];
        const myGroupSlugs: string[] = ((myMembershipsRes.data as { group_slug: string }[]) || []).map(
            (r) => r.group_slug,
        );

        if (!myTags.length && !myGroupSlugs.length) {
            // Sin señales propias: no inventamos "por qué" — devolvemos [] honestamente
            // (la UI puede mostrar "añade etiquetas a tu perfil para recibir sugerencias").
            return [];
        }

        const scoreByUser = new Map<string, { score: number; reasons: Set<string> }>();

        // Señal 1: compañeros de grupo (os_memberships con el mismo group_slug).
        if (myGroupSlugs.length) {
            try {
                const { data } = await supabase
                    .from("os_memberships")
                    .select("user_id, group_slug")
                    .in("group_slug", myGroupSlugs)
                    .neq("user_id", me.id);
                for (const row of (data as { user_id: string; group_slug: string }[]) || []) {
                    const entry = scoreByUser.get(row.user_id) ?? { score: 0, reasons: new Set<string>() };
                    entry.score += 2;
                    entry.reasons.add(`Comparte el grupo «${row.group_slug}» contigo`);
                    scoreByUser.set(row.user_id, entry);
                }
            } catch {
                /* sin membresías comunes disponibles: sigue con tags */
            }
        }

        // Señal 2: tags de perfil compartidos.
        if (myTags.length) {
            try {
                const { data } = await supabase
                    .from("os_profiles")
                    .select("user_id, tags")
                    .overlaps("tags", myTags)
                    .neq("user_id", me.id)
                    .limit(50);
                for (const row of (data as { user_id: string; tags: string[] }[]) || []) {
                    const shared = (row.tags || []).filter((t) => myTags.includes(t));
                    if (!shared.length) continue;
                    const entry = scoreByUser.get(row.user_id) ?? { score: 0, reasons: new Set<string>() };
                    entry.score += shared.length;
                    entry.reasons.add(`Etiquetas en común: ${shared.slice(0, 3).join(", ")}`);
                    scoreByUser.set(row.user_id, entry);
                }
            } catch {
                /* overlaps puede no estar disponible en algún entorno; degrada sin romper */
            }
        }

        if (!scoreByUser.size) return [];

        const topIds = Array.from(scoreByUser.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, limit)
            .map(([id]) => id);

        const { data: profilesData } = await supabase.from("os_profiles").select("*").in("user_id", topIds);
        const profiles = ((profilesData as ProfileRow[]) || []).map(normalizeProfile);

        return profiles
            .map((p) => {
                const entry = scoreByUser.get(p.userId)!;
                return {
                    ...p,
                    score: entry.score,
                    reason: Array.from(entry.reasons)[0] || "Parte del ecosistema StarSeed",
                } as UserRecommendation;
            })
            .sort((a, b) => b.score - a.score);
    } catch {
        return [];
    }
}
