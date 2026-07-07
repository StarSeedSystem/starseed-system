"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Servidores de apps (os_app_servers / os_app_server_members)
 * ---------------------------------------------------------------------------
 * Apps/juegos/entornos/programas compartidos en tiempo real entre miembros.
 * Backend YA APLICADO en Supabase (dzkjapinnewkxzjltadv):
 *
 *   os_app_servers(id, slug, name, description, kind 'app'|'juego'|'entorno'|
 *                  'programa'|'otro', visibility 'public'|'private'|'group',
 *                  group_slug, app_route, app_url, icon, payload, owner,
 *                  created_at)
 *   os_app_server_members(server_id, user_id, role, status
 *                  'member'|'pending'|'banned', joined_at)
 *
 * Reglas de acceso:
 *   · Públicos visibles para todos (RLS SELECT).
 *   · Unirse DIRECTO si público (insert self con status='member').
 *   · Unirse por SOLICITUD (status='pending') si privado/grupo; el owner
 *     aprueba (update status='member') o deniega (delete/banned).
 *   · Realtime ON en members (para que aprobar/denegar se refleje al instante).
 *
 * Filosofía del repo: nunca lanza, SSR-safe, degrada a []/null sin sesión/red.
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { onTableChange } from "@/lib/realtime/realtime";

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

export type ServerKind = "app" | "juego" | "entorno" | "programa" | "otro";
export type ServerVisibility = "public" | "private" | "group";
export type MemberStatus = "member" | "pending" | "banned";

export interface AppServer {
    id: string;
    slug: string;
    name: string;
    description: string;
    kind: ServerKind;
    visibility: ServerVisibility;
    groupSlug: string | null;
    appRoute: string | null;
    appUrl: string | null;
    icon: string | null;
    payload: Record<string, unknown> | null;
    owner: string | null;
    createdAt: string;
}

export interface AppServerMember {
    serverId: string;
    userId: string;
    role: string;
    status: MemberStatus;
    joinedAt: string;
}

/** Servidor + info agregada útil para tarjetas (miembros, mi estado). */
export interface AppServerSummary extends AppServer {
    memberCount: number;
    /** Estado de membresía del usuario actual respecto a este servidor (null = no relacionado). */
    myStatus: MemberStatus | null;
    myRole: string | null;
    isOwner: boolean;
}

interface ServerRow {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    kind: string | null;
    visibility: string | null;
    group_slug: string | null;
    app_route: string | null;
    app_url: string | null;
    icon: string | null;
    payload: unknown;
    owner: string | null;
    created_at: string;
}

interface MemberRow {
    server_id: string;
    user_id: string;
    role: string | null;
    status: string | null;
    joined_at: string;
}

function normalizeServer(row: ServerRow): AppServer {
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description || "",
        kind: (row.kind as ServerKind) || "app",
        visibility: (row.visibility as ServerVisibility) || "public",
        groupSlug: row.group_slug,
        appRoute: row.app_route,
        appUrl: row.app_url,
        icon: row.icon,
        payload: (row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {}) ?? {},
        owner: row.owner,
        createdAt: row.created_at,
    };
}

function normalizeMember(row: MemberRow): AppServerMember {
    return {
        serverId: row.server_id,
        userId: row.user_id,
        role: row.role || "member",
        status: (row.status as MemberStatus) || "member",
        joinedAt: row.joined_at,
    };
}

function isClient(): boolean {
    return typeof window !== "undefined";
}

