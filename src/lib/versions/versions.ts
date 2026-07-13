"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * versions — HISTORIAL, RAMAS y REGISTRO de cualquier recurso del OS
 * ---------------------------------------------------------------------------
 * SOP: architecture/folders-permisos-publicaciones.md §2.
 * Tablas (migración `supabase/migrations/20260712100000_os_versions.sql`,
 * APLICADA y verificada en la base del OS `nxstilnyidvkqeosofuh`):
 *
 *   · public.os_versions   — revisiones APPEND-ONLY (no hay política de UPDATE:
 *     una revisión jamás se reescribe). Clave natural
 *     (resource_kind, resource_id, branch, rev) con índice UNIQUE.
 *   · public.os_access_log — registro de accesos y cambios.
 *
 * PERMISOS (RLS, derivados del recurso — nunca duplicados aquí):
 *   · Ve el historial quien puede VER el recurso   → `osv_can_read(owner)`.
 *   · Crea revisiones quien puede EDITARLO         → `osv_can_write(owner)`.
 *   `owner` es la EntityRef serializada: `<kind>:<id>` (p.ej. `user:<uuid>`,
 *   `group:mi-grupo`). Se construye con `ownerOf()`.
 *
 * BINARIOS: los archivos NUNCA se sobrescriben. Cada revisión vive en su propio
 * objeto de Storage `<uid>/<fileId>/<rev>/<name>` (ver `versionStoragePath()` y
 * `uploadFileVersion()` en src/lib/files/os-files.ts) y la fila guarda el puntero
 * en `storage_path`.
 *
 * Filosofía del repo: NUNCA lanza, SSR-safe, no bloqueante. El versionado es una
 * garantía, no un peaje: si falla (offline, sin sesión), el guardado del recurso
 * sigue adelante y la revisión se pierde — nunca al revés.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { deviceId, type EntityRef } from "@/lib/sync/entity-state";
import { emitChange } from "@/lib/sync/live-signal";

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Qué se versiona (mismo vocabulario que el CHECK de la tabla). */
export type ResourceKind = "library" | "folder" | "file" | "brain" | "post";

/** Rama por defecto de todo recurso. */
export const MAIN_BRANCH = "main";

export interface ResourceVersion {
    id: string;
    resourceKind: ResourceKind;
    resourceId: string;
    owner: string;
    rev: number;
    parentRev: number | null;
    branch: string;
    author: string | null;
    deviceId: string | null;
    message: string | null;
    size: number | null;
    checksum: string | null;
    /** Puntero al objeto de Storage (solo binarios). */
    storagePath: string | null;
    snapshot: Record<string, unknown> | null;
    createdAt: string;
}

export interface AccessLogEntry {
    id: string;
    resourceKind: ResourceKind;
    resourceId: string;
    owner: string;
    action: string;
    actor: string | null;
    deviceId: string | null;
    detail: Record<string, unknown>;
    createdAt: string;
}

export interface BranchInfo {
    branch: string;
    /** Revisión más alta de la rama. */
    head: number;
    /** Nº de revisiones en la rama. */
    count: number;
    lastAt: string;
}

interface VersionRow {
    id: string;
    resource_kind: string;
    resource_id: string;
    owner: string;
    rev: number;
    parent_rev: number | null;
    branch: string;
    author: string | null;
    device_id: string | null;
    message: string | null;
    size: number | null;
    checksum: string | null;
    storage_path: string | null;
    snapshot: unknown;
    created_at: string;
}

