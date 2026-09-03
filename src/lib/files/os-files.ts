"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * os-files — SUBIDA UNIVERSAL de archivos (cualquier tipo, cualquier contexto)
 * ---------------------------------------------------------------------------
 * Capa de datos para el almacenamiento REAL en la nube de StarSeed OS.
 * RECTIFICACION (2026-07-12): esta cabecera decia "Backend YA APLICADO en
 * Supabase (`dzkjapinnewkxzjltadv`), verificado". Era FALSO:
 * `dzkjapinnewkxzjltadv` es el proyecto de Nexus/Cafe. La base del OS es
 * **`nxstilnyidvkqeosofuh`** y ahi no existia NADA de esto (las subidas
 * fallaban en silencio). Creado el 2026-07-12 con la migracion
 * `supabase/migrations/20260712090000_missing_core_tables_library.sql`
 * (RLS verificada + realtime). Esquema REAL, ya aplicado en la base del OS:
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
 *   `acl_read`/`acl_write` admiten uuids de CUENTA o de PERFIL indistintamente:
 *   `acl_ids_allow` (migración 20260712100100) resuelve cuenta↔perfil en las DOS
 *   direcciones, así que un acceso a un perfil vale para toda su cuenta.
 *   Realtime ON (publicación `supabase_realtime`).
 *
 * DEFAULT DE COMPARTICIÓN (jul-2026): un archivo subido nace en ámbito CUENTA —
 * `is_public=false` + `acl_read=acl_write=[uid]` → lo ven TODOS los perfiles de
 * la cuenta y nadie más, sin configurar nada. Se cambia en el diálogo de
 * permisos (`updateFileAccess`). Antes nacía PÚBLICO para toda la red.
 *
 * SOP: architecture/libreria-biblioteca-sync.md §9. Filosofía del repo:
 * nunca lanza, SSR-safe, degrada a null/[]/false sin sesión o ante error de
 * red — un fallo de subida jamás debe romper la UI que la invoca.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
import { deviceId, type EntityRef } from "@/lib/sync/entity-state";
import { emitChange } from "@/lib/sync/live-signal";
// Historial de archivos (Adenda 66 §2): cada subida y cada versión nueva crean
// una revisión en `os_versions`, con puntero INMUTABLE al objeto de Storage.
import { logAccess, quickChecksum, recordVersion, versionStoragePath } from "@/lib/versions/versions";
// Tipo solo (sin runtime): la capa de backends se carga dinámicamente donde se usa.
import type { StorageBackend } from "@/lib/storage/backends";
// (Ola 225) Compresión de imágenes en cliente antes de subir.
import { comprimirImagen } from "@/lib/files/comprimir-imagen";

const BUCKET = "os-files";
/** Límite honesto de subida (bytes). ~50MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Topic de señal en vivo de los archivos de una cuenta (`files:<uid>`). */
export function filesTopic(uid: string): string {
    return `files:${uid}`;
}

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

// (Ola 225) Columnas explícitas para todo SELECT sobre `os_files`: son las que
// consume realmente `normalizeRow` (regla Adenda 186, egress de Supabase: no
// traer `*`). Ni una columna de más, ni una de menos.
const FILE_COLUMNS =
    "id, owner, profile_id, name, mime, size, path, url, device_id, is_public, acl_read, acl_write, group_slug, meta, created_at";

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
    /** Subfolder lógica dentro de tu prefijo (p. ej. "avatares", "mensajes", "biblioteca/<entidad>"). */
    folder?: string;
    /** Perfil (faceta) de la cuenta que sube el archivo, si aplica. */
    profileId?: string | null;
    /**
     * Marca el archivo como público desde el registro (además de la lectura
     * pública del bucket). **Por defecto `false`**: lo nuevo nace en ámbito
     * CUENTA (todos tus perfiles), no público — ver cabecera del módulo.
     */
    isPublic?: boolean;
    /** Grupo con el que se comparte (habilita lectura vía membresía en RLS). */
    groupSlug?: string | null;
    /**
     * ACL explícita (uuids de CUENTA o de PERFIL — `acl_ids_allow` resuelve ambos).
     * **Por defecto `[uid]`**: la cuenta que sube y, con ella, todos sus perfiles.
     */
    aclRead?: string[];
    aclWrite?: string[];
    /** Metadatos libres (p. ej. { context: "mensaje", threadId }). */
    meta?: Record<string, unknown>;
    /** Progreso 0-100 (best-effort; XHR nativo para poder reportar avance real). */
    onProgress?: (pct: number) => void;
}