async function getCurrentUserId(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

function slugify(input: string): string {
    return (input || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

function shortSuffix(): string {
    return Math.random().toString(36).slice(2, 6);
}

/* ───────────────────────────── createServer ────────────────────────────── */

export interface CreateServerInput {
    name: string;
    description?: string;
    kind?: ServerKind;
    visibility?: ServerVisibility;
    groupSlug?: string | null;
    /** App instalada por RUTA in-app (p.ej. "/pizarra") o por URL externa. */
    appRoute?: string | null;
    appUrl?: string | null;
    icon?: string | null;
    payload?: Record<string, unknown>;
}

export interface ServerMutationResult {
    ok: boolean;
    needsAuth?: boolean;
    server?: AppServer;
    error?: string;
}

/**
 * Crea un servidor de apps, fijando `owner = auth.uid()` y añadiendo al
 * creador como miembro `owner`/`member` activo. Reintenta el slug si choca.
 */
export async function createServer(input: CreateServerInput): Promise<ServerMutationResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    let slug = slugify(input.name) || `servidor-${shortSuffix()}`;

    for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase
            .from("os_app_servers")
            .insert({
                slug,
                name: input.name.trim(),
                description: input.description?.trim() ?? "",
                kind: input.kind ?? "app",
                visibility: input.visibility ?? "public",
                group_slug: input.visibility === "group" ? input.groupSlug ?? null : null,
                app_route: input.appRoute ?? null,
                app_url: input.appUrl ?? null,
                icon: input.icon ?? null,
                payload: input.payload ?? {},
                owner: uid,
            })
            .select("*")
            .single();
        if (!error && data) {
            const server = normalizeServer(data as ServerRow);
            try {
                await supabase
                    .from("os_app_server_members")
                    .insert({ server_id: server.id, user_id: uid, role: "owner", status: "member" });
            } catch {
                /* best-effort: el owner puede añadirse a sí mismo después si esto falla */
            }
            return { ok: true, server };
        }
        const code = (error as { code?: string } | null)?.code;
        const msg = (error?.message || "").toLowerCase();
        if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
            slug = `${slugify(input.name) || "servidor"}-${shortSuffix()}`;
            continue;
        }
        return { ok: false, error: error?.message || "error" };
    }
    return { ok: false, error: "No se pudo generar un slug único." };
}

/* ───────────────────────────── listServers ─────────────────────────────── */

export type ServerScope = "mine" | "public" | "group";

/**
 * Lista servidores según el ámbito pedido:
 *   · "public" → todos los públicos (visibles para cualquiera por RLS).
 *   · "mine"   → donde el usuario actual es miembro activo (member) u owner.
 *   · "group"  → públicos/privados de un grupo concreto (requiere `groupSlug`).
 * Enriquece cada servidor con `memberCount` y el estado de membresía propio.
 * Nunca lanza: [] ante cualquier error.
 */
export async function listServers(scope: ServerScope, groupSlug?: string): Promise<AppServerSummary[]> {
    const supabase = createClient();
    const uid = await getCurrentUserId();

    try {
        let serverRows: ServerRow[] = [];

        if (scope === "public") {
            const { data } = await supabase.from("os_app_servers").select("*").eq("visibility", "public");
            serverRows = (data as ServerRow[]) || [];
        } else if (scope === "group") {
            if (!groupSlug) return [];
            const { data } = await supabase
                .from("os_app_servers")
                .select("*")
                .eq("visibility", "group")
                .eq("group_slug", groupSlug);
            serverRows = (data as ServerRow[]) || [];
        } else {
            // "mine": servidores donde soy miembro activo (member) u owner.
            if (!uid) return [];
            const { data: memberRows } = await supabase
                .from("os_app_server_members")
                .select("server_id, status")
                .eq("user_id", uid)
                .eq("status", "member");
            const ids = ((memberRows as { server_id: string; status: string }[]) || []).map((r) => r.server_id);
            if (!ids.length) return [];
            const { data } = await supabase.from("os_app_servers").select("*").in("id", ids);
            serverRows = (data as ServerRow[]) || [];
        }

        if (!serverRows.length) return [];

        const serverIds = serverRows.map((r) => r.id);
        const { data: allMembers } = await supabase
            .from("os_app_server_members")
            .select("server_id, user_id, role, status")
            .in("server_id", serverIds);
        const members = (allMembers as MemberRow[]) || [];

        return serverRows.map((row) => {
            const server = normalizeServer(row);
            const serverMembers = members.filter((m) => m.server_id === server.id && m.status === "member");
            const mine = uid ? members.find((m) => m.server_id === server.id && m.user_id === uid) : undefined;
            return {
                ...server,
                memberCount: serverMembers.length,
                myStatus: mine ? ((mine.status as MemberStatus) ?? null) : null,
                myRole: mine ? mine.role ?? "member" : null,
                isOwner: !!uid && server.owner === uid,
            };
        });
    } catch {
        return [];
    }
}

/** Un servidor por slug (para el panel de detalle). */
export async function fetchServerBySlug(slug: string): Promise<AppServerSummary | null> {
    if (!slug) return null;
    try {
        const supabase = createClient();
        const uid = await getCurrentUserId();
        const { data, error } = await supabase.from("os_app_servers").select("*").eq("slug", slug).maybeSingle();
        if (error || !data) return null;
        const server = normalizeServer(data as ServerRow);

        const { data: memberRows } = await supabase
            .from("os_app_server_members")
            .select("server_id, user_id, role, status")
            .eq("server_id", server.id);
        const members = (memberRows as MemberRow[]) || [];
        const activeMembers = members.filter((m) => m.status === "member");
        const mine = uid ? members.find((m) => m.user_id === uid) : undefined;

        return {
            ...server,
            memberCount: activeMembers.length,
            myStatus: mine ? ((mine.status as MemberStatus) ?? null) : null,
            myRole: mine ? mine.role ?? "member" : null,
            isOwner: !!uid && server.owner === uid,
        };
    } catch {
        return null;
    }
}