interface LogRow {
    id: string;
    resource_kind: string;
    resource_id: string;
    owner: string;
    action: string;
    actor: string | null;
    device_id: string | null;
    detail: unknown;
    created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isClient(): boolean {
    return typeof window !== "undefined";
}

/** Serializa una EntityRef al `owner` de la tabla: `<kind>:<id>`. */
export function ownerOf(ref: EntityRef): string {
    return `${ref.kind}:${ref.id}`;
}

/** Topic de señal en vivo del historial de un recurso. */
export function versionsTopic(kind: ResourceKind, resourceId: string): string {
    return `versions:${kind}:${resourceId}`;
}

/** Ruta INMUTABLE del objeto de Storage de una revisión binaria. */
export function versionStoragePath(uid: string, fileId: string, rev: number, name: string): string {
    return `${uid}/${fileId}/${rev}/${name}`;
}

function normalizeVersion(row: VersionRow): ResourceVersion {
    return {
        id: row.id,
        resourceKind: row.resource_kind as ResourceKind,
        resourceId: row.resource_id,
        owner: row.owner,
        rev: Number(row.rev ?? 0),
        parentRev: row.parent_rev == null ? null : Number(row.parent_rev),
        branch: row.branch || MAIN_BRANCH,
        author: row.author,
        deviceId: row.device_id,
        message: row.message,
        size: row.size == null ? null : Number(row.size),
        checksum: row.checksum,
        storagePath: row.storage_path,
        snapshot: row.snapshot && typeof row.snapshot === "object" ? (row.snapshot as Record<string, unknown>) : null,
        createdAt: row.created_at,
    };
}

function normalizeLog(row: LogRow): AccessLogEntry {
    return {
        id: row.id,
        resourceKind: row.resource_kind as ResourceKind,
        resourceId: row.resource_id,
        owner: row.owner,
        action: row.action,
        actor: row.actor,
        deviceId: row.device_id,
        detail: row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {},
        createdAt: row.created_at,
    };
}

async function currentUid(): Promise<string | null> {
    if (!isClient()) return null;
    try {
        const { data } = await createClient().auth.getUser();
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Checksum estable y barato de un texto (FNV-1a 32 bits, hex). No es
 * criptográfico: sirve para detectar "¿esto cambió de verdad?" sin depender de
 * WebCrypto (que en http:// no está disponible) ni añadir dependencias npm.
 */
export function quickChecksum(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

// ── Lectura ─────────────────────────────────────────────────────────────────

export interface ListVersionsOptions {
    /** Rama concreta (por defecto TODAS las ramas del recurso). */
    branch?: string;
    limit?: number;
}

/**
 * Revisiones de un recurso, más recientes primero. RLS decide qué se ve: si el
 * usuario no puede ver el recurso, devuelve [] (nunca lanza).
 */
export async function listVersions(
    kind: ResourceKind,
    resourceId: string,
    ref: EntityRef,
    options: ListVersionsOptions = {},
): Promise<ResourceVersion[]> {
    if (!isClient()) return [];
    try {
        const supabase = createClient();
        let q = supabase
            .from("os_versions")
            .select("*")
            .eq("resource_kind", kind)
            .eq("resource_id", resourceId)
            .eq("owner", ownerOf(ref))
            .order("created_at", { ascending: false });
        if (options.branch) q = q.eq("branch", options.branch);
        q = q.limit(options.limit ?? 100);
        const { data, error } = await q;
        if (error || !Array.isArray(data)) return [];
        return (data as VersionRow[]).map(normalizeVersion);
    } catch {
        return [];
    }
}

/** Ramas de un recurso con su HEAD (rev más alta) y nº de revisiones. */
export async function listBranches(
    kind: ResourceKind,
    resourceId: string,
    ref: EntityRef,
): Promise<BranchInfo[]> {
    const versions = await listVersions(kind, resourceId, ref, { limit: 500 });
    const byBranch = new Map<string, BranchInfo>();
    for (const v of versions) {
        const current = byBranch.get(v.branch);
        if (!current) {
            byBranch.set(v.branch, { branch: v.branch, head: v.rev, count: 1, lastAt: v.createdAt });
        } else {
            current.count += 1;
            if (v.rev > current.head) current.head = v.rev;
            if (Date.parse(v.createdAt) > Date.parse(current.lastAt)) current.lastAt = v.createdAt;
        }
    }
    // `main` siempre primero; el resto por actividad reciente.
    return Array.from(byBranch.values()).sort((a, b) => {
        if (a.branch === MAIN_BRANCH) return -1;
        if (b.branch === MAIN_BRANCH) return 1;
        return Date.parse(b.lastAt) - Date.parse(a.lastAt);
    });
}

/** Revisión más alta de una rama (0 si la rama aún no existe). Nunca lanza. */
export async function headRev(
    kind: ResourceKind,
    resourceId: string,
    ref: EntityRef,
    branch: string = MAIN_BRANCH,
): Promise<number> {
    if (!isClient()) return 0;
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_versions")
            .select("rev")
            .eq("resource_kind", kind)
            .eq("resource_id", resourceId)
            .eq("owner", ownerOf(ref))
            .eq("branch", branch)
            .order("rev", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error || !data) return 0;
        return Number((data as { rev?: number }).rev ?? 0);
    } catch {
        return 0;
    }
}

// ── Escritura ───────────────────────────────────────────────────────────────

export interface RecordVersionInput {
    kind: ResourceKind;
    resourceId: string;
    ref: EntityRef;
    /** Mensaje legible ("renombrar folder «Ideas»"). */
    message?: string;
    branch?: string;
    /** Instantánea del contenido (documentos/estructura). */
    snapshot?: Record<string, unknown> | null;
    size?: number | null;
    checksum?: string | null;
    /** Binarios: `<uid>/<fileId>/<rev>/<name>` (ver `versionStoragePath`). */
    storagePath?: string | null;
    /** Fuerza el `rev` (para binarios ya subidos a una ruta concreta). */
    rev?: number;
}

export interface RecordVersionResult {
    ok: boolean;
    version?: ResourceVersion;
    /** Mensaje de error legible (nunca se traga en silencio: el llamador decide). */
    error?: string;
}

/**
 * Crea una REVISIÓN del recurso. NO bloqueante por contrato: el llamador la
 * invoca con `void` tras un guardado con ÉXITO. Calcula `rev` como
 * `headRev(branch) + 1` y `parent_rev` como el head anterior.
 *
 * Reintenta UNA vez si dos dispositivos compiten por el mismo `rev` (violación
 * del índice UNIQUE (resource_kind,resource_id,branch,rev) → código 23505).
 */
export async function recordVersion(input: RecordVersionInput): Promise<RecordVersionResult> {
    if (!isClient()) return { ok: false, error: "No disponible en el servidor." };
    const uid = await currentUid();
    if (!uid) return { ok: false, error: "Sin sesión: la revisión no se registra en la nube." };

    const branch = input.branch || MAIN_BRANCH;
    const supabase = createClient();

    for (let attempt = 0; attempt < 2; attempt++) {
        const head = input.rev != null && attempt === 0 ? input.rev - 1 : await headRev(input.kind, input.resourceId, input.ref, branch);
        const rev = input.rev != null && attempt === 0 ? input.rev : head + 1;
        try {
            const { data, error } = await supabase
                .from("os_versions")
                .insert({
                    resource_kind: input.kind,
                    resource_id: input.resourceId,
                    owner: ownerOf(input.ref),
                    rev,
                    parent_rev: head > 0 ? head : null,
                    branch,
                    author: uid,
                    device_id: deviceId(),
                    message: input.message ?? null,
                    size: input.size ?? null,
                    checksum: input.checksum ?? null,
                    storage_path: input.storagePath ?? null,
                    snapshot: input.snapshot ?? null,
                })
                .select("*")
                .single();

            if (!error && data) {
                const version = normalizeVersion(data as VersionRow);
                // Señal en vivo: los demás dispositivos refrescan su historial.
                void emitChange(versionsTopic(input.kind, input.resourceId), {
                    id: version.id,
                    updatedAt: version.createdAt,
                    entity: { kind: input.ref.kind, id: input.ref.id },
                });
                return { ok: true, version };
            }
            // 23505 = carrera por el mismo `rev`: recalculamos el head y reintentamos.
            const code = (error as { code?: string } | null)?.code;
            if (code === "23505" && attempt === 0) continue;
            return { ok: false, error: error?.message || "No se pudo registrar la revisión." };
        } catch (e) {
            return { ok: false, error: (e as Error)?.message || "Error inesperado al registrar la revisión." };
        }
    }
    return { ok: false, error: "No se pudo registrar la revisión (conflicto de revisión persistente)." };
}

/**
 * RESTAURAR una revisión: NO reescribe el pasado (la tabla es append-only).
 * Devuelve el `snapshot` de la revisión pedida y ANOTA una revisión NUEVA en la
 * cabeza de la rama documentando la restauración. Quien llama es responsable de
 * aplicar el snapshot al recurso real (la biblioteca, el folder, el archivo…),
 * porque solo él conoce su forma.
 */
export async function restoreVersion(
    versionId: string,
    opts?: { message?: string },
): Promise<{ ok: boolean; snapshot?: Record<string, unknown> | null; version?: ResourceVersion; error?: string }> {
    if (!isClient()) return { ok: false, error: "No disponible en el servidor." };
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_versions").select("*").eq("id", versionId).maybeSingle();
        if (error || !data) return { ok: false, error: error?.message || "No se encontró esa revisión." };
        const source = normalizeVersion(data as VersionRow);

        const [kind, ...rest] = source.owner.split(":");
        const ref: EntityRef = { kind: kind as EntityRef["kind"], id: rest.join(":") };

        const res = await recordVersion({
            kind: source.resourceKind,
            resourceId: source.resourceId,
            ref,
            branch: source.branch,
            message: opts?.message ?? `Restaurar rev ${source.rev}`,
            snapshot: source.snapshot,
            size: source.size,
            checksum: source.checksum,
            storagePath: source.storagePath,
        });
        if (!res.ok) return { ok: false, snapshot: source.snapshot, error: res.error };

        void logAccess({
            kind: source.resourceKind,
            resourceId: source.resourceId,
            ref,
            action: "restore",
            detail: { fromRev: source.rev, branch: source.branch },
        });

        return { ok: true, snapshot: source.snapshot, version: res.version };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "Error inesperado al restaurar." };
    }
}

/**
 * RAMIFICAR desde una revisión: abre una línea `branch` NUEVA cuyo primer `rev`
 * es 1 y cuyo `parent_rev` apunta a la revisión de origen. El original queda
 * intacto (una rama es una variación, no una sobreescritura).
 */
export async function branchFrom(
    versionId: string,
    branch: string,
    opts?: { message?: string },
): Promise<RecordVersionResult> {
    if (!isClient()) return { ok: false, error: "No disponible en el servidor." };
    const name = branch.trim();
    if (!name) return { ok: false, error: "El nombre de la rama no puede estar vacío." };
    if (name === MAIN_BRANCH) return { ok: false, error: "«main» es la rama principal: elige otro nombre." };

    const uid = await currentUid();
    if (!uid) return { ok: false, error: "Inicia sesión para crear una rama." };

    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_versions").select("*").eq("id", versionId).maybeSingle();
        if (error || !data) return { ok: false, error: error?.message || "No se encontró la revisión de origen." };
        const source = normalizeVersion(data as VersionRow);

        const existing = await headRev(
            source.resourceKind,
            source.resourceId,
            { kind: source.owner.split(":")[0] as EntityRef["kind"], id: source.owner.split(":").slice(1).join(":") },
            name,
        );
        if (existing > 0) return { ok: false, error: `La rama «${name}» ya existe.` };

        const { data: inserted, error: insErr } = await supabase
            .from("os_versions")
            .insert({
                resource_kind: source.resourceKind,
                resource_id: source.resourceId,
                owner: source.owner,
                rev: 1,
                parent_rev: source.rev,
                branch: name,
                author: uid,
                device_id: deviceId(),
                message: opts?.message ?? `Rama «${name}» desde rev ${source.rev} de «${source.branch}»`,
                size: source.size,
                checksum: source.checksum,
                storage_path: source.storagePath,
                snapshot: source.snapshot,
            })
            .select("*")
            .single();

        if (insErr || !inserted) return { ok: false, error: insErr?.message || "No se pudo crear la rama." };

        const version = normalizeVersion(inserted as VersionRow);
        void emitChange(versionsTopic(source.resourceKind, source.resourceId), {
            id: version.id,
            updatedAt: version.createdAt,
        });
        return { ok: true, version };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "Error inesperado al ramificar." };
    }
}

