"use client";

/*
 * profiles — PERFILES MÚLTIPLES por cuenta (personal/cívico/artístico/
 * profesional/custom). Cada cuenta puede tener varias facetas públicas
 * vinculadas a la misma Cuenta soberana (dualidad Cuenta/Perfil, CLAUDE.md §6).
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md §10.
 * Backend en la base del OS: Supabase **`nxstilnyidvkqeosofuh`** (ref corregida
 * el 2026-07-12 -- la cabecera decia `dzkjapinnewkxzjltadv`, que es el proyecto
 * de Nexus/Cafe, NO el del OS. La tabla SI existe en el OS; verificado):
 *   os_account_profiles(id, account, handle unique, name, kind, avatar_url,
 *   cover_url, bio, is_default, created_at, updated_at) — RLS: lectura para
 *   todos (facetas públicas), escritura solo del dueño (account=auth.uid()).
 *   Realtime ON.
 *
 * Distinto de:
 *   · src/components/profile/profile-switcher.tsx → identidad de LA CUENTA
 *     (tabla `profiles`, StarSeed ID). NO se toca ni se confunde con esto.
 *   · src/lib/library/entity-library.ts (EntityKind "profile") → consume el
 *     `id` de aquí como owner_id de una biblioteca de perfil.
 *
 * REQUISITO del SOP: crear escritorio/dashboard/pizarra exige un perfil
 * ancla → getDefaultProfile() debe llamarse en esos flujos antes de
 * anclar cualquier doc a `profile:<id>`.
 *
 * Local-first y defensivo: sin sesión, todas las funciones degradan a
 * listas vacías / null sin lanzar nunca.
 */

import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

export type ProfileKind = "personal" | "civic" | "artistic" | "professional" | "custom";

