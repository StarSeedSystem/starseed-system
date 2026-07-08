"use client";

/*
 * spaces — ESPACIOS SINCRONIZADOS/COMPARTIDOS (SOP §11): escritorios,
 * dashboards y pizarras compartibles entre perfiles, cuentas o público.
 *
 * Backend YA aplicado (Supabase dzkjapinnewkxzjltadv):
 *   os_spaces(id, kind desktop|dashboard|board, title, owner_account,
 *   anchor_profile, access private|profiles|invite|public,
 *   allowed_profiles uuid[], group_slug, doc jsonb, device_id, rev(trigger),
 *   updated_at) + os_space_editors(space_id, account, role editor|viewer,
 *   status member|invited|pending) — funciones space_can_edit/read (dueño,
 *   público=edición, grupo por os_memberships, editor member, perfil en
 *   allowed_profiles). Realtime ON en ambas tablas.
 *
 * RLS observada (auditada en vivo antes de escribir este módulo):
 *   · os_spaces: select (público O space_can_read), insert (dueño), update
 *     (space_can_edit), delete (dueño).
 *   · os_space_editors: select (mi fila O space_can_read del espacio),
 *     ALL para el dueño del espacio (invitar/gestionar), UPDATE de mi propia
 *     fila (para aceptar invitación invited→member al abrir).
 *
 * Edición colaborativa: `doc` con LWW por `rev` (trigger de Supabase) +
 * debounce en el cliente — mismo patrón que entity-state.ts (device_id
 * evita eco, aunque aquí no hay un `subscribeEntityState` genérico porque
 * os_spaces es tabla propia; se implementa el mismo patrón inline).
 */

import { createClient } from "@/utils/supabase/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceId } from "@/lib/sync/entity-state";
import { syncManager, OS_TABLE } from "@/lib/sync/sync-manager";

export type SpaceKind = "desktop" | "dashboard" | "board";
export type SpaceAccess = "private" | "profiles" | "invite" | "public";
export type SpaceEditorRole = "editor" | "viewer";
export type SpaceEditorStatus = "member" | "invited" | "pending";

export interface Space {
    id: string;
    kind: SpaceKind;
    title: string;
    ownerAccount: string;
    anchorProfile: string | null;
    access: SpaceAccess;
    allowedProfiles: string[];
    groupSlug: string | null;
    doc: Record<string, unknown>;
    deviceId: string | null;
    rev: number;
    updatedAt: string;
    createdAt: string;
}

export interface SpaceEditor {
    spaceId: string;
    account: string;
    role: SpaceEditorRole;
    status: SpaceEditorStatus;
    createdAt: string;
}

function isClient(): boolean {
    return typeof window !== "undefined";
}

function mapSpaceRow(row: Record<string, unknown>): Space {
    return {
        id: String(row.id),
        kind: (row.kind as SpaceKind) ?? "board",
        title: typeof row.title === "string" ? row.title : "Sin título",
        ownerAccount: String(row.owner_account),
        anchorProfile: typeof row.anchor_profile === "string" ? row.anchor_profile : null,
        access: (row.access as SpaceAccess) ?? "private",
        allowedProfiles: Array.isArray(row.allowed_profiles) ? (row.allowed_profiles as string[]) : [],
        groupSlug: typeof row.group_slug === "string" ? row.group_slug : null,
        doc: row.doc && typeof row.doc === "object" ? (row.doc as Record<string, unknown>) : {},
        deviceId: typeof row.device_id === "string" ? row.device_id : null,
        rev: typeof row.rev === "number" ? row.rev : 0,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
    };
}