// ── Registro (logs) ─────────────────────────────────────────────────────────

export interface LogAccessInput {
    kind: ResourceKind;
    resourceId: string;
    ref: EntityRef;
    /** open · view · download · create · edit · rename · move · delete · restore · branch · share · permisos */
    action: string;
    detail?: Record<string, unknown>;
}

/**
 * Registra un acceso o cambio. Best-effort absoluto: nunca lanza y nunca
 * bloquea la acción registrada (se llama con `void`).
 */
export async function logAccess(input: LogAccessInput): Promise<boolean> {
    if (!isClient()) return false;
    try {
        const uid = await currentUid();
        if (!uid) return false;
        const supabase = createClient();
        const { error } = await supabase.from("os_access_log").insert({
            resource_kind: input.kind,
            resource_id: input.resourceId,
            owner: ownerOf(input.ref),
            action: input.action,
            actor: uid,
            device_id: deviceId(),
            detail: input.detail ?? {},
        });
        return !error;
    } catch {
        return false;
    }
}

/** Entradas del registro de un recurso, más recientes primero. Nunca lanza. */
export async function listAccessLog(
    kind: ResourceKind,
    resourceId: string,
    ref: EntityRef,
    limit = 100,
): Promise<AccessLogEntry[]> {
    if (!isClient()) return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("os_access_log")
            .select("*")
            .eq("resource_kind", kind)
            .eq("resource_id", resourceId)
            .eq("owner", ownerOf(ref))
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        return (data as LogRow[]).map(normalizeLog);
    } catch {
        return [];
    }
}
