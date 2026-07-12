"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * os-files — SUBIDA UNIVERSAL de archivos (cualquier tipo, cualquier contexto)
 * ---------------------------------------------------------------------------
 * Capa de datos para el almacenamiento REAL en la nube de StarSeed OS.
 * Backend YA APLICADO en Supabase (`dzkjapinnewkxzjltadv`), verificado:
 *
 *   Storage: bucket `os-files` (público-lectura; escritura/actualización/
 *   borrado SOLO en tu propio prefijo `<auth.uid()>/...`, vía
 *   `storage.foldername(name)[1] = auth.uid()`).
 *
 *   Tabla public.os_files(id uuid pk, owner uuid, profile_id uuid, name text,
 *   mime text, size bigint, path text, url text, device_id text,
 *   is_public boolean default false, acl_read uuid[], acl_write uuid[],
 *   group_slug text, meta jsonb, created_at timestamptz) — RLS:
 *     · osf_own      (owner = auth.uid())              → dueño: todo.
 *     · osf_select   lectura si is_public/acl_read/acl_write/miembro de grupo.
 *     · osf_shared_write escritura si auth.uid() ∈ acl_write.
 *   Realtime ON (publicación `supabase_realtime`).
 *
 * SOP: architecture/libreria-biblioteca-sync.md §9. Filosofía del repo:
 * nunca lanza, SSR-safe, degrada a null/[]/false sin sesión o ante error de
 * red — un fallo de subida jamás debe romper la UI que la invoca.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { deviceId } from "@/lib/sync/entity-state";

const BUCKET = "os-files";
/** Límite honesto de subida (bytes). ~50MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface OsFile {
    id: string;
    owner: string;
    profileId: string | null;
    name: string;
    mime: string | null;
    size: number | null;
    path: string;
    url: string | null;
    deviceId: string | null;
    isPublic: boolean;
    aclRead: string[];
    aclWrite: string[];
    groupSlug: string | null;
    meta: Record<string, unknown>;
    createdAt: string;
}

interface OsFileRow {
    id: string;
    owner: string;
    profile_id: string | null;
    name: string;
    mime: string | null;
    size: number | null;
    path: string;
    url: string | null;
    device_id: string | null;
    is_public: boolean | null;
    acl_read: string[] | null;
    acl_write: string[] | null;
    group_slug: string | null;
    meta: unknown;
    created_at: string;
}

function normalizeRow(row: OsFileRow): OsFile {
    return {
        id: row.id,
        owner: row.owner,
        profileId: row.profile_id,
        name: row.name,
        mime: row.mime,
        size: row.size,
        path: row.path,
        url: row.url,
        deviceId: row.device_id,
        isPublic: !!row.is_public,
        aclRead: Array.isArray(row.acl_read) ? row.acl_read : [],
        aclWrite: Array.isArray(row.acl_write) ? row.acl_write : [],
        groupSlug: row.group_slug,
        meta: row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {},
        createdAt: row.created_at,
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

/** Slug seguro para nombre de archivo en storage (conserva extensión). */
function safeFileName(name: string): string {
    const trimmed = (name || "archivo").trim();
    const dot = trimmed.lastIndexOf(".");
    const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
    const ext = dot > 0 ? trimmed.slice(dot) : "";
    const cleanBase = base
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "archivo";
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]+/g, "").slice(0, 12);
    return `${cleanBase}${cleanExt}`;
}

function uniqueSegment(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().slice(0, 8);
    } catch {
        /* noop */
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export interface UploadFileOptions {
    /** Subcarpeta lógica dentro de tu prefijo (p. ej. "avatares", "mensajes", "biblioteca/<entidad>"). */
    folder?: string;
    /** Perfil (faceta) de la cuenta que sube el archivo, si aplica. */
    profileId?: string | null;
    /** Marca el archivo como público desde el registro (además de la lectura pública del bucket). */
    isPublic?: boolean;
    /** Grupo con el que se comparte (habilita lectura vía membresía en RLS). */
    groupSlug?: string | null;
    /** ACL explícita adicional (uuids de usuario). */
    aclRead?: string[];
    aclWrite?: string[];
    /** Metadatos libres (p. ej. { context: "mensaje", threadId }). */
    meta?: Record<string, unknown>;
    /** Progreso 0-100 (best-effort; XHR nativo para poder reportar avance real). */
    onProgress?: (pct: number) => void;
}

export interface UploadFileResult {
    ok: boolean;
    file?: OsFile;
    error?: string;
}

/** Sube el `file` mediante XHR (para progreso real) al bucket `os-files` bajo `<uid>/<folder>/<nombre>`. */
async function uploadBlobWithProgress(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; status: number }> {
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);
            for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (evt) => {
                    if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
                };
            }
            xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
            xhr.onerror = () => resolve({ ok: false, status: 0 });
            xhr.send(file);
        } catch {
            resolve({ ok: false, status: 0 });
        }
    });
}