/**
 * Resultado de replicar el binario a un backend externo REAL (Adenda 66 §13.1).
 * La subida primaria es SIEMPRE Supabase (bucket `os-files`); la réplica es
 * best-effort: si falla, se REPORTA (nunca en silencio) pero no rompe la subida.
 */
export interface FileReplicaResult {
    backendId: string;
    backendName: string;
    kind: string;
    ok: boolean;
    /** Ruta del objeto en el backend externo (misma que en Supabase). */
    path?: string;
    error?: string;
}

export interface UploadFileResult {
    ok: boolean;
    file?: OsFile;
    error?: string;
    /**
     * Réplicas REALES intentadas (solo backends con driver real marcados como
     * réplica del recurso «archivo» en `/almacenes`; hoy: Google Cloud Storage).
     * Vacío si el usuario no ha marcado ninguna.
     */
    replicas?: FileReplicaResult[];
    /**
     * Adenda 66 §2 · El objeto SÍ está en Storage pero su fila `os_files` no se
     * pudo insertar (RLS, red, tabla…). Antes esto se devolvía como `ok: true`
     * SIN aviso y con una fila FALSA: por eso había 6 objetos en el bucket y 0
     * filas en la tabla, y el archivo "solo existía en el dispositivo que lo
     * subió". Ahora se avisa y la fila queda ENCOLADA para reintento.
     */
    warning?: string;
}

// ── Cola de registros pendientes (`os_files`) ───────────────────────────────
// El binario ya está en Storage; lo que falta es su fila. La encolamos y la
// reintentamos igual que la biblioteca (al volver 'online' y cada ~30 s), para
// que ninguna subida quede huérfana e invisible para el resto de dispositivos.

const PENDING_FILES_KEY = "starseed.osfiles.pending.v1";
/** Evento window cuando cambia la cola de archivos pendientes de registrar: detail = { count }. */
export const FILES_PENDING_EVENT = "starseed:files-pending";

interface PendingFileRow {
    row: Record<string, unknown>;
    queuedAt: string;
    attempts: number;
    lastError?: string;
}

