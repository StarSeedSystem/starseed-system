"use client";

/**
 * ── hub-social/delegations — Delegación Líquida (Voto Delegado, CLAUDE.md §3) ─
 *
 * La Ontocracia permite delegar tu voz en un TEMA (político/educativo/cultural/
 * social) a un perfil o entidad, de forma SIEMPRE revocable y nunca alienada
 * permanentemente. Este módulo la hace visible y funcional:
 *
 *   · SALIENTE (a quién delego): fuente de verdad local-first en `safe-storage`
 *     + nube en `entity_state` (owner_kind="user", key="delegations") + realtime
 *     (`subscribeEntityState`) + broadcast (`live-signal`). LWW por `updatedAt`
 *     con tumbas — copia EXACTA del patrón de Espacios de Trabajo/Librería.
 *     Una delegación activa por tema (una nueva sustituye a la anterior).
 *     Revocación en UN TOQUE (borrado con tumba).
 *
 *   · ENTRANTE (quién delega en mí): HONESTO sin DDL. Cuando delegas en una
 *     ENTIDAD de la que eres miembro/dueño, se escribe un espejo best-effort en
 *     el ámbito de esa entidad (`entity_state` key `inbound-delegation:<uid>`),
 *     legible por su dueño (RLS de entidad). Así el dueño ve quién le delegó su
 *     voz DENTRO de esa entidad. Fuera de ese alcance compartido (p. ej.
 *     delegar en un perfil ajeno), no es globalmente visible sin una tabla
 *     federada dedicada — y así se dice en la UI.
 */

import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { createClient } from "@/utils/supabase/client";
import { getCurrentUserId } from "@/lib/os-social";
import {
    getEntityState, setEntityState, subscribeEntityState, currentUserRef,
    type EntityRef, type EntityKind as StateEntityKind,
} from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import type { SystemKey, ConnType } from "@/lib/hub-social/meta";

/** El tema de una delegación coincide con los 4 sistemas de StarSeed. */
export type DelegationTopic = SystemKey;

export type DelegateKind = "profile" | "entity";

export interface Delegation {
    id: string;
    topic: DelegationTopic;
    delegateKind: DelegateKind;
    /** id de perfil o slug de entidad. */
    delegateId: string;
    delegateName: string;
    delegateAvatar?: string | null;
    delegateHref?: string;
    /** Para entidades: el tipo (color/sistema) y su ConnType (espejo entrante). */
    delegateSystem?: SystemKey;
    delegateType?: ConnType;
    note?: string;
    createdAt: number;
    updatedAt: number;
}

interface DelegationsBlob {
    v: 1;
    delegations: Delegation[];
    tombstones: Record<string, number>;
}

const CACHE_KEY = "starseed.hub.delegations.v1";
const ES_KEY = "delegations";
export const DELEGATIONS_TOPIC = "hub:delegations";
export const DELEGATIONS_EVENT = "starseed:hub-delegations";

const isClient = (): boolean => typeof window !== "undefined";

function emptyBlob(): DelegationsBlob {
    return { v: 1, delegations: [], tombstones: {} };
}

function normalize(raw: Partial<Delegation> & { id: string }): Delegation {
    const now = Date.now();
    const topic = (["politico", "educativo", "cultural", "social"] as SystemKey[]).includes(raw.topic as SystemKey)
        ? (raw.topic as DelegationTopic) : "social";
    return {
        id: raw.id,
        topic,
        delegateKind: raw.delegateKind === "entity" ? "entity" : "profile",
        delegateId: typeof raw.delegateId === "string" ? raw.delegateId : "",
        delegateName: typeof raw.delegateName === "string" && raw.delegateName.trim() ? raw.delegateName : "Sin nombre",
        delegateAvatar: raw.delegateAvatar ?? null,
        delegateHref: typeof raw.delegateHref === "string" ? raw.delegateHref : undefined,
        delegateSystem: raw.delegateSystem,
        delegateType: raw.delegateType,
        note: typeof raw.note === "string" ? raw.note : undefined,
        createdAt: Number(raw.createdAt ?? now),
        updatedAt: Number(raw.updatedAt ?? now),
    };
}