/**
 * Sube un archivo (CUALQUIER tipo) al almacenamiento real del OS y registra
 * su fila en `os_files`. Nunca lanza: siempre devuelve `{ok:false,error}` con
 * un mensaje claro ante cualquier fallo (sin sesión, límite superado, red).
 */
export async function uploadFile(file: File, options: UploadFileOptions = {}): Promise<UploadFileResult> {
    if (!isClient()) return { ok: false, error: "No disponible en el servidor." };
    if (!file) return { ok: false, error: "Archivo inválido." };
    if (file.size > MAX_UPLOAD_BYTES) {
        return {
            ok: false,
            error: `«${file.name}» pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB. El límite es 50MB por archivo.`,
        };
    }

    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, error: "Inicia sesión para subir archivos." };

    try {
        const supabase = createClient();
        const folder = (options.folder || "general").replace(/^\/+|\/+$/g, "");
        const cleanName = safeFileName(file.name || "archivo");
        const path = `${uid}/${folder}/${uniqueSegment()}-${cleanName}`;

        options.onProgress?.(0);

        // Subida directa vía SDK (progreso solo si el entorno soporta XHR de storage-js;
        // si no, degradamos a subida simple sin progreso intermedio pero SIEMPRE funcional).
        let uploadOk = false;
        let uploadErrorMsg = "";
        try {
            const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || undefined,
            });
            uploadOk = !error;
            if (error) uploadErrorMsg = error.message || "";
        } catch (e: any) {
            uploadErrorMsg = e?.message || "Error de red al subir.";
        }

        if (!uploadOk) {
            // Fallback: intenta con XHR directo a la Storage API REST si el SDK falló
            // por un problema transitorio de fetch (algunos WebViews/PWAs).
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData.session?.access_token;
                const base = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl;
                if (token && base) {
                    const restUrl = `${base}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
                    const res = await uploadBlobWithProgress(
                        restUrl,
                        file,
                        {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": file.type || "application/octet-stream",
                            "x-upsert": "false",
                        },
                        options.onProgress,
                    );
                    uploadOk = res.ok;
                }
            } catch {
                /* mantenemos el error original */
            }
        }

        if (!uploadOk) {
            return { ok: false, error: uploadErrorMsg || "No se pudo subir el archivo. Inténtalo de nuevo." };
        }

        options.onProgress?.(90);

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl ?? null;

        const insertRow = {
            owner: uid,
            profile_id: options.profileId ?? null,
            name: file.name || cleanName,
            mime: file.type || null,
            size: file.size,
            path,
            url: publicUrl,
            device_id: deviceId(),
            is_public: options.isPublic ?? true,
            acl_read: options.aclRead ?? [],
            acl_write: options.aclWrite ?? [],
            group_slug: options.groupSlug ?? null,
            meta: options.meta ?? {},
        };

        const { data, error } = await supabase.from("os_files").insert(insertRow).select("*").single();
        if (error || !data) {
            // El archivo YA está en storage con URL pública: devolvemos igualmente un
            // resultado usable (sin fila indexada) en vez de perder la subida.
            options.onProgress?.(100);
            return {
                ok: true,
                file: {
                    id: path,
                    owner: uid,
                    profileId: options.profileId ?? null,
                    name: file.name || cleanName,
                    mime: file.type || null,
                    size: file.size,
                    path,
                    url: publicUrl,
                    deviceId: deviceId(),
                    isPublic: options.isPublic ?? true,
                    aclRead: options.aclRead ?? [],
                    aclWrite: options.aclWrite ?? [],
                    groupSlug: options.groupSlug ?? null,
                    meta: options.meta ?? {},
                    createdAt: new Date().toISOString(),
                },
            };
        }

        options.onProgress?.(100);
        return { ok: true, file: normalizeRow(data as OsFileRow) };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error inesperado al subir el archivo." };
    }
}

export interface ListMyFilesOptions {
    /** Filtra por dispositivo/neurona que subió el archivo. */
    deviceId?: string;
    /** Búsqueda por nombre (case-insensitive, contains). */
    search?: string;
    /** Límite de filas (por defecto 200). */
    limit?: number;
}

/** Lista los archivos propios del usuario actual (más recientes primero). Nunca lanza. */
export async function listMyFiles(options: ListMyFilesOptions = {}): Promise<OsFile[]> {
    const uid = await getCurrentUserId();
    if (!uid) return [];
    try {
        const supabase = createClient();
        let q = supabase.from("os_files").select("*").eq("owner", uid).order("created_at", { ascending: false });
        if (options.deviceId) q = q.eq("device_id", options.deviceId);
        if (options.search?.trim()) q = q.ilike("name", `%${options.search.trim()}%`);
        q = q.limit(options.limit ?? 200);
        const { data, error } = await q;
        if (error || !Array.isArray(data)) return [];
        return (data as OsFileRow[]).map(normalizeRow);
    } catch {
        return [];
    }
}

export interface ListPublicFilesOptions {
    /** Búsqueda por nombre (case-insensitive, contains). */
    search?: string;
    /** Límite de filas (por defecto 150). */
    limit?: number;
}

/**
 * Lista los archivos PÚBLICOS de toda la red (`os_files.is_public = true`),
 * más recientes primero — la vista "Archivos de la Red" de /library. RLS
 * (osf_select) sigue aplicándose; sin permisos o error, devuelve []. Nunca lanza.
 */
export async function listPublicFiles(options: ListPublicFilesOptions = {}): Promise<OsFile[]> {
    if (!isClient()) return [];
    try {
        const supabase = createClient();
        let q = supabase
            .from("os_files")
            .select("*")
            .eq("is_public", true)
            .order("created_at", { ascending: false });
        if (options.search?.trim()) q = q.ilike("name", `%${options.search.trim()}%`);
        q = q.limit(options.limit ?? 150);
        const { data, error } = await q;
        if (error || !Array.isArray(data)) return [];
        return (data as OsFileRow[]).map(normalizeRow);
    } catch {
        return [];
    }
}

export interface NeuronFileGroup {
    deviceId: string;
    /** Nombre legible de la neurona (resuelto vía src/lib/neurons si es posible). */
    deviceName: string;
    isThisDevice: boolean;
    files: OsFile[];
}

/** Agrupa los archivos propios por dispositivo/neurona que los subió. Resuelve nombres si `neurons` está disponible. */
export async function listByNeuron(): Promise<NeuronFileGroup[]> {
    const files = await listMyFiles({ limit: 500 });
    if (files.length === 0) return [];

    let names = new Map<string, string>();
    let thisId = "";
    try {
        const neuronsMod = await import("@/lib/neurons/neurons");
        thisId = neuronsMod.thisDeviceId();
        const list = await neuronsMod.listNeurons();
        names = new Map(list.map((n) => [n.id, n.name] as const));
    } catch {
        /* módulo de neuronas no disponible: seguimos con ids crudos */
    }

    const groups = new Map<string, OsFile[]>();
    for (const f of files) {
        const key = f.deviceId || "desconocido";
        const list = groups.get(key) ?? [];
        list.push(f);
        groups.set(key, list);
    }

    return Array.from(groups.entries())
        .map(([id, list]): NeuronFileGroup => ({
            deviceId: id,
            deviceName: names.get(id) || (id === "desconocido" ? "Origen desconocido" : `Dispositivo ${id.slice(0, 8)}`),
            isThisDevice: !!thisId && id === thisId,
            files: list,
        }))
        .sort((a, b) => Number(b.isThisDevice) - Number(a.isThisDevice));
}

/** Borra un archivo propio: fila `os_files` + objeto en storage. Best-effort en ambos pasos. */
export async function deleteFile(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const supabase = createClient();
        const { data } = await supabase.from("os_files").select("path").eq("id", id).maybeSingle();
        const path = (data as { path?: string } | null)?.path;
        const { error } = await supabase.from("os_files").delete().eq("id", id);
        if (path) {
            try {
                await supabase.storage.from(BUCKET).remove([path]);
            } catch {
                /* fila ya borrada; el objeto huérfano no rompe nada visible */
            }
        }
        return !error;
    } catch {
        return false;
    }
}

/** Suscripción realtime a los archivos propios (INSERT/UPDATE/DELETE en `os_files`). Devuelve función de limpieza. */
export function subscribeMyFiles(cb: () => void): () => void {
    if (!isClient()) return () => {};
    try {
        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let cancelled = false;
        (async () => {
            const uid = await getCurrentUserId();
            if (!uid || cancelled) return;
            channel = supabase
                .channel(`osf:${uid}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "os_files", filter: `owner=eq.${uid}` },
                    () => cb(),
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) {
                try {
                    supabase.removeChannel(channel);
                } catch {
                    /* noop */
                }
            }
        };
    } catch {
        return () => {};
    }
}