export interface AccountProfile {
    id: string;
    account: string;
    handle: string | null;
    name: string;
    kind: ProfileKind;
    avatarUrl: string | null;
    coverUrl: string | null;
    bio: string | null;
    visibility: "public" | "private" | "contacts";
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

/** Clave local: perfil activo por dispositivo (no viaja a la cuenta — cada
 *  dispositivo puede tener su propio perfil activo en un momento dado). */
export const ACTIVE_PROFILE_KEY = "starseed.profile.active.v1";
/** Evento despachado al cambiar el perfil activo (mismo documento/pestaña). */
export const PROFILE_ACTIVE_EVENT = "starseed:profile";
/** Evento despachado cuando cambia la LISTA de perfiles (crear/editar/borrar/realtime). */
export const PROFILES_LIST_EVENT = "starseed:profiles";

const KIND_LABELS: Record<ProfileKind, string> = {
    personal: "Personal",
    civic: "Cívico",
    artistic: "Artístico",
    professional: "Profesional",
    custom: "Personalizado",
};

export function profileKindLabel(kind: ProfileKind): string {
    return KIND_LABELS[kind] ?? "Personalizado";
}

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalizeKind(raw: unknown): ProfileKind {
    return raw === "civic" || raw === "artistic" || raw === "professional" || raw === "custom"
        ? raw
        : "personal";
}

function normalizeVisibility(raw: unknown): "public" | "private" | "contacts" {
    return raw === "private" || raw === "contacts" ? raw : "public";
}

function mapRow(row: Record<string, unknown>): AccountProfile {
    return {
        id: String(row.id),
        account: String(row.account),
        handle: typeof row.handle === "string" ? row.handle : null,
        name: typeof row.name === "string" && row.name ? row.name : "Sin nombre",
        kind: normalizeKind(row.kind),
        avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
        coverUrl: typeof row.cover_url === "string" ? row.cover_url : null,
        bio: typeof row.bio === "string" ? row.bio : null,
        visibility: normalizeVisibility(row.visibility),
        isDefault: row.is_default === true,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    };
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch (e) {
        throw e;
    }
}

function emitListChange(): void {
    if (!isClient()) return;
    try {
        window.dispatchEvent(new Event(PROFILES_LIST_EVENT));
    } catch {
        /* noop */
    }
}

/* ─────────────────────────── Lectura ─────────────────────────── */

/** Lista TODOS los perfiles de la cuenta activa (vacío sin sesión). Nunca lanza. */
export async function listMyProfiles(): Promise<AccountProfile[]> {
    try {
        const uid = await getUserId();
        if (!uid) return [];
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_account_profiles")
            .select("*")
            .eq("account", uid)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return data.map(mapRow);
    } catch {
        return [];
    }
}

/** Obtiene un perfil por id (de cualquier cuenta — las facetas públicas son legibles por todos). */
export async function getProfile(id: string): Promise<AccountProfile | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_account_profiles")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error || !data) return null;
        return mapRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

/**
 * Intenta obtener el perfil por defecto de la cuenta.
 * Devuelve el perfil por defecto (existente), o null si no hay ninguno.
 * REQUISITO del SOP §10: llamar antes de anclar escritorio/dashboard/pizarra
 * a un perfil.
 */
export async function getDefaultProfile(): Promise<AccountProfile | null> {
    try {
        const uid = await getUserId();
        if (!uid) return null;
        const existing = await listMyProfiles();
        if (existing.length > 0) {
            return existing.find((p) => p.isDefault) ?? existing[0];
        }
        return null;
    } catch {
        return null;
    }
}

/* ─────────────────────────── Escritura ─────────────────────────── */

export interface CreateProfileInput {
    name: string;
    handle?: string | null;
    kind?: ProfileKind;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    bio?: string | null;
    visibility?: "public" | "private" | "contacts";
    isDefault?: boolean;
}

/** Crea un nuevo perfil para la cuenta activa. Devuelve null sin sesión o en error. */
export async function createProfile(input: CreateProfileInput): Promise<AccountProfile | null> {
    try {
        const uid = await getUserId();
        if (!uid) return null;
        const supabase = createClient();
        const name = input.name.trim() || "Nuevo perfil";
        const handle = input.handle?.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "") || null;

        // Si se pide is_default, primero desmarca el resto (mejor esfuerzo; la
        // fila nueva se inserta igualmente aunque este paso falle).
        if (input.isDefault) {
            try {
                await supabase.from("os_account_profiles").update({ is_default: false }).eq("account", uid);
            } catch {
                /* noop */
            }
        }

        const { data, error } = await supabase
            .from("os_account_profiles")
            .insert({
                account: uid,
                name,
                handle,
                kind: input.kind ?? "personal",
                avatar_url: input.avatarUrl ?? null,
                cover_url: input.coverUrl ?? null,
                bio: input.bio ?? null,
                visibility: input.visibility ?? "public",
                is_default: input.isDefault ?? false,
            })
            .select("*")
            .maybeSingle();
        if (error) {
            console.error("createProfile error:", error);
            if (error.code === '23505') {
                throw new Error('El handle ya está en uso. Por favor, elige otro.');
            }
            throw new Error(error.message || 'Error desconocido al crear perfil');
        }
        if (!data) return null;
        emitListChange();
        return mapRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

export interface UpdateProfileInput {
    name?: string;
    handle?: string | null;
    kind?: ProfileKind;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    bio?: string | null;
    visibility?: "public" | "private" | "contacts";
}

/** Actualiza un perfil propio. Devuelve el perfil actualizado o null si falla/no es dueño. */
export async function updateProfile(id: string, patch: UpdateProfileInput): Promise<AccountProfile | null> {
    try {
        const supabase = createClient();
        const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (patch.name !== undefined) row.name = patch.name.trim() || "Sin nombre";
        if (patch.handle !== undefined) {
            row.handle = patch.handle ? patch.handle.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "") : null;
        }
        if (patch.kind !== undefined) row.kind = patch.kind;
        if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
        if (patch.coverUrl !== undefined) row.cover_url = patch.coverUrl;
        if (patch.bio !== undefined) row.bio = patch.bio;
        if (patch.visibility !== undefined) row.visibility = patch.visibility;

        const { data, error } = await supabase
            .from("os_account_profiles")
            .update(row)
            .eq("id", id)
            .select("*")
            .maybeSingle();
        if (error || !data) return null;
        emitListChange();
        return mapRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

/** Marca un perfil como el predeterminado de la cuenta (desmarca el resto). */
export async function setDefaultProfile(id: string): Promise<boolean> {
    try {
        const uid = await getUserId();
        if (!uid) return false;
        const supabase = createClient();
        await supabase.from("os_account_profiles").update({ is_default: false }).eq("account", uid);
        const { error } = await supabase.from("os_account_profiles").update({ is_default: true }).eq("id", id);
        emitListChange();
        return !error;
    } catch {
        return false;
    }
}

/**
 * Elimina un perfil propio. Rechaza (no-op, devuelve false) si es el ÚNICO
 * perfil de la cuenta o si es el is_default y no hay otro perfil disponible
 * para asumir el rol (regla de seguridad: la cuenta siempre debe conservar
 * al menos un perfil ancla para sus escritorios/dashboards/pizarras).
 */
export async function deleteProfile(id: string): Promise<boolean> {
    try {
        const uid = await getUserId();
        if (!uid) return false;
        const mine = await listMyProfiles();
        if (mine.length <= 1) return false; // siempre queda al menos uno
        const target = mine.find((p) => p.id === id);
        if (!target) return false;

        const supabase = createClient();
        const { error } = await supabase.from("os_account_profiles").delete().eq("id", id);
        if (error) return false;

        // Si borramos el default, promueve otro a is_default.
        if (target.isDefault) {
            const remaining = mine.filter((p) => p.id !== id);
            const promote = remaining[0];
            if (promote) {
                await supabase.from("os_account_profiles").update({ is_default: true }).eq("id", promote.id);
            }
        }
        emitListChange();
        return true;
    } catch {
        return false;
    }
}

/* ─────────────────────────── Perfil activo (local, por dispositivo) ─────────────────────────── */

/** Id del perfil activo en ESTE dispositivo (o null si no se ha elegido ninguno aún). */
export function activeProfileId(): string | null {
    if (!isClient()) return null;
    try {
        return localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
    } catch {
        return null;
    }
}

/** Cambia el perfil activo de ESTE dispositivo (persistido; despacha evento para refrescar la UI en vivo). */
export function setActiveProfile(id: string): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    try {
        window.dispatchEvent(new CustomEvent(PROFILE_ACTIVE_EVENT, { detail: { id } }));
    } catch {
        /* noop */
    }
}

/**
 * Resuelve el perfil activo efectivo: el guardado localmente si sigue
 * existiendo en `profiles`, o el is_default / primero de la lista (y lo
 * persiste como activo). Devuelve null si la lista está vacía.
 */
export function resolveActiveProfile(profiles: AccountProfile[]): AccountProfile | null {
    if (profiles.length === 0) return null;
    const storedId = activeProfileId();
    const stored = storedId ? profiles.find((p) => p.id === storedId) : undefined;
    if (stored) return stored;
    const fallback = profiles.find((p) => p.isDefault) ?? profiles[0];
    if (fallback) setActiveProfile(fallback.id);
    return fallback ?? null;
}

/* ─────────────────────────── Realtime ─────────────────────────── */

let realtimeChannel: RealtimeChannel | null = null;
let realtimeAccount: string | null = null;

/** Se suscribe a cambios en tiempo real de os_account_profiles de la cuenta activa. Nunca lanza. */
function subscribeMyProfilesRealtime(uid: string, onChange: () => void): () => void {
    try {
        const supabase = createClient();
        if (realtimeChannel && realtimeAccount === uid) {
            // Reutiliza el canal existente; añade este listener adicional vía evento genérico.
            const handler = () => onChange();
            window.addEventListener(PROFILES_LIST_EVENT, handler);
            return () => window.removeEventListener(PROFILES_LIST_EVENT, handler);
        }
        if (realtimeChannel) {
            try {
                supabase.removeChannel(realtimeChannel);
            } catch {
                /* noop */
            }
        }
        realtimeChannel = supabase
            .channel(`oap:${uid}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "os_account_profiles", filter: `account=eq.${uid}` },
                () => emitListChange(),
            )
            .subscribe();
        realtimeAccount = uid;
        const handler = () => onChange();
        window.addEventListener(PROFILES_LIST_EVENT, handler);
        return () => window.removeEventListener(PROFILES_LIST_EVENT, handler);
    } catch {
        return () => {};
    }
}

/* ─────────────────────────── Hooks reactivos ─────────────────────────── */

export interface UseMyProfiles {
    profiles: AccountProfile[];
    loading: boolean;
    reload: () => void;
}

/** Hook: lista reactiva de los perfiles de la cuenta (realtime + evento local). */
export function useMyProfiles(): UseMyProfiles {
    const [profiles, setProfiles] = useState<AccountProfile[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setLoading(true);
        void listMyProfiles().then((list) => {
            setProfiles(list);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const uid = await getUserId();
            const list = await listMyProfiles();
            if (!alive) return;
            setProfiles(list);
            setLoading(false);
            if (!uid) return () => {};
        })();

        const onListEvent = () => {
            void listMyProfiles().then((list) => {
                if (alive) setProfiles(list);
            });
        };
        window.addEventListener(PROFILES_LIST_EVENT, onListEvent);

        let unsubRealtime: (() => void) | null = null;
        void getUserId().then((uid) => {
            if (uid && alive) unsubRealtime = subscribeMyProfilesRealtime(uid, onListEvent);
        });

        return () => {
            alive = false;
            window.removeEventListener(PROFILES_LIST_EVENT, onListEvent);
            unsubRealtime?.();
        };
    }, []);

    return { profiles, loading, reload };
}

export interface UseActiveProfile {
    profile: AccountProfile | null;
    profiles: AccountProfile[];
    loading: boolean;
    setActive: (id: string) => void;
}

/** Hook: perfil activo (resuelto/persistido) + lista completa + cambiarlo. */
export function useActiveProfile(): UseActiveProfile {
    const { profiles, loading } = useMyProfiles();
    const [activeId, setActiveId] = useState<string | null>(() => activeProfileId());

    useEffect(() => {
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent<{ id: string } | undefined>).detail;
            setActiveId(detail?.id ?? activeProfileId());
        };
        window.addEventListener(PROFILE_ACTIVE_EVENT, onChange);
        return () => window.removeEventListener(PROFILE_ACTIVE_EVENT, onChange);
    }, []);

    useEffect(() => {
        if (loading || profiles.length === 0) return;
        const resolved = resolveActiveProfile(profiles);
        if (resolved && resolved.id !== activeId) setActiveId(resolved.id);
    }, [loading, profiles, activeId]);

    const setActive = useCallback((id: string) => setActiveProfile(id), []);

    const profile = profiles.find((p) => p.id === activeId) ?? null;
    return { profile, profiles, loading, setActive };
}