function mapEditorRow(row: Record<string, unknown>): SpaceEditor {
    return {
        spaceId: String(row.space_id),
        account: String(row.account),
        role: (row.role as SpaceEditorRole) ?? "editor",
        status: (row.status as SpaceEditorStatus) ?? "member",
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
    };
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/* ─────────────────────────── CRUD ─────────────────────────── */

export interface CreateSpaceInput {
    kind: SpaceKind;
    title: string;
    access?: SpaceAccess;
    anchorProfile?: string | null;
    allowedProfiles?: string[];
    groupSlug?: string | null;
    doc: Record<string, unknown>;
}

/** Crea un espacio compartido (copiando el doc pasado). Devuelve null sin sesión o en error. */
export async function createSpace(input: CreateSpaceInput): Promise<Space | null> {
    try {
        const uid = await getUserId();
        if (!uid) return null;
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_spaces")
            .insert({
                kind: input.kind,
                title: input.title.trim() || "Espacio sin título",
                owner_account: uid,
                anchor_profile: input.anchorProfile ?? null,
                access: input.access ?? "private",
                allowed_profiles: input.allowedProfiles ?? [],
                group_slug: input.groupSlug ?? null,
                doc: input.doc,
                device_id: deviceId(),
            })
            .select("*")
            .maybeSingle();
        if (error || !data) return null;
        return mapSpaceRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

/** Lee un espacio por id (RLS decide visibilidad). */
export async function getSpace(id: string): Promise<Space | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_spaces").select("*").eq("id", id).maybeSingle();
        if (error || !data) return null;
        return mapSpaceRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

export interface UpdateSpaceMetaInput {
    title?: string;
    access?: SpaceAccess;
    allowedProfiles?: string[];
    groupSlug?: string | null;
}

/** Actualiza metadatos de un espacio (requiere space_can_edit). */
export async function updateSpaceMeta(id: string, patch: UpdateSpaceMetaInput): Promise<boolean> {
    try {
        const row: Record<string, unknown> = {};
        if (patch.title !== undefined) row.title = patch.title.trim() || "Sin título";
        if (patch.access !== undefined) row.access = patch.access;
        if (patch.allowedProfiles !== undefined) row.allowed_profiles = patch.allowedProfiles;
        if (patch.groupSlug !== undefined) row.group_slug = patch.groupSlug;
        if (Object.keys(row).length === 0) return true;
        const supabase = createClient();
        const { error } = await supabase.from("os_spaces").update(row).eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Actualiza el doc colaborativo de un espacio (requiere space_can_edit). Marca device_id de este cliente. */
export async function updateSpaceDoc(id: string, doc: Record<string, unknown>): Promise<Space | null> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_spaces")
            .update({ doc, device_id: deviceId() })
            .eq("id", id)
            .select("*")
            .maybeSingle();
        if (error || !data) return null;
        return mapSpaceRow(data as Record<string, unknown>);
    } catch {
        return null;
    }
}

/** Elimina un espacio (solo el dueño, por RLS). */
export async function deleteSpace(id: string): Promise<boolean> {
    try {
        const supabase = createClient();
        const { error } = await supabase.from("os_spaces").delete().eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Lista los espacios de un `kind` accesibles para la cuenta (propios + editor + público, por RLS de sp_select). */
export async function listMySpaces(kind?: SpaceKind): Promise<Space[]> {
    try {
        const uid = await getUserId();
        if (!uid) return [];
        const supabase = createClient();
        let query = supabase.from("os_spaces").select("*").order("updated_at", { ascending: false });
        if (kind) query = query.eq("kind", kind);
        const { data, error } = await query;
        if (error || !Array.isArray(data)) return [];
        return data.map(mapSpaceRow);
    } catch {
        return [];
    }
}

/** Lista SOLO los espacios de los que soy dueño (para "gestionar mis espacios"). */
export async function listOwnedSpaces(kind?: SpaceKind): Promise<Space[]> {
    try {
        const uid = await getUserId();
        if (!uid) return [];
        const supabase = createClient();
        let query = supabase.from("os_spaces").select("*").eq("owner_account", uid).order("updated_at", { ascending: false });
        if (kind) query = query.eq("kind", kind);
        const { data, error } = await query;
        if (error || !Array.isArray(data)) return [];
        return data.map(mapSpaceRow);
    } catch {
        return [];
    }
}

/* ─────────────────────────── Invitados (os_space_editors) ─────────────────────────── */

/** Invita a una cuenta (por uuid resuelto de antemano) como editor/viewer, status='invited'. Solo el dueño puede. */
export async function inviteToSpace(spaceId: string, account: string, role: SpaceEditorRole = "editor"): Promise<boolean> {
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_space_editors")
            .upsert({ space_id: spaceId, account, role, status: "invited" }, { onConflict: "space_id,account" });
        return !error;
    } catch {
        return false;
    }
}

/** Resuelve una cuenta por @username/handle usando el directorio público os_profiles. Null si no se encuentra. */
export async function resolveAccountByUsername(username: string): Promise<string | null> {
    try {
        const clean = username.trim().replace(/^@/, "").toLowerCase();
        if (!clean) return null;
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_profiles")
            .select("user_id")
            .ilike("username", clean)
            .maybeSingle();
        if (error || !data?.user_id) return null;
        return String(data.user_id);
    } catch {
        return null;
    }
}

/** Invita por @username (resuelve la cuenta y crea la fila invited). Devuelve false si no se encuentra el usuario. */
export async function inviteToSpaceByUsername(spaceId: string, username: string, role: SpaceEditorRole = "editor"): Promise<boolean> {
    const account = await resolveAccountByUsername(username);
    if (!account) return false;
    return inviteToSpace(spaceId, account, role);
}

/** Lista los editores/invitados de un espacio (dueño o editores pueden verla, por spe_select). */
export async function listSpaceEditors(spaceId: string): Promise<SpaceEditor[]> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_space_editors").select("*").eq("space_id", spaceId);
        if (error || !Array.isArray(data)) return [];
        return data.map(mapEditorRow);
    } catch {
        return [];
    }
}

/**
 * Acepta una invitación pendiente (transición invited→member) al ABRIR el
 * espacio. Solo actualiza LA PROPIA fila (spe_self), nunca inserta — si no
 * existía invitación previa, es un no-op silencioso.
 *
 * Mantiene su firma void (llamada como `void acceptSpaceInvite(spaceId)` desde
 * useSpaceDoc/useSharedBoardSpace al abrir un espacio). Delega en
 * `acceptInvite` para no duplicar la lógica.
 */
export async function acceptSpaceInvite(spaceId: string): Promise<void> {
    await acceptInvite(spaceId);
}

/**
 * Acepta una invitación pendiente (transición invited→member). Variante
 * pública que devuelve boolean de éxito, pensada para UI explícita (botón
 * "Aceptar" en una lista de invitaciones) donde se necesita reaccionar al
 * resultado (toast, quitar de la lista, etc). Misma cláusula WHERE que
 * `acceptSpaceInvite`: solo actualiza LA PROPIA fila, nunca inserta.
 */
export async function acceptInvite(spaceId: string): Promise<boolean> {
    try {
        const uid = await getUserId();
        if (!uid) return false;
        const supabase = createClient();
        const { error } = await supabase
            .from("os_space_editors")
            .update({ status: "member" })
            .eq("space_id", spaceId)
            .eq("account", uid)
            .eq("status", "invited");
        return !error;
    } catch {
        return false;
    }
}

/**
 * Rechaza (elimina) MI PROPIA invitación pendiente. Distinto de
 * `removeSpaceEditor` (que es solo del dueño y borra CUALQUIER cuenta) —
 * aquí el invitado borra su propia fila `invited` (spe_self, vía UPDATE de
 * la propia fila que también cubre DELETE bajo la misma política si RLS lo
 * permite; degrada a false sin lanzar si no).
 */
export async function declineInvite(spaceId: string): Promise<boolean> {
    try {
        const uid = await getUserId();
        if (!uid) return false;
        const supabase = createClient();
        const { error } = await supabase
            .from("os_space_editors")
            .delete()
            .eq("space_id", spaceId)
            .eq("account", uid)
            .eq("status", "invited");
        return !error;
    } catch {
        return false;
    }
}

/**
 * Solicita acceso de edición a un espacio (status='pending') — variante
 * "solicitud" (en vez de "invitación"): cualquiera que vea el espacio puede
 * pedir paso; el dueño aprueba (`approveSpaceEditor`) o deniega
 * (`removeSpaceEditor`). Usa el mismo `SpaceEditorStatus.pending` ya
 * declarado en el tipo. Defensivo: si ya es `member`, no lo degrada.
 */
export async function requestSpaceAccess(
    spaceId: string,
    role: SpaceEditorRole = "editor",
): Promise<{ ok: boolean; alreadyMember?: boolean }> {
    try {
        const uid = await getUserId();
        if (!uid || !spaceId) return { ok: false };
        const supabase = createClient();
        const { data: existing } = await supabase
            .from("os_space_editors")
            .select("status")
            .eq("space_id", spaceId)
            .eq("account", uid)
            .maybeSingle();
        if ((existing as { status?: string } | null)?.status === "member") {
            return { ok: true, alreadyMember: true };
        }
        const { error } = await supabase
            .from("os_space_editors")
            .upsert({ space_id: spaceId, account: uid, role, status: "pending" }, { onConflict: "space_id,account" });
        return { ok: !error };
    } catch {
        return { ok: false };
    }
}

/** El dueño aprueba una solicitud pendiente (status: pending → member). RLS valida propiedad. */
export async function approveSpaceEditor(spaceId: string, account: string): Promise<boolean> {
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("os_space_editors")
            .update({ status: "member" })
            .eq("space_id", spaceId)
            .eq("account", account)
            .eq("status", "pending");
        return !error;
    } catch {
        return false;
    }
}

/** Quita a un editor/invitado de un espacio (solo el dueño, por spe_owner). */
export async function removeSpaceEditor(spaceId: string, account: string): Promise<boolean> {
    try {
        const supabase = createClient();
        const { error } = await supabase.from("os_space_editors").delete().eq("space_id", spaceId).eq("account", account);
        return !error;
    } catch {
        return false;
    }
}

/* ─────────────────────────── Mis invitaciones (perspectiva del invitado) ─────────────────────────── */

export interface MyInvite {
    spaceId: string;
    role: SpaceEditorRole;
    title: string;
    kind: SpaceKind;
    createdAt: string;
}

/**
 * Lista MIS invitaciones pendientes (status='invited', cuenta = yo) — a
 * diferencia de `listSpaceEditors` (perspectiva del dueño sobre UN espacio),
 * esta recorre TODOS los espacios en los que me han invitado y aún no he
 * aceptado/rechazado.
 *
 * Enfoque de dos consultas (en vez de un embed `.select("*, os_spaces(...)")`)
 * porque la lectura de `os_spaces` para un espacio access='invite' depende de
 * `space_can_read`, que podría no reconocerme todavía como lector antes de
 * aceptar — un embed fallaría silenciosamente o devolvería null en ese caso.
 * Con dos consultas degradamos con gracia: si la segunda consulta (os_spaces)
 * falla o no devuelve fila para un `space_id`, igualmente se conserva la
 * invitación con un título placeholder — lo importante (spaceId + role) NUNCA
 * se omite por un fallo en el enriquecido de título/kind.
 */
export async function listMyInvites(): Promise<MyInvite[]> {
    try {
        const uid = await getUserId();
        if (!uid) return [];
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_space_editors")
            .select("space_id, role, created_at")
            .eq("account", uid)
            .eq("status", "invited")
            .order("created_at", { ascending: false });
        if (error || !Array.isArray(data) || data.length === 0) return [];

        const base = data.map((row) => ({
            spaceId: String((row as Record<string, unknown>).space_id),
            role: ((row as Record<string, unknown>).role as SpaceEditorRole) ?? "editor",
            createdAt: typeof (row as Record<string, unknown>).created_at === "string" ? String((row as Record<string, unknown>).created_at) : "",
        }));

        // Enriquecido best-effort de título/kind — nunca tira la lista si falla.
        try {
            const ids = base.map((b) => b.spaceId);
            const { data: spacesData, error: spacesError } = await supabase
                .from("os_spaces")
                .select("id, title, kind")
                .in("id", ids);
            const byId = new Map<string, { title: string; kind: SpaceKind }>();
            if (!spacesError && Array.isArray(spacesData)) {
                for (const row of spacesData as Array<Record<string, unknown>>) {
                    byId.set(String(row.id), {
                        title: typeof row.title === "string" ? row.title : "Espacio compartido",
                        kind: (row.kind as SpaceKind) ?? "board",
                    });
                }
            }
            return base.map((b) => {
                const found = byId.get(b.spaceId);
                return {
                    spaceId: b.spaceId,
                    role: b.role,
                    createdAt: b.createdAt,
                    title: found?.title ?? "Espacio compartido",
                    kind: found?.kind ?? "board",
                };
            });
        } catch {
            // Degrada con gracia: la invitación sigue siendo accionable aunque
            // no sepamos título/kind todavía.
            return base.map((b) => ({ ...b, title: "Espacio compartido", kind: "board" as SpaceKind }));
        }
    } catch {
        return [];
    }
}

/* ─────────────────────────── Realtime ─────────────────────────── */

/**
 * Suscripción en tiempo real a un espacio concreto (cambios de doc/metadatos
 * de OTROS colaboradores). Anti-eco por device_id (igual que entity-state.ts).
 */
export function subscribeSpace(spaceId: string, onChange: (space: Space) => void): () => void {
    try {
        return syncManager.subscribe("os_spaces", "id", spaceId, (payload) => {
            const row = payload.record as Record<string, unknown>;
            if (!row) return;
            if (row.device_id === deviceId()) return; // anti-eco
            onChange(mapSpaceRow(row));
        });
    } catch {
        return () => {};
    }
}

/** Suscripción en tiempo real a la LISTA de espacios accesibles (para refrescar "compartidos conmigo/míos"). */
export function subscribeMySpacesList(onChange: () => void): () => void {
    try {
        const supabase = createClient();
        const channel = supabase
            .channel(`spaces-list:${deviceId()}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "os_spaces" }, () => onChange())
            .on("postgres_changes", { event: "*", schema: "public", table: "os_space_editors" }, () => onChange())
            .subscribe();
        return () => {
            try {
                supabase.removeChannel(channel);
            } catch {
                /* noop */
            }
        };
    } catch {
        return () => {};
    }
}

/**
 * Suscripción en tiempo real específica a MIS invitaciones pendientes
 * (`os_space_editors` donde `account = auth.uid()`). Más acotada que
 * `subscribeMySpacesList` (que escucha la tabla entera) para menos ruido en
 * componentes que solo necesitan refrescar la bandeja de invitaciones.
 */
export function subscribeMyInvites(onChange: () => void): () => void {
    try {
        const supabase = createClient();
        let unsub: (() => void) | null = null;
        void getUserId().then((uid) => {
            if (!uid) return;
            const channel = supabase
                .channel(`invites:${uid}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "os_space_editors", filter: `account=eq.${uid}` },
                    () => onChange(),
                )
                .subscribe();
            unsub = () => {
                try {
                    supabase.removeChannel(channel);
                } catch {
                    /* noop */
                }
            };
        });
        return () => {
            if (unsub) unsub();
        };
    } catch {
        return () => {};
    }
}

