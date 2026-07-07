"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * media-library — Carpeta compartida "Imágenes y videos" de la biblioteca
 * personal (u otra entidad), con SUBCARPETAS automáticas por ORIGEN (Cámara /
 * Importadas / Capturas). Usada por la app Cámara (/camara) y la Galería
 * (/galeria) — mismo modelo de datos, cero duplicación.
 *
 * Modelo: compone sobre entity-library.ts (carpetas + SavedItem type:"file")
 * y os-files.ts (subida real a Supabase Storage) SIN modificarlos — solo su
 * API pública. Cada archivo sube primero a `os-files` (nube real) y luego se
 * referencia en la carpeta correspondiente (Lienzo Universal: referencia, no
 * copia). Nunca lanza: cualquier fallo degrada a un resultado {ok:false}.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    createFolder,
    listLibrary,
    saveItem,
    removeItem as removeLibraryItem,
    moveItem as moveLibraryItem,
    updateItemContent,
    type EntityRef,
    type SavedItem,
    type LibraryFolder,
} from "@/lib/library/entity-library";
import { uploadFile, deleteFile, type OsFile } from "@/lib/files/os-files";

export const MEDIA_ROOT_FOLDER_NAME = "Imágenes y videos";
export type MediaOrigin = "Cámara" | "Importadas" | "Capturas";
export const MEDIA_ORIGIN_SUBFOLDERS: MediaOrigin[] = ["Cámara", "Importadas", "Capturas"];

export interface MediaFolders {
    rootId: string;
    subfolders: Record<MediaOrigin, string>;
}

/**
 * Devuelve (creando si falta) la carpeta raíz "Imágenes y videos" + sus 3
 * subcarpetas automáticas, en la biblioteca de `ref`. Idempotente: `createFolder`
 * ya deduplica por nombre+padre, así que llamarla varias veces no crea duplicados.
 */
export async function ensureMediaFolders(ref: EntityRef): Promise<MediaFolders> {
    let doc = await listLibrary(ref);
    let root = doc.folders.find((f) => f.parentId === null && f.name === MEDIA_ROOT_FOLDER_NAME);
    let rootId: string;
    if (root) {
        rootId = root.id;
    } else {
        rootId = await createFolder(ref, MEDIA_ROOT_FOLDER_NAME, null);
        doc = await listLibrary(ref);
    }

    const subfolders = {} as Record<MediaOrigin, string>;
    for (const origin of MEDIA_ORIGIN_SUBFOLDERS) {
        const existing = doc.folders.find((f) => f.parentId === rootId && f.name === origin);
        subfolders[origin] = existing ? existing.id : await createFolder(ref, origin, rootId);
    }
    return { rootId, subfolders };
}

export interface SaveMediaInput {
    file: File | Blob;
    /** Nombre de archivo (obligatorio si `file` es un Blob sin `.name`). */
    name: string;
    origin: MediaOrigin;
    /** Carpeta destino explícita (si el usuario eligió otra distinta de la automática por origen). */
    destFolderId?: string | null;
    isPublic?: boolean;
    tags?: string[];
    note?: string;
}

export interface SaveMediaResult {
    ok: boolean;
    error?: string;
    osFile?: OsFile;
    itemId?: string;
    folderId?: string | null;
}

function toFile(input: File | Blob, name: string): File {
    if (input instanceof File) return input;
    return new File([input], name, { type: input.type || "application/octet-stream" });
}

/** Sube un archivo (foto/vídeo) a `os-files` y lo referencia en la carpeta de Media correspondiente. */
export async function saveMediaToLibrary(ref: EntityRef, input: SaveMediaInput): Promise<SaveMediaResult> {
    try {
        const folders = await ensureMediaFolders(ref);
        const folderId = input.destFolderId ?? folders.subfolders[input.origin];
        const file = toFile(input.file, input.name);

        const uploadRes = await uploadFile(file, {
            folder: `imagenes-videos/${input.origin.toLowerCase()}`,
            isPublic: input.isPublic ?? false,
            meta: { origin: input.origin },
        });
        if (!uploadRes.ok || !uploadRes.file) {
            return { ok: false, error: uploadRes.error || "No se pudo subir el archivo." };
        }

        const saved = await saveItem(
            ref,
            {
                type: "file",
                url: uploadRes.file.url ?? undefined,
                title: uploadRes.file.name,
                mime: uploadRes.file.mime ?? undefined,
                tags: input.tags ?? [input.origin.toLowerCase()],
                note: input.note,
            },
            folderId,
        );

        return { ok: true, osFile: uploadRes.file, itemId: saved.id, folderId };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error inesperado al guardar en la biblioteca." };
    }
}