function readPendingFiles(): Record<string, PendingFileRow> {
    if (!isClient()) return {};
    try {
        const raw = localStorage.getItem(PENDING_FILES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, PendingFileRow>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writePendingFiles(map: Record<string, PendingFileRow>): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(PENDING_FILES_KEY, JSON.stringify(map));
    } catch {
        /* cuota / modo privado */
    }
    try {
        window.dispatchEvent(new CustomEvent(FILES_PENDING_EVENT, { detail: { count: Object.keys(map).length } }));
    } catch {
        /* noop */
    }
}

/** Nº de archivos subidos a Storage cuya fila `os_files` aún no se ha podido registrar. */
export function pendingFilesCount(): number {
    return Object.keys(readPendingFiles()).length;
}

/** Motivo del último fallo de registro (o null). */
export function lastPendingFileError(): string | null {
    const entries = Object.values(readPendingFiles());
    return entries.find((e) => e.lastError)?.lastError ?? null;
}

function enqueuePendingFile(path: string, row: Record<string, unknown>, error?: string): void {
    if (!isClient()) return;
    const map = readPendingFiles();
    const prev = map[path];
    map[path] = {
        row,
        queuedAt: prev?.queuedAt ?? new Date().toISOString(),
        attempts: (prev?.attempts ?? 0) + 1,
        lastError: error ?? prev?.lastError,
    };
    writePendingFiles(map);
    ensureFilesRetryLoop();
}

let _flushingFiles = false;

/**
 * Reintenta registrar en `os_files` los archivos que ya están en Storage.
 * Segura de llamar en cualquier momento. Nunca lanza.
 */
export async function flushPendingFiles(): Promise<{ flushed: number; remaining: number }> {
    if (!isClient() || _flushingFiles) return { flushed: 0, remaining: pendingFilesCount() };
    _flushingFiles = true;
    let flushed = 0;
    try {
        const supabase = createClient();
        const map = readPendingFiles();
        for (const [path, entry] of Object.entries(map)) {
            try {
                const { data, error } = await supabase.from("os_files").insert(entry.row).select(FILE_COLUMNS).single(); // (Ola 225) columnas explícitas (Adenda 186)
                if (!error && data) {
                    const current = readPendingFiles();
                    delete current[path];
                    writePendingFiles(current);
                    const file = normalizeRow(data as OsFileRow);
                    signalFilesChanged(file.owner);
                    void recordFileVersion(file, "Registro diferido de la subida");
                    flushed++;
                } else if (error) {
                    // 23505 (path ya registrado): la fila existe, la cola sobra.
                    if ((error as { code?: string }).code === "23505") {
                        const current = readPendingFiles();
                        delete current[path];
                        writePendingFiles(current);
                        flushed++;
                    } else {
                        enqueuePendingFile(path, entry.row, error.message);
                    }
                }
            } catch (e) {
                enqueuePendingFile(path, entry.row, (e as Error)?.message);
            }
        }
    } finally {
        _flushingFiles = false;
    }
    return { flushed, remaining: pendingFilesCount() };
}

let _filesRetryLoopStarted = false;

function ensureFilesRetryLoop(): void {
    if (!isClient() || _filesRetryLoopStarted) return;
    _filesRetryLoopStarted = true;
    try {
        window.addEventListener("online", () => {
            void flushPendingFiles();
        });
        window.setInterval(() => {
            if (pendingFilesCount() === 0) return;
            if (typeof navigator !== "undefined" && navigator.onLine === false) return;
            void flushPendingFiles();
        }, 30_000);
    } catch {
        /* noop */
    }
}

/** Anuncia en vivo que los archivos de esta cuenta cambiaron (otros dispositivos refrescan). */
function signalFilesChanged(uid: string, fileId?: string): void {
    try {
        void emitChange(filesTopic(uid), { id: fileId, updatedAt: new Date().toISOString() });
    } catch {
        /* la señal nunca rompe la subida */
    }
}

/** Registra una revisión del archivo (no bloqueante; el `owner` del historial es la cuenta). */
async function recordFileVersion(file: OsFile, message: string, rev?: number): Promise<void> {
    try {
        const ref: EntityRef = { kind: "user", id: file.owner };
        await recordVersion({
            kind: "file",
            resourceId: file.id,
            ref,
            message,
            rev,
            size: file.size,
            checksum: quickChecksum(`${file.path}|${file.size ?? 0}`),
            storagePath: file.path,
            snapshot: { name: file.name, mime: file.mime, size: file.size, path: file.path, url: file.url },
        });
        void logAccess({ kind: "file", resourceId: file.id, ref, action: "upload", detail: { name: file.name } });
    } catch {
        /* el historial NUNCA impide subir */
    }
}

/* ───────────── Réplicas REALES en backends externos (Adenda 66 §13.1) ─────────────
 * ADITIVO: no cambia nada de la subida primaria. Si el usuario marcó en
 * `/almacenes` un backend con DRIVER REAL (hoy: Google Cloud Storage) como
 * RÉPLICA del recurso «archivo», el binario se copia también allí, con la MISMA
 * ruta `<uid>/…` (el servidor de firma vuelve a forzar ese prefijo, así que un
 * usuario nunca puede escribir en el espacio de otro).
 * Best-effort HONESTO: un fallo de réplica NO rompe la subida, pero se devuelve
 * en `result.replicas` y en `result.warning` — jamás se traga en silencio.
 * ────────────────────────────────────────────────────────────────────────────── */

async function replicateFileBestEffort(file: File, path: string): Promise<FileReplicaResult[]> {
    try {
        const { realReplicasFor, putObjectToBackend } = await import("@/lib/storage/backends");
        const replicas = await realReplicasFor("file");
        if (!replicas.length) return [];
        const out: FileReplicaResult[] = [];
        for (const b of replicas) {
            try {
                const res = await putObjectToBackend(b, file, path, { contentType: file.type || undefined });
                out.push({
                    backendId: b.id,
                    backendName: b.name,
                    kind: String(b.kind),
                    ok: res.ok,
                    path: res.path,
                    error: res.error,
                });
            } catch (e) {
                out.push({
                    backendId: b.id,
                    backendName: b.name,
                    kind: String(b.kind),
                    ok: false,
                    error: (e as Error)?.message || "Error inesperado al replicar.",
                });
            }
        }
        return out;
    } catch {
        // Si la capa de backends no está disponible, no hay réplicas: la subida
        // primaria (Supabase) sigue siendo la fuente de verdad.
        return [];
    }
}

/** Metadatos de las réplicas que SÍ se escribieron (se guardan en `os_files.meta`). */
function replicaMeta(replicas: FileReplicaResult[]): Record<string, unknown> {
    const ok = replicas.filter((r) => r.ok && r.path);
    if (!ok.length) return {};
    return {
        replicas: ok.map((r) => ({
            backendId: r.backendId,
            kind: r.kind,
            name: r.backendName,
            path: r.path,
            at: new Date().toISOString(),
        })),
    };
}

/** Aviso legible si alguna réplica falló (o null si todo fue bien / no había). */
function replicaWarning(replicas: FileReplicaResult[]): string | null {
    const failed = replicas.filter((r) => !r.ok);
    if (!failed.length) return null;
    return (
        "El archivo se subió al servidor StarSeed, pero no se pudo replicar en " +
        failed.map((r) => `«${r.backendName}»${r.error ? ` (${r.error})` : ""}`).join(", ") +
        "."
    );
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
    // (Ola 225) Imágenes comprimibles (no svg/gif): redimensionar/comprimir en
    // cliente antes de subir — ahorra egress y puede hacer pasar el límite.
    if (file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/gif") {
        file = await comprimirImagen(file);
    }
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
                cacheControl: "31536000", // (Ola 225) ruta inmutable: caché de un año (regla Adenda 186, egress)
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

        // Réplica REAL best-effort en los backends externos marcados por el usuario
        // (hoy: Google Cloud Storage). Nunca rompe la subida; sus fallos se avisan.
        const replicas = await replicateFileBestEffort(file, path);
        const replicasWarning = replicaWarning(replicas);

        const insertRow = {
            owner: uid,
            profile_id: options.profileId ?? null,
            name: file.name || cleanName,
            mime: file.type || null,
            size: file.size,
            path,
            url: publicUrl,
            device_id: deviceId(),
            // ── DEFAULT AUTOMÁTICO (jul-2026): «toda mi cuenta (todos mis perfiles)» ──
            // ANTES: `is_public ?? true` — todo archivo subido nacía PÚBLICO para
            // toda la red y con la ACL vacía. Ahora nace en ámbito CUENTA:
            //   · is_public=false  → no se lista en la red (listPublicFiles).
            //   · acl_read/acl_write = [uid] → la cuenta y, por la regla
            //     cuenta↔perfil de `acl_ids_allow` (migración 20260712100100),
            //     TODOS sus perfiles. Verificado contra la RLS real.
            // Sigue siendo cambiable: el diálogo de permisos llama a
            // `updateFileAccess`, y quien quiera público lo pide explícitamente
            // (`isPublic: true`, como hace /library en modo GLOBAL).
            // Los bytes NO dependen de esto: el bucket es de lectura pública y la
            // URL sigue funcionando (por eso las imágenes de las publicaciones no
            // se rompen); `is_public` gobierna la FILA de metadatos, no el objeto.
            is_public: options.isPublic ?? false,
            acl_read: options.aclRead ?? [uid],
            acl_write: options.aclWrite ?? [uid],
            group_slug: options.groupSlug ?? null,
            meta: { ...(options.meta ?? {}), ...replicaMeta(replicas) },
        };

        const { data, error } = await supabase.from("os_files").insert(insertRow).select(FILE_COLUMNS).single(); // (Ola 225) columnas explícitas (Adenda 186)
        if (error || !data) {
            // ── Adenda 66 §2 · CAUSA RAÍZ del "solo se guarda en local" ──────────
            // El objeto YA está en Storage, pero su fila no. ANTES esto devolvía
            // `ok: true` con una fila FALSA (id = ruta de storage) y sin decir nada:
            // el archivo no existía para `listMyFiles`, ni para el realtime, ni para
            // los permisos, ni para ningún otro dispositivo — y nadie se enteraba.
            // Ahora: se ENCOLA para reintento y se DEVUELVE EL AVISO.
            options.onProgress?.(100);
            enqueuePendingFile(path, insertRow, error?.message);
            return {
                ok: true,
                replicas,
                warning:
                    "El archivo se subió, pero aún no se ha podido registrar en tu cuenta" +
                    (error?.message ? ` (${error.message})` : "") +
                    ". Se reintentará automáticamente; hasta entonces no aparecerá en tus otros dispositivos." +
                    (replicasWarning ? ` ${replicasWarning}` : ""),
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
        const uploaded = normalizeRow(data as OsFileRow);
        // El archivo ya es real y compartible: anunciarlo en vivo y versionarlo.
        signalFilesChanged(uid, uploaded.id);
        void recordFileVersion(uploaded, `Subir «${uploaded.name}»`, 1);
        return {
            ok: true,
            file: uploaded,
            replicas,
            ...(replicasWarning ? { warning: replicasWarning } : {}),
        };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error inesperado al subir el archivo." };
    }
}

/**
 * NUEVA VERSIÓN de un archivo YA registrado (Adenda 66 §2). Los binarios NUNCA
 * se sobrescriben: cada revisión vive en su propio objeto de Storage
 * `<uid>/<fileId>/<rev>/<nombre>`. La fila `os_files` apunta siempre a la última
 * (`path`/`url`/`size`), y `os_versions` conserva el puntero de cada una — así
 * "Restaurar" puede volver a cualquier revisión sin haber perdido nada.
 */
export async function uploadFileVersion(
    fileId: string,
    file: File,
    options: { message?: string; onProgress?: (pct: number) => void } = {},
): Promise<UploadFileResult> {
    if (!isClient()) return { ok: false, error: "No disponible en el servidor." };
    if (!file) return { ok: false, error: "Archivo inválido." };
    if (file.size > MAX_UPLOAD_BYTES) {
        return { ok: false, error: `«${file.name}» supera el límite de 50MB por archivo.` };
    }

    const uid = await getCurrentUserId();
    if (!uid) return { ok: false, error: "Inicia sesión para subir una versión nueva." };

    try {
        const supabase = createClient();
        const { data: existingRow, error: readErr } = await supabase
            .from("os_files")
            .select(FILE_COLUMNS) // (Ola 225) columnas explícitas (Adenda 186)
            .eq("id", fileId)
            .maybeSingle();
        if (readErr || !existingRow) {
            return { ok: false, error: readErr?.message || "No se encontró el archivo original." };
        }
        const existing = normalizeRow(existingRow as OsFileRow);

        // Siguiente revisión = head actual + 1 (el historial es la fuente de verdad).
        const { headRev } = await import("@/lib/versions/versions");
        const rev = (await headRev("file", fileId, { kind: "user", id: existing.owner })) + 1;

        const cleanName = safeFileName(file.name || existing.name);
        const path = versionStoragePath(uid, fileId, rev, cleanName);

        options.onProgress?.(0);
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: "31536000", // (Ola 225) ruta inmutable: caché de un año (regla Adenda 186, egress)
            upsert: false, // jamás sobrescribir: cada revisión es un objeto nuevo
            contentType: file.type || undefined,
        });
        if (upErr) return { ok: false, error: upErr.message || "No se pudo subir la versión." };

        options.onProgress?.(90);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl ?? null;

        const { data: updated, error: updErr } = await supabase
            .from("os_files")
            .update({
                path,
                url: publicUrl,
                size: file.size,
                mime: file.type || existing.mime,
                device_id: deviceId(),
            })
            .eq("id", fileId)
            .select(FILE_COLUMNS) // (Ola 225) columnas explícitas (Adenda 186)
            .single();

        if (updErr || !updated) {
            return {
                ok: false,
                error: updErr?.message || "La versión se subió pero no se pudo apuntar como la actual.",
            };
        }

        options.onProgress?.(100);
        const next = normalizeRow(updated as OsFileRow);
        signalFilesChanged(uid, fileId);
        void recordFileVersion(next, options.message ?? `Nueva versión de «${next.name}»`, rev);
        return { ok: true, file: next };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "Error inesperado al subir la versión." };
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
        let q = supabase.from("os_files").select(FILE_COLUMNS).eq("owner", uid).order("created_at", { ascending: false }); // (Ola 225) columnas explícitas (Adenda 186)
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
            .select(FILE_COLUMNS) // (Ola 225) columnas explícitas (Adenda 186)
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

/**
 * Borra un archivo propio: fila `os_files` + objeto en storage + sus RÉPLICAS
 * reales (Adenda 66 §13.1) en backends externos (GCS). Best-effort en cada paso.
 */
export async function deleteFile(id: string): Promise<boolean> {
    if (!id) return false;
    try {
        const supabase = createClient();
        const { data } = await supabase.from("os_files").select("path, owner, name, meta").eq("id", id).maybeSingle();
        const row = data as { path?: string; owner?: string; name?: string; meta?: unknown } | null;
        const path = row?.path;
        const { error } = await supabase.from("os_files").delete().eq("id", id);
        if (path) {
            try {
                await supabase.storage.from(BUCKET).remove([path]);
            } catch {
                /* fila ya borrada; el objeto huérfano no rompe nada visible */
            }
            // Réplicas externas: se borran también (si no, quedan copias vivas de
            // algo que el usuario cree haber borrado). Nunca rompe el borrado.
            void deleteFileReplicas(row?.meta);
        }
        if (!error && row?.owner) {
            // El borrado también viaja: los demás dispositivos lo ven al instante.
            signalFilesChanged(row.owner, id);
            void logAccess({
                kind: "file",
                resourceId: id,
                ref: { kind: "user", id: row.owner },
                action: "delete",
                detail: { name: row.name ?? "" },
            });
        }
        return !error;
    } catch {
        return false;
    }
}

/**
 * Borra las réplicas externas registradas en `os_files.meta.replicas` (hoy: GCS).
 * Best-effort: informa por consola si falla, pero nunca lanza ni bloquea.
 */
async function deleteFileReplicas(meta: unknown): Promise<void> {
    try {
        const list = (meta as { replicas?: { backendId?: string; kind?: string; name?: string; path?: string }[] })
            ?.replicas;
        if (!Array.isArray(list) || list.length === 0) return;
        const { deleteObjectFromBackend, listBackends, isRealBackend } = await import("@/lib/storage/backends");
        const backends = await listBackends();
        for (const r of list) {
            if (!r?.path || !r.kind || !isRealBackend(r.kind)) continue;
            const b =
                backends.find((x) => x.id === r.backendId) ??
                ({ id: r.backendId ?? "", kind: r.kind, name: r.name ?? r.kind } as unknown as StorageBackend);
            const res = await deleteObjectFromBackend(b, r.path);
            if (!res.ok && res.error) {
                // Visible en consola: el objeto externo puede haber quedado vivo.
                console.warn(`[os-files] No se pudo borrar la réplica en ${r.name ?? r.kind}: ${res.error}`);
            }
        }
    } catch (e) {
        console.warn("[os-files] Error al borrar réplicas externas:", (e as Error)?.message);
    }
}

/**
 * URL de lectura de la RÉPLICA externa de un archivo (firmada y temporal en GCS).
 * Útil si el objeto primario de Supabase no está disponible. Devuelve null si el
 * archivo no tiene réplicas reales.
 */
export async function getReplicaUrl(file: OsFile): Promise<{ url: string; backend: string } | null> {
    try {
        const list = (file.meta as { replicas?: { backendId?: string; kind?: string; name?: string; path?: string }[] })
            ?.replicas;
        if (!Array.isArray(list) || list.length === 0) return null;
        const { getObjectUrlFromBackend, listBackends, isRealBackend } = await import("@/lib/storage/backends");
        const backends = await listBackends();
        for (const r of list) {
            if (!r?.path || !r.kind || !isRealBackend(r.kind)) continue;
            const b =
                backends.find((x) => x.id === r.backendId) ??
                ({ id: r.backendId ?? "", kind: r.kind, name: r.name ?? r.kind } as unknown as StorageBackend);
            const res = await getObjectUrlFromBackend(b, r.path);
            if (res.ok && res.url) return { url: res.url, backend: r.name ?? String(r.kind) };
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Suscripción a los archivos propios. DOS CAMINOS REDUNDANTES (mismo patrón que
 * la biblioteca, Adenda 63 §4):
 *   (a) BROADCAST (`files:<uid>` vía live-signal) — no depende de la publicación
 *       `supabase_realtime`: es el que SIEMPRE funciona.
 *   (b) postgres_changes — sobrevive a reconexiones y a clientes que estaban
 *       cerrados cuando se emitió el broadcast.
 * Además arranca el reintento de los registros pendientes (`os_files`).
 */
export function subscribeMyFiles(cb: () => void): () => void {
    if (!isClient()) return () => {};
    try {
        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let unsubLive: (() => void) | null = null;
        let cancelled = false;

        ensureFilesRetryLoop();
        if (pendingFilesCount() > 0) void flushPendingFiles();

        (async () => {
            const uid = await getCurrentUserId();
            if (!uid || cancelled) return;
            // (a) broadcast
            const { onChange } = await import("@/lib/sync/live-signal");
            if (cancelled) return;
            unsubLive = onChange(filesTopic(uid), () => cb());
            // (b) postgres_changes
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
            try {
                unsubLive?.();
            } catch {
                /* noop */
            }
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
        const { data, error } = await supabase.from("os_files").update(update).eq("id", id).select("owner").maybeSingle();
        const owner = (data as { owner?: string } | null)?.owner;
        if (!error && owner) {
            signalFilesChanged(owner, id);
            void logAccess({
                kind: "file",
                resourceId: id,
                ref: { kind: "user", id: owner },
                action: "permisos",
                detail: { ...patch },
            });
        }
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
        const { data, error } = await supabase.from("os_files").select(FILE_COLUMNS).eq("url", url).maybeSingle(); // (Ola 225) columnas explícitas (Adenda 186)
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
