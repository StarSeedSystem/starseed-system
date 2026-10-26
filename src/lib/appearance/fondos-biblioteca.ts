/**
 * fondos-biblioteca — Guarda y lista sets de fondos (.starseed-fondo.json) en la Biblioteca
 * de una entidad (usuario, perfil, página, grupo, comunidad, publicación, mensaje).
 * Ola 1018F · FSH1018I · architecture/fondos-shaders.md §2, §3, §4.
 */
import { libraryRef, type EntityRef, type SavedItem, createFolder, listLibrary, saveItem } from "@/lib/library/entity-library";
import { validarSet, exportarSet, type SetFondo, type OpcionesSet, FORMATO_SET, EXTENSION_SET } from "./sets-fondo";
import { construirCatalogo, type ShaderCatalog } from "./catalogo-shaders";

export const FONDOS_FOLDER_NAME = "Fondos";

export interface GuardarSetInput {
  ref: EntityRef;
  set: SetFondo;
  carpetaId?: string | null;
  catalogo?: ShaderCatalog;
  listLibrary?: typeof listLibrary;
  createFolder?: typeof createFolder;
  saveItem?: typeof saveItem;
}

export interface GuardarSetResult {
  ok: boolean;
  itemId?: string;
  folderId?: string | null;
  error?: string;
}

export interface ListarSetsInput {
  ref: EntityRef;
  catalogo?: ShaderCatalog;
  listLibrary?: typeof listLibrary;
}

export interface SetConMetadatos extends SetFondo {
  itemId: string;
  folderId: string | null;
  folderName: string;
}

export interface ListarSetsResult {
  ok: boolean;
  sets: SetConMetadatos[];
  error?: string;
}

function getCatalogo(injected?: ShaderCatalog): ShaderCatalog {
  return injected ?? construirCatalogo([]);
}

function opcionesSet(catalogo: ShaderCatalog, bibliotecaUrls: string[] = []): OpcionesSet {
  return { catalogo, biblioteca: bibliotecaUrls };
}

async function ensureFondosFolder(
  ref: EntityRef,
  listLibraryFn: typeof listLibrary = listLibrary,
  createFolderFn: typeof createFolder = createFolder
): Promise<string> {
  const doc = await listLibraryFn(ref);
  const existing = doc.folders.find((f) => f.parentId === null && f.name === FONDOS_FOLDER_NAME);
  if (existing) return existing.id;
  return createFolderFn(ref, FONDOS_FOLDER_NAME, null);
}

async function saveSetAsFile(
  ref: EntityRef,
  set: SetFondo,
  folderId: string | null,
  catalogo: ShaderCatalog,
  saveItemFn: typeof saveItem = saveItem
): Promise<GuardarSetResult> {
  try {
    const exportRes = exportarSet(
      {
        nombre: set.nombre,
        base: set.base,
        capas: set.capas,
        autor: set.autor,
        licencias: set.licencias,
        vistaPrevia: set.vistaPrevia,
        id: set.id,
      },
      { ...opcionesSet(catalogo), ahora: () => new Date(set.creado), crearId: () => set.id }
    );

    if (!exportRes.ok) {
      return { ok: false, error: exportRes.motivos.join("; ") };
    }

    const item = await saveItemFn(
      ref,
      {
        type: "design",
        title: exportRes.archivo,
        note: JSON.stringify(exportRes.set),
        tags: ["fondo", "shaders", "set"],
        mime: "application/json",
        content: exportRes.json,
      },
      folderId
    );

    return { ok: true, itemId: item.id, folderId };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error inesperado al guardar el set de fondo." };
  }
}

export async function guardarSet(input: GuardarSetInput): Promise<GuardarSetResult> {
  const catalogo = getCatalogo(input.catalogo);
  const validacion = validarSet(input.set, opcionesSet(catalogo));
  if (!validacion.ok) {
    return { ok: false, error: validacion.motivos.join("; ") };
  }

  const listLibraryFn = input.listLibrary ?? listLibrary;
  const createFolderFn = input.createFolder ?? createFolder;
  const saveItemFn = input.saveItem ?? saveItem;

  const folderId = input.carpetaId ?? (await ensureFondosFolder(input.ref, listLibraryFn, createFolderFn));
  return saveSetAsFile(input.ref, validacion.set, folderId, catalogo, saveItemFn);
}

export async function listarSets(input: ListarSetsInput): Promise<ListarSetsResult> {
  try {
    const catalogo = getCatalogo(input.catalogo);
    const listLibraryFn = input.listLibrary ?? listLibrary;
    const doc = await listLibraryFn(input.ref);
    const opts = opcionesSet(catalogo);

    const setItems = doc.items.filter(
      (it) => it.type === "design" && it.note && it.note.trim().startsWith(`{"formato":"${FORMATO_SET}"`)
    );

    const sets: SetConMetadatos[] = [];
    for (const item of setItems) {
      try {
        const note = item.note ?? "";
        const parsed = JSON.parse(note);
        const res = validarSet(parsed, opts);
        if (res.ok) {
          const fId = item.folderId;
          const folder = fId ? doc.folders.find((f) => f.id === fId) : undefined;
          sets.push({
            ...res.set,
            itemId: item.id,
            folderId: item.folderId ?? null,
            folderName: folder?.name ?? "Raíz",
          });
        }
      } catch {
        // Ignorar items con JSON inválido
      }
    }

    return { ok: true, sets };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error inesperado al listar los sets de fondo.", sets: [] };
  }
}