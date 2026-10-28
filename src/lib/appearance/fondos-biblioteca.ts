"use client";

import {
    ensureMediaFolders,
    saveMediaToLibrary,
    moveMediaItem,
    type MediaFolders,
    type SaveMediaInput,
    type SaveMediaResult,
} from "@/lib/library/media-library";
import {
    listLibrary,
    type EntityRef,
    type SavedItem,
    type LibraryFolder,
} from "@/lib/library/entity-library";
import { importarSet, validarSet, type SetFondo, type OpcionesSet } from "./sets-fondo";
import type { ShaderCatalog } from "./catalogo-shaders";

export const FONDOS_FOLDER_NAME = "Fondos";
export const SET_EXTENSION = ".starseed-fondo.json";
export const PREVIEW_EXTENSION = ".png";

export interface GuardarSetInput {
    set: SetFondo;
    carpetaId?: string | null;
}

export interface GuardarSetResultado {
    ok: boolean;
    error?: string;
    itemId?: string;
    previewItemId?: string;
    folderId?: string | null;
}

export interface ListarSetsResultado {
    ok: boolean;
    error?: string;
    sets: SetFondo[];
}

interface DependenciasGuardar {
    ensureFolders: (ref: EntityRef) => Promise<MediaFolders>;
    saveMedia: (ref: EntityRef, input: SaveMediaInput) => Promise<SaveMediaResult>;
    moveItem: (ref: EntityRef, itemId: string, folderId: string | null) => Promise<void>;
}

interface DependenciasListar {
    listLibrary: (ref: EntityRef) => Promise<{ items: SavedItem[]; folders: LibraryFolder[] }>;
}

const DEPS_GUARDAR_DEFAULT: DependenciasGuardar = {
    ensureFolders: ensureMediaFolders,
    saveMedia: saveMediaToLibrary,
    moveItem: moveMediaItem,
};

const DEPS_LISTAR_DEFAULT: DependenciasListar = {
    listLibrary: listLibrary,
};

function folderIdDeNombre(folders: LibraryFolder[], nombre: string, parentId: string | null): string | undefined {
    return folders.find((f) => f.name === nombre && f.parentId === parentId)?.id;
}

async function obtenerOCrearCarpetaFondos(
    ref: EntityRef,
    folders: LibraryFolder[],
    rootId: string,
    deps: Pick<DependenciasGuardar, "ensureFolders">,
): Promise<string> {
    const existing = folderIdDeNombre(folders, FONDOS_FOLDER_NAME, rootId);
    if (existing) return existing;
    const { rootId: newRootId, subfolders } = await deps.ensureFolders(ref);
    const fondossFolder = folderIdDeNombre(
        await listLibrary(ref).then((d) => d.folders),
        FONDOS_FOLDER_NAME,
        newRootId,
    );
    return fondossFolder ?? newRootId;
}

function setABlob(set: SetFondo): Blob {
    const json = JSON.stringify(set, null, 2);
    return new Blob([json], { type: "application/json" });
}

function previewABase64(set: SetFondo): string | undefined {
    return set.vistaPrevia;
}

function previewABlob(base64: string): Blob | null {
    try {
        const matches = base64.match(/^data:image\/png;base64,(.+)$/);
        if (!matches) return null;
        const binary = atob(matches[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: "image/png" });
    } catch {
        return null;
    }
}

export async function guardarSet(
    ref: EntityRef,
    input: GuardarSetInput,
    opciones: OpcionesSet,
    deps: Partial<DependenciasGuardar> = {},
): Promise<GuardarSetResultado> {
    const { ensureFolders, saveMedia, moveItem } = { ...DEPS_GUARDAR_DEFAULT, ...deps };
    const { set, carpetaId } = input;

    const validation = validarSet(set, opciones);
    if (!validation.ok) {
        return { ok: false, error: `Set inválido: ${validation.motivos.join(", ")}` };
    }

    try {
        const mediaFolders = await ensureFolders(ref);
        const libraryDoc = await listLibrary(ref);
        const rootId = mediaFolders.rootId;

        let targetFolderId = carpetaId;
        if (!targetFolderId) {
            targetFolderId = await obtenerOCrearCarpetaFondos(ref, libraryDoc.folders, rootId, { ensureFolders });
        }

        const setBlob = setABlob(set);
        const setName = `${set.id}${SET_EXTENSION}`;
        const saveSetRes = await saveMedia(ref, {
            file: setBlob,
            name: setName,
            origin: "Importadas",
            destFolderId: targetFolderId,
            tags: ["fondo", "set"],
        });

        if (!saveSetRes.ok || !saveSetRes.itemId) {
            return { ok: false, error: saveSetRes.error || "No se pudo guardar el archivo del set" };
        }

        let previewItemId: string | undefined;
        const previewBase64 = previewABase64(set);
        if (previewBase64) {
            const previewBlob = previewABlob(previewBase64);
            if (previewBlob) {
                const previewName = `${set.id}${PREVIEW_EXTENSION}`;
                const savePreviewRes = await saveMedia(ref, {
                    file: previewBlob,
                    name: previewName,
                    origin: "Importadas",
                    destFolderId: targetFolderId,
                    tags: ["fondo", "vista-previa"],
                });
                if (savePreviewRes.ok) {
                    previewItemId = savePreviewRes.itemId;
                }
            }
        }

        return { ok: true, itemId: saveSetRes.itemId, previewItemId, folderId: targetFolderId };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error inesperado al guardar el set" };
    }
}

export async function listarSets(
    ref: EntityRef,
    opciones: OpcionesSet,
    deps: Partial<DependenciasListar> = {},
): Promise<ListarSetsResultado> {
    const { listLibrary: listLib } = { ...DEPS_LISTAR_DEFAULT, ...deps };

    try {
        const doc = await listLib(ref);
        const sets: SetFondo[] = [];

        for (const item of doc.items) {
            if (
                item.type !== "file" ||
                !item.mime ||
                item.mime !== "application/json" ||
                !item.title.endsWith(SET_EXTENSION)
            ) {
                continue;
            }

            if (!item.url) continue;

            try {
                const resp = await fetch(item.url);
                if (!resp.ok) continue;
                const texto = await resp.text();
                const resultado = importarSet(texto, opciones);
                if (resultado.ok) {
                    sets.push(resultado.set);
                }
            } catch {
                continue;
            }
        }

        return { ok: true, sets };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Error al listar los sets", sets: [] };
    }
}

export { type SetFondo, type OpcionesSet, type ShaderCatalog } from "./sets-fondo";