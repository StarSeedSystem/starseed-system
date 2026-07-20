"use client";

/*
 * cultural/twinning — HERMANAMIENTO DE SANGHAS (vínculo entidad↔entidad).
 * ---------------------------------------------------------------------------
 * Un hermanamiento es un vínculo de primera clase entre dos entidades (páginas,
 * comunidades, grupos). Persistencia SIN DDL, con INVITACIÓN REAL a la otra
 * entidad reutilizando el patrón de compartir de los workspaces:
 *
 *   · Índice por entidad → `entity_state` clave "twinnings" (lista de vínculos
 *     con estado propuesto/aceptado). Cada entidad guarda su propia copia.
 *   · Canal cruzado REAL → un espejo `os_spaces` (kind "board", access "invite")
 *     cuyo `doc` describe el hermanamiento; se INVITA a la cuenta dueña de la
 *     otra entidad (invitación real, igual que al compartir un workspace). Al
 *     aceptar, la otra parte marca su propia copia como "aceptado".
 *
 * Defensivo: nunca lanza; degrada con honestidad si falta sesión/permiso.
 */

import { createClient } from "@/utils/supabase/client";
import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";
import {
    createSpace,
    getSpace,
    updateSpaceDoc,
    inviteToSpace,
    acceptInvite,
    listMySpaces,
    type Space,
} from "@/lib/spaces/spaces";

/* ------------------------------------------------------------------ */
/* Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Clase de entidad hermanable (vive en os_pages o os_groups). */
export type TwinKind = "page" | "group";

/** Referencia mínima a una entidad hermanable. */
export interface TwinEntity {
    kind: TwinKind;
    /** Slug de la entidad (clave estable). */
    slug: string;
    /** Nombre visible. */
    name: string;
    /** Sistema cultural declarado (para el color del lazo). */
    systemId?: string;
    avatarUrl?: string | null;
}

export type TwinStatus = "propuesto" | "aceptado";

/** Un vínculo de hermanamiento tal y como lo guarda cada entidad. */
export interface Twinning {
    id: string;
    /** Entidad "propia" (la dueña de esta copia del registro). */
    self: TwinEntity;
    /** Entidad hermanada. */
    other: TwinEntity;
    status: TwinStatus;
    /** Espejo os_spaces (canal de la invitación real). */
    spaceId: string | null;
    /** true si ESTA entidad originó la propuesta. */
    proposedByMe: boolean;
    createdAt: number;
    updatedAt: number;
}

const TWINNINGS_KEY = "twinnings";

/** Ref de entity_state para una entidad hermanable (owner_id = slug). */
function twinRef(entity: TwinEntity): EntityRef {
    return { kind: entity.kind, id: entity.slug };
}