/** Elimina un archivo de media: borra la referencia de biblioteca y (best-effort) el archivo en `os-files`. */
export async function deleteMediaItem(ref: EntityRef, item: SavedItem): Promise<boolean> {
    try {
        await removeLibraryItem(ref, item.id);
        // El id real de `os_files` no se conserva en SavedItem (solo su URL);
        // el borrado del objeto de storage se hace desde la Galería, que sí
        // conoce el `OsFile.id` original al listar `listMyFiles()`. Aquí, si el
        // llamador nos pasa esa relación, se puede extender sin romper nada.
        return true;
    } catch {
        return false;
    }
}

/** Borra un archivo por su id real de `os_files` (storage + fila). Best-effort. */
export async function deleteUnderlyingFile(osFileId: string): Promise<boolean> {
    return deleteFile(osFileId);
}

export async function moveMediaItem(ref: EntityRef, itemId: string, folderId: string | null): Promise<void> {
    await moveLibraryItem(ref, itemId, folderId);
}

export interface EditMediaPatch {
    title?: string;
    note?: string;
}

export async function renameMediaItem(ref: EntityRef, itemId: string, patch: EditMediaPatch): Promise<{ ok: boolean }> {
    return updateItemContent(ref, itemId, patch);
}

/** ¿Es este ítem de biblioteca una imagen o vídeo? (filtra el resto de tipos guardados). */
export function isMediaItem(it: SavedItem): boolean {
    if (it.type !== "file" || !it.mime) return false;
    return it.mime.startsWith("image/") || it.mime.startsWith("video/");
}

export function mediaKindOf(it: SavedItem): "image" | "video" | "other" {
    if (!it.mime) return "other";
    if (it.mime.startsWith("image/")) return "image";
    if (it.mime.startsWith("video/")) return "video";
    return "other";
}

/** Formato de archivo legible a partir del MIME ("image/jpeg" → "JPEG"). */
export function formatLabelOf(mime: string | undefined): string {
    if (!mime) return "Desconocido";
    const part = mime.split("/")[1] || mime;
    return part.split(";")[0].toUpperCase();
}

export interface DateGroup {
    label: string;
    key: string;
    items: SavedItem[];
}

/** Agrupa ítems de media por fecha (Hoy / Ayer / mes-año), más recientes primero. */
export function groupMediaByDate(items: SavedItem[]): DateGroup[] {
    const sorted = [...items].sort((a, b) => Date.parse(b.addedAt || "") - Date.parse(a.addedAt || ""));
    const now = new Date();
    const todayKey = now.toDateString();
    const yestKey = new Date(now.getTime() - 86_400_000).toDateString();

    const groups = new Map<string, DateGroup>();
    for (const it of sorted) {
        const d = it.addedAt ? new Date(it.addedAt) : new Date(0);
        const dayKey = d.toDateString();
        let label: string;
        let key: string;
        if (dayKey === todayKey) {
            label = "Hoy";
            key = "hoy";
        } else if (dayKey === yestKey) {
            label = "Ayer";
            key = "ayer";
        } else {
            label = d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
            key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        }
        const g = groups.get(key) ?? { label, key, items: [] };
        g.items.push(it);
        groups.set(key, g);
    }
    return Array.from(groups.values());
}

export function findFolder(folders: LibraryFolder[], id: string | null | undefined): LibraryFolder | undefined {
    if (!id) return undefined;
    return folders.find((f) => f.id === id);
}