/** Un servidor por id (para adjuntos vivos: canal/edición que guardan el id, no el slug). */
export async function fetchServerById(id: string): Promise<AppServerSummary | null> {
    if (!id) return null;
    try {
        const supabase = createClient();
        const uid = await getCurrentUserId();
        const { data, error } = await supabase.from("os_app_servers").select("*").eq("id", id).maybeSingle();
        if (error || !data) return null;
        const server = normalizeServer(data as ServerRow);

        const { data: memberRows } = await supabase
            .from("os_app_server_members")
            .select("server_id, user_id, role, status")
            .eq("server_id", server.id);
        const members = (memberRows as MemberRow[]) || [];
        const activeMembers = members.filter((m) => m.status === "member");
        const mine = uid ? members.find((m) => m.user_id === uid) : undefined;

        return {
            ...server,
            memberCount: activeMembers.length,
            myStatus: mine ? ((mine.status as MemberStatus) ?? null) : null,
            myRole: mine ? mine.role ?? "member" : null,
            isOwner: !!uid && server.owner === uid,
        };
    } catch {
        return null;
    }
}

/* ──────────────────────── Unirse / solicitar / aprobar ─────────────────── */

export interface JoinResult {
    ok: boolean;
    needsAuth?: boolean;
    /** true si quedó como miembro activo; false si quedó pendiente de aprobación. */
    joined?: boolean;
    pending?: boolean;
    error?: string;
}

/**
 * Une (o solicita unirse a) un servidor: directo si es público, solicitud
 * (`status='pending'`) si es privado/grupo. El dueño aprueba/deniega después.
 */
export async function joinOrRequest(server: AppServer): Promise<JoinResult> {
    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, needsAuth: true };
    const supabase = createClient();
    const status: MemberStatus = server.visibility === "public" ? "member" : "pending";
    try {
        const { error } = await supabase
            .from("os_app_server_members")
            .upsert({ server_id: server.id, user_id: uid, role: "member", status }, { onConflict: "server_id,user_id" });
        if (error) throw error;
        return { ok: true, joined: status === "member", pending: status === "pending" };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }
}

/** Alias explícito para "solicitar unirse" (mismo comportamiento que joinOrRequest en privado/grupo). */
export const requestJoin = joinOrRequest;

/** El dueño aprueba una solicitud pendiente (status → 'member'). RLS valida propiedad. */
export async function approve(serverId: string, userId: string): Promise<boolean> {
    if (!serverId || !userId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_app_server_members")
            .update({ status: "member" })
            .eq("server_id", serverId)
            .eq("user_id", userId);
        return !error;
    } catch {
        return false;
    }
}

/** El dueño deniega una solicitud pendiente (elimina la fila). */
export async function deny(serverId: string, userId: string): Promise<boolean> {
    if (!serverId || !userId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_app_server_members")
            .delete()
            .eq("server_id", serverId)
            .eq("user_id", userId);
        return !error;
    } catch {
        return false;
    }
}

/** Abandona un servidor (elimina mi propia membresía). */
export async function leave(serverId: string): Promise<boolean> {
    const uid = await getCurrentUserId();
    if (!uid || !serverId) return false;
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_app_server_members")
            .delete()
            .eq("server_id", serverId)
            .eq("user_id", uid);
        return !error;
    } catch {
        return false;
    }
}

/** Miembros de un servidor (incluye pendientes; el llamador filtra por status en la UI). */
export async function listServerMembers(serverId: string): Promise<AppServerMember[]> {
    if (!serverId) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_app_server_members")
            .select("*")
            .eq("server_id", serverId)
            .order("joined_at", { ascending: true });
        if (error || !Array.isArray(data)) return [];
        return (data as MemberRow[]).map(normalizeMember);
    } catch {
        return [];
    }
}

/** Suscripción realtime a los miembros de UN servidor (para que aprobar/denegar/unirse se refleje al instante). */
export function subscribeMembers(serverId: string, onChange: () => void): () => void {
    if (!serverId) return () => {};
    return onTableChange("os_app_server_members", { filter: `server_id=eq.${serverId}` }, () => onChange());
}