function readBlob(): DelegationsBlob {
    if (!isClient()) return emptyBlob();
    try {
        const raw = safeGet(CACHE_KEY);
        if (!raw) return emptyBlob();
        const p = JSON.parse(raw) as Partial<DelegationsBlob> | null;
        return {
            v: 1,
            delegations: Array.isArray(p?.delegations)
                ? (p!.delegations as Delegation[]).filter((d) => d && typeof d.id === "string").map(normalize)
                : [],
            tombstones: p?.tombstones && typeof p.tombstones === "object" ? (p.tombstones as Record<string, number>) : {},
        };
    } catch {
        return emptyBlob();
    }
}

function writeBlob(blob: DelegationsBlob): void {
    if (!isClient()) return;
    safeSet(CACHE_KEY, JSON.stringify(blob));
    try { window.dispatchEvent(new CustomEvent(DELEGATIONS_EVENT)); } catch { /* noop */ }
}

export function cachedDelegations(): Delegation[] {
    return [...readBlob().delegations].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function ownerRef(): Promise<EntityRef | null> {
    return currentUserRef();
}

function mergeBlobs(a: DelegationsBlob, b: DelegationsBlob): DelegationsBlob {
    const tombstones: Record<string, number> = { ...a.tombstones };
    for (const [id, ts] of Object.entries(b.tombstones)) {
        tombstones[id] = Math.max(tombstones[id] ?? 0, ts);
    }
    const byId = new Map<string, Delegation>();
    for (const d of [...a.delegations, ...b.delegations]) {
        const prev = byId.get(d.id);
        if (!prev || d.updatedAt >= prev.updatedAt) byId.set(d.id, d);
    }
    const delegations: Delegation[] = [];
    for (const d of byId.values()) {
        const deletedAt = tombstones[d.id];
        if (deletedAt && deletedAt >= d.updatedAt) continue;
        delegations.push(d);
    }
    return { v: 1, delegations, tombstones };
}

function blobFromCloud(value: Partial<DelegationsBlob> | undefined): DelegationsBlob {
    if (!value) return emptyBlob();
    return {
        v: 1,
        delegations: Array.isArray(value.delegations)
            ? (value.delegations as Delegation[]).filter((d) => d && typeof d.id === "string").map(normalize)
            : [],
        tombstones: value.tombstones && typeof value.tombstones === "object"
            ? (value.tombstones as Record<string, number>) : {},
    };
}

export async function refreshDelegations(): Promise<Delegation[]> {
    const ref = await ownerRef();
    if (!ref) return cachedDelegations();
    try {
        const row = await getEntityState<Partial<DelegationsBlob>>(ref, ES_KEY);
        const merged = mergeBlobs(readBlob(), blobFromCloud(row?.value));
        writeBlob(merged);
        return [...merged.delegations].sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
        return cachedDelegations();
    }
}

async function pushBlob(blob: DelegationsBlob): Promise<void> {
    const ref = await ownerRef();
    if (!ref) return;
    try {
        await setEntityState(ref, ES_KEY, blob);
        void emitChange(DELEGATIONS_TOPIC, { data: { kind: "delegations" } });
    } catch { /* best-effort: la caché local ya lo tiene */ }
}

async function mutate(fn: (blob: DelegationsBlob) => DelegationsBlob): Promise<Delegation[]> {
    let base = readBlob();
    const ref = await ownerRef();
    if (ref) {
        try {
            const row = await getEntityState<Partial<DelegationsBlob>>(ref, ES_KEY);
            if (row?.value) base = mergeBlobs(base, blobFromCloud(row.value));
        } catch { /* usa la caché local */ }
    }
    const next = fn(base);
    writeBlob(next);
    await pushBlob(next);
    return [...next.delegations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function uuid(): string {
    try { return crypto.randomUUID(); }
    catch { return `del-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}

export interface SetDelegationInput {
    topic: DelegationTopic;
    delegateKind: DelegateKind;
    delegateId: string;
    delegateName: string;
    delegateAvatar?: string | null;
    delegateHref?: string;
    delegateSystem?: SystemKey;
    delegateType?: ConnType;
    note?: string;
}

/**
 * Fija (o sustituye) la delegación de un tema. Solo puede haber una activa por
 * tema: crear otra para el mismo tema reemplaza la anterior (con tumba).
 * Escribe también el espejo entrante best-effort si es una entidad.
 */
export async function setDelegation(input: SetDelegationInput): Promise<Delegation> {
    const now = Date.now();
    const del = normalize({ id: uuid(), ...input, createdAt: now, updatedAt: now });
    let replacedIds: string[] = [];
    await mutate((blob) => {
        // Retira cualquier delegación previa del MISMO tema (tumba).
        const sameTopic = blob.delegations.filter((d) => d.topic === del.topic);
        replacedIds = sameTopic.map((d) => d.id);
        const tombstones = { ...blob.tombstones };
        for (const id of replacedIds) tombstones[id] = now;
        delete tombstones[del.id];
        const kept = blob.delegations.filter((d) => d.topic !== del.topic);
        return { v: 1, delegations: [...kept, del], tombstones };
    });
    // Espejo entrante (best-effort): que el dueño de la entidad lo vea.
    void writeInboundMirror(del);
    return del;
}

/** Revoca una delegación (borrado con tumba). Un solo toque. */
export async function revokeDelegation(id: string): Promise<void> {
    const prev = cachedDelegations().find((d) => d.id === id);
    await mutate((blob) => ({
        v: 1,
        delegations: blob.delegations.filter((d) => d.id !== id),
        tombstones: { ...blob.tombstones, [id]: Date.now() },
    }));
    if (prev) void clearInboundMirror(prev);
}

// ── Espejo ENTRANTE (honesto, best-effort) ──────────────────────────────────

function stateKindOf(type?: ConnType): StateEntityKind | null {
    switch (type) {
        case "pagina": return "page";
        case "grupo": return "group";
        case "evento": return "event";
        default: return null;
    }
}

interface InboundValue {
    topic: DelegationTopic;
    delegatorUid: string;
    delegatorName: string;
    delegatorAvatar?: string | null;
    entitySlug: string;
    entityName: string;
    at: string;
    revoked?: boolean;
}

async function myProfileMeta(): Promise<{ uid: string; name: string; avatar: string | null } | null> {
    const uid = await getCurrentUserId();
    if (!uid) return null;
    // Nombre/avatar mejor esfuerzo desde el perfil por defecto (no crítico).
    return { uid, name: "Ciudadano StarSeed", avatar: null };
}

async function writeInboundMirror(del: Delegation): Promise<void> {
    if (del.delegateKind !== "entity") return;
    const kind = stateKindOf(del.delegateType);
    if (!kind) return;
    try {
        const me = await myProfileMeta();
        if (!me) return;
        const value: InboundValue = {
            topic: del.topic,
            delegatorUid: me.uid,
            delegatorName: me.name,
            delegatorAvatar: me.avatar,
            entitySlug: del.delegateId,
            entityName: del.delegateName,
            at: new Date().toISOString(),
        };
        await setEntityState({ kind, id: del.delegateId }, `inbound-delegation:${me.uid}`, value);
    } catch { /* RLS/red: el espejo entrante es opcional */ }
}

async function clearInboundMirror(del: Delegation): Promise<void> {
    if (del.delegateKind !== "entity") return;
    const kind = stateKindOf(del.delegateType);
    if (!kind) return;
    try {
        const uid = await getCurrentUserId();
        if (!uid) return;
        await setEntityState({ kind, id: del.delegateId }, `inbound-delegation:${uid}`, { revoked: true, at: new Date().toISOString() });
    } catch { /* best-effort */ }
}

export interface InboundDelegation {
    delegatorUid: string;
    delegatorName: string;
    delegatorAvatar?: string | null;
    topic: DelegationTopic;
    entitySlug: string;
    entityName: string;
    at: string;
}

/**
 * Lee «quién delega en mí» dentro de las entidades que administro. Best-effort:
 * consulta las filas `inbound-delegation:*` de cada ámbito (RLS deja leer al
 * dueño de la entidad). Devuelve [] si no hay nada visible o falla.
 */
export async function loadInboundDelegations(
    ownedEntities: Array<{ type: ConnType; slug: string }>,
): Promise<InboundDelegation[]> {
    if (ownedEntities.length === 0) return [];
    const uid = await getCurrentUserId();
    if (!uid) return [];
    const out: InboundDelegation[] = [];
    try {
        const supabase = createClient();
        for (const ent of ownedEntities) {
            const kind = stateKindOf(ent.type);
            if (!kind) continue;
            try {
                const { data } = await supabase
                    .from("entity_state")
                    .select("key, value")
                    .eq("owner_kind", kind)
                    .eq("owner_id", ent.slug)
                    .like("key", "inbound-delegation:%");
                for (const row of (data as Array<{ key: string; value: InboundValue }> | null) ?? []) {
                    const v = row.value;
                    if (!v || v.revoked || v.delegatorUid === uid) continue; // ignora revocadas y mis propias
                    out.push({
                        delegatorUid: v.delegatorUid,
                        delegatorName: v.delegatorName || "Ciudadano StarSeed",
                        delegatorAvatar: v.delegatorAvatar ?? null,
                        topic: v.topic,
                        entitySlug: v.entitySlug || ent.slug,
                        entityName: v.entityName || ent.slug,
                        at: v.at,
                    });
                }
            } catch { /* una entidad ilegible no aborta el resto */ }
        }
    } catch { /* sin nube: vacío honesto */ }
    return out;
}

// ── Sync en vivo + Hook ─────────────────────────────────────────────────────

const SYNC_FLAG = "__STARSEED_DELEGATIONS_SYNC__";

export function startDelegationsSync(): void {
    if (!isClient()) return;
    const w = window as unknown as Record<string, unknown>;
    if (w[SYNC_FLAG]) return;
    w[SYNC_FLAG] = true;
    const boot = async () => {
        const ref = await ownerRef();
        if (!ref) return;
        await refreshDelegations();
        subscribeEntityState(ref, ES_KEY, () => { void refreshDelegations(); });
        onChange(DELEGATIONS_TOPIC, () => { void refreshDelegations(); });
    };
    void boot();
}

export interface UseDelegations {
    delegations: Delegation[];
    loading: boolean;
    setOne: (input: SetDelegationInput) => Promise<Delegation>;
    revoke: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useDelegations(): UseDelegations {
    const [delegations, setDelegations] = useState<Delegation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isClient()) return;
        startDelegationsSync();
        const sync = () => setDelegations(cachedDelegations());
        sync();
        void refreshDelegations().then(() => { sync(); setLoading(false); });
        const onLocal = () => sync();
        const onStorage = (e: StorageEvent) => { if (e.key === CACHE_KEY) sync(); };
        window.addEventListener(DELEGATIONS_EVENT, onLocal);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(DELEGATIONS_EVENT, onLocal);
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const setOne = useCallback(async (input: SetDelegationInput) => {
        const d = await setDelegation(input);
        setDelegations(cachedDelegations());
        return d;
    }, []);
    const revoke = useCallback(async (id: string) => {
        await revokeDelegation(id);
        setDelegations(cachedDelegations());
    }, []);
    const refresh = useCallback(async () => {
        await refreshDelegations();
        setDelegations(cachedDelegations());
    }, []);

    return { delegations, loading, setOne, revoke, refresh };
}