export interface UpdateFileAccessInput {
    isPublic?: boolean;
    aclRead?: string[];
    aclWrite?: string[];
    groupSlug?: string | null;
}

/**
 * Actualiza los permisos de un archivo YA subido (is_public/acl_read/acl_write/
 * group_slug). Best-effort y aditivo — no toca `uploadFile`. RLS restringe la
 * escritura al dueño (osf_own), así que solo puede modificarse el propio.
 */
export async function updateFileAccess(id: string, patch: UpdateFileAccessInput): Promise<boolean> {
    if (!id) return false;
    try {
        const supabase = createClient();
        const update: Record<string, unknown> = {};
        if (patch.isPublic !== undefined) update.is_public = patch.isPublic;
        if (patch.aclRead !== undefined) update.acl_read = patch.aclRead;
        if (patch.aclWrite !== undefined) update.acl_write = patch.aclWrite;
        if (patch.groupSlug !== undefined) update.group_slug = patch.groupSlug;
        if (Object.keys(update).length === 0) return true;
        const { error } = await supabase.from("os_files").update(update).eq("id", id);
        return !error;
    } catch {
        return false;
    }
}

/** Busca la fila `os_files` cuya `url` coincide (para resolver el id real desde una referencia de biblioteca). */
export async function findFileByUrl(url: string): Promise<OsFile | null> {
    if (!url) return null;
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_files").select("*").eq("url", url).maybeSingle();
        if (error || !data) return null;
        return normalizeRow(data as OsFileRow);
    } catch {
        return null;
    }
}