/* ─────────────────────────── Hooks ─────────────────────────── */

export interface UseMySpaces {
    spaces: Space[];
    loading: boolean;
    reload: () => void;
}

/** Hook: lista reactiva de espacios accesibles de un `kind` (realtime). */
export function useMySpaces(kind?: SpaceKind): UseMySpaces {
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setLoading(true);
        void listMySpaces(kind).then((list) => {
            setSpaces(list);
            setLoading(false);
        });
    }, [kind]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        void listMySpaces(kind).then((list) => {
            if (alive) {
                setSpaces(list);
                setLoading(false);
            }
        });
        const unsub = subscribeMySpacesList(() => {
            void listMySpaces(kind).then((list) => {
                if (alive) setSpaces(list);
            });
        });
        return () => {
            alive = false;
            unsub();
        };
    }, [kind]);

    return { spaces, loading, reload };
}

export interface UseMyInvites {
    invites: MyInvite[];
    loading: boolean;
    reload: () => void;
}

/** Hook: lista reactiva de MIS invitaciones pendientes (realtime), mismo patrón que `useMySpaces`. */
export function useMyInvites(): UseMyInvites {
    const [invites, setInvites] = useState<MyInvite[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(() => {
        setLoading(true);
        void listMyInvites().then((list) => {
            setInvites(list);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        void listMyInvites().then((list) => {
            if (alive) {
                setInvites(list);
                setLoading(false);
            }
        });
        const unsub = subscribeMyInvites(() => {
            void listMyInvites().then((list) => {
                if (alive) setInvites(list);
            });
        });
        return () => {
            alive = false;
            unsub();
        };
    }, []);

    return { invites, loading, reload };
}

export interface UseSpaceDocOptions {
    /** Debounce del push del doc colaborativo (ms). Por defecto 900ms. */
    debounceMs?: number;
}

export interface UseSpaceDoc<T> {
    doc: T | null;
    space: Space | null;
    loading: boolean;
    /** Escribe el doc (optimista local + push con debounce a la nube). */
    setDoc: (next: T) => void;
    /** true justo tras aplicar un cambio de OTRO colaborador. */
    lastChangeWasRemote: boolean;
}

/**
 * Hook de edición colaborativa de UN espacio: carga inicial + realtime +
 * push con debounce. Acepta invitación pendiente al montar (best-effort).
 * `spaceId` puede ser null mientras se resuelve — en ese caso, no-op estable.
 */
export function useSpaceDoc<T = Record<string, unknown>>(
    spaceId: string | null,
    options: UseSpaceDocOptions = {},
): UseSpaceDoc<T> {
    const { debounceMs = 900 } = options;
    const [doc, setDocState] = useState<T | null>(null);
    const [space, setSpace] = useState<Space | null>(null);
    const [loading, setLoading] = useState(!!spaceId);
    const [lastChangeWasRemote, setLastChangeWasRemote] = useState(false);
    const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!spaceId) {
            setDocState(null);
            setSpace(null);
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        void acceptSpaceInvite(spaceId); // best-effort: invited→member al abrir
        void getSpace(spaceId).then((sp) => {
            if (!alive) return;
            setSpace(sp);
            setDocState((sp?.doc as T) ?? null);
            setLoading(false);
        });
        const unsub = subscribeSpace(spaceId, (sp) => {
            if (!alive) return;
            setSpace(sp);
            setDocState(sp.doc as T);
            setLastChangeWasRemote(true);
        });
        return () => {
            alive = false;
            unsub();
            if (pushTimer.current) clearTimeout(pushTimer.current);
        };
    }, [spaceId]);

    const setDoc = useCallback(
        (next: T) => {
            setDocState(next);
            setLastChangeWasRemote(false);
            if (!spaceId) return;
            if (pushTimer.current) clearTimeout(pushTimer.current);
            pushTimer.current = setTimeout(() => {
                void updateSpaceDoc(spaceId, next as Record<string, unknown>);
            }, debounceMs);
        },
        [spaceId, debounceMs],
    );

    return { doc, space, loading, setDoc, lastChangeWasRemote };
}