function newId(): string {
    try {
        if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {
        /* noop */
    }
    return `tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                            */
/* ------------------------------------------------------------------ */

/** Lista los hermanamientos guardados por una entidad. Nunca lanza. */
export async function listTwinnings(entity: TwinEntity): Promise<Twinning[]> {
    try {
        const row = await getEntityState<Twinning[]>(twinRef(entity), TWINNINGS_KEY);
        const list = Array.isArray(row?.value) ? (row!.value as Twinning[]) : [];
        return list.filter((t) => t && t.other && t.self);
    } catch {
        return [];
    }
}

/** Resuelve la cuenta dueña de una entidad (para invitarla de verdad). */
async function resolveOwnerAccount(entity: TwinEntity): Promise<string | null> {
    try {
        const supabase = createClient();
        const table = entity.kind === "group" ? "os_groups" : "os_pages";
        const { data } = await supabase.from(table).select("owner_id").eq("slug", entity.slug).maybeSingle();
        const ownerId = (data as { owner_id?: string } | null)?.owner_id;
        return ownerId ?? null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Escritura (append/update en la copia de una entidad)              */
/* ------------------------------------------------------------------ */

async function upsertTwinning(entity: TwinEntity, record: Twinning): Promise<boolean> {
    try {
        const current = await listTwinnings(entity);
        const idx = current.findIndex((t) => t.id === record.id || (t.other.slug === record.other.slug && t.other.kind === record.other.kind));
        const next = current.slice();
        if (idx >= 0) next[idx] = { ...record, updatedAt: Date.now() };
        else next.push(record);
        const res = await setEntityState(twinRef(entity), TWINNINGS_KEY, next);
        return res !== null;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* Proponer / aceptar                                                 */
/* ------------------------------------------------------------------ */

export interface ProposeResult {
    ok: boolean;
    twinning?: Twinning;
    /** true si se pudo enviar la invitación real a la otra entidad. */
    invited: boolean;
    error?: string;
}

/**
 * Propone hermanar `from` (una entidad que administro) con `to`. Crea el espejo
 * os_spaces, invita a la cuenta dueña de `to` (invitación real) y guarda el
 * registro en la copia de `from`. Nunca lanza.
 */
export async function proposeTwinning(from: TwinEntity, to: TwinEntity): Promise<ProposeResult> {
    if (from.slug === to.slug && from.kind === to.kind) {
        return { ok: false, invited: false, error: "Una entidad no puede hermanarse consigo misma." };
    }
    const now = Date.now();
    const id = newId();

    // 1) Espejo os_spaces con el descriptor del hermanamiento.
    let spaceId: string | null = null;
    let invited = false;
    try {
        const space = await createSpace({
            kind: "board",
            title: `Hermanamiento · ${from.name} ↔ ${to.name}`,
            access: "invite",
            doc: {
                type: "twinning",
                twinningId: id,
                a: from,
                b: to,
                status: "propuesto" as TwinStatus,
                at: now,
            },
        });
        spaceId = space?.id ?? null;

        // 2) Invitar a la cuenta dueña de la otra entidad (invitación REAL).
        if (spaceId) {
            const ownerAccount = await resolveOwnerAccount(to);
            if (ownerAccount) {
                invited = await inviteToSpace(spaceId, ownerAccount, "editor");
            }
        }
    } catch {
        /* si el espejo falla, seguimos: al menos guardamos la propuesta local */
    }

    // 3) Guardar el registro en la copia de la entidad proponente.
    const record: Twinning = {
        id,
        self: from,
        other: to,
        status: "propuesto",
        spaceId,
        proposedByMe: true,
        createdAt: now,
        updatedAt: now,
    };
    const saved = await upsertTwinning(from, record);
    if (!saved) {
        return { ok: false, invited, error: "No se pudo guardar el hermanamiento (¿sesión o permisos?)." };
    }
    return { ok: true, twinning: record, invited };
}

/**
 * Acepta un hermanamiento propuesto (desde la entidad `accepter`). Acepta la
 * invitación del espejo, marca el doc como "aceptado" y guarda el estado en la
 * copia de `accepter`. Nunca lanza.
 */
export async function acceptTwinning(accepter: TwinEntity, twinning: Twinning): Promise<{ ok: boolean; error?: string }> {
    try {
        if (twinning.spaceId) {
            await acceptInvite(twinning.spaceId).catch(() => false);
            const space = await getSpace(twinning.spaceId);
            if (space) {
                await updateSpaceDoc(twinning.spaceId, { ...space.doc, status: "aceptado", acceptedAt: Date.now() });
            }
        }
        const record: Twinning = {
            ...twinning,
            self: accepter,
            other: twinning.self.slug === accepter.slug ? twinning.other : twinning.self,
            status: "aceptado",
            proposedByMe: false,
            updatedAt: Date.now(),
        };
        const saved = await upsertTwinning(accepter, record);
        return saved ? { ok: true } : { ok: false, error: "No se pudo guardar la aceptación." };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudo aceptar el hermanamiento." };
    }
}

/** Descriptor de una invitación de hermanamiento entrante (desde os_spaces). */
export interface IncomingTwinningInvite {
    space: Space;
    twinningId: string;
    a: TwinEntity;
    b: TwinEntity;
    status: TwinStatus;
}

/**
 * Lista invitaciones de hermanamiento entrantes: espejos os_spaces de tipo
 * "twinning" a los que me han invitado y que aún no he originado yo.
 */
export async function listIncomingTwinningInvites(): Promise<IncomingTwinningInvite[]> {
    try {
        const spaces = await listMySpaces("board");
        const out: IncomingTwinningInvite[] = [];
        for (const space of spaces) {
            const doc = space.doc as Record<string, unknown>;
            if (doc?.type !== "twinning") continue;
            const a = doc.a as TwinEntity | undefined;
            const b = doc.b as TwinEntity | undefined;
            if (!a || !b) continue;
            out.push({
                space,
                twinningId: String(doc.twinningId ?? space.id),
                a,
                b,
                status: (doc.status as TwinStatus) ?? "propuesto",
            });
        }
        return out;
    } catch {
        return [];
    }
}