/** Formato de adjunto compartido por mensajes/comentarios/Aurora (compatible con DmAttachment/CommentAttachment). */
export interface UniversalAttachment {
    kind: "image" | "audio" | "video" | "file" | "ref" | string;
    name?: string;
    mime?: string;
    url?: string;
    size?: number;
    fileId?: string;
    /**
     * Referencia a otra entidad de la red (jul-2026 · pestaña "Contenido de la
     * red" del picker, @/lib/files/network-content-ref.ts): página/grupo/evento/
     * publicación propios o públicos, adjuntables como referencia EN VIVO.
     * Compatible con `DmAttachment`/`CommentAttachment` (mismos nombres de campo).
     */
    refKind?: "page" | "group" | "event" | "post" | string;
    refId?: string;
    /** Ruta in-app de la referencia (para embeberla/enlazarla directamente). */
    route?: string;
}

function attachmentKindOf(mime: string | null | undefined): UniversalAttachment["kind"] {
    const m = (mime || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("audio/")) return "audio";
    if (m.startsWith("video/")) return "video";
    return "file";
}

/** Convierte un `OsFile` (ya subido) al formato de adjunto usado en mensajes/comentarios/publicaciones. */
export function fileToAttachment(file: OsFile): UniversalAttachment {
    return {
        kind: attachmentKindOf(file.mime),
        name: file.name,
        mime: file.mime ?? undefined,
        url: file.url ?? undefined,
        size: file.size ?? undefined,
        fileId: file.id,
    };
}

/** Tamaño legible ("2.3 MB"). Utilidad compartida para las superficies de subida. */
export function humanFileSize(bytes: number | null | undefined): string {
    if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let s = bytes;
    let i = 0;
    while (s >= 1024 && i < units.length - 1) {
        s /= 1024;
        i++;
    }
    return `${s.toFixed(s < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
