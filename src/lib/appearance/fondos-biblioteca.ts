"use client";

/**
 * fondos-biblioteca — sets `.starseed-fondo.json` en cualquier Biblioteca (FSH1018I ·
 * architecture/fondos-shaders.md §2 · libreria-biblioteca-sync.md §3). Se compone sobre
 * media-library.ts (`ensureMediaFolders`, `saveMediaToLibrary`, `moveMediaItem`) y usa el `ref` de
 * `libraryRef`; guarda en la carpeta elegida o en «Fondos» (la crea si falta). Dependencias
 * inyectadas: las pruebas no tocan red, disco ni Supabase.
 */
import { EXTENSION_SET, importarSet, validarSet, type OpcionesSet, type SetFondo } from "./sets-fondo";
import type { EntityRef } from "@/lib/library/entity-library";
import type { MediaFolders, MediaOrigin, SaveMediaInput, SaveMediaResult } from "@/lib/library/media-library";

export const FONDOS_FOLDER_NAME = "Fondos", MIME_SET = "application/vnd.starseed.fondo+json";
const ORIGEN_SET: MediaOrigin = "Importadas";
export interface ItemBiblioteca {
  id: string; title: string; mime?: string | null; url?: string | null; content?: string | null;
  note?: string | null; folderId?: string | null; tags?: string[];
}
export interface DocBiblioteca {
  folders: Array<{ id: string; name: string; parentId: string | null }>; items: ItemBiblioteca[];
}
export interface DepsFondos {
  carpetasMedia(ref: EntityRef): Promise<MediaFolders>;
  crearCarpeta(ref: EntityRef, nombre: string, padre: string | null): Promise<string>;
  listar(ref: EntityRef): Promise<DocBiblioteca>;
  guardarArchivo(ref: EntityRef, entrada: SaveMediaInput): Promise<SaveMediaResult>;
  mover(ref: EntityRef, itemId: string, carpetaId: string | null): Promise<void>;
  leer(url: string): Promise<string>;
  opciones(): Promise<OpcionesSet>;
}
export interface SetGuardado { set: SetFondo; itemId: string; carpetaId: string | null }
export type ResultadoGuardarSet =
  | { ok: true; itemId: string; carpetaId: string; archivo: string }
  | { ok: false; error: string; motivos?: string[] };
/** `mi-fondo.starseed-fondo.json`, sin acentos ni signos. */
export function nombreArchivoSet(set: Pick<SetFondo, "id" | "nombre">): string {
  const base = set.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${base || set.id}${EXTENSION_SET}`;
}
/** MIME, extensión o etiqueta: cualquiera de las tres identifica un set. */
export function esItemSet(it: Pick<ItemBiblioteca, "mime" | "title" | "tags">): boolean {
  return it.mime === MIME_SET || (it.title ?? "").toLowerCase().endsWith(EXTENSION_SET)
    || (it.tags ?? []).includes("set-fondo");
}
/** Lee y valida el texto con sets-fondo.ts; null si no lo admite. */
export function parsearSet(texto: string, opciones: OpcionesSet): SetFondo | null {
  if (!texto) return null;
  const r = importarSet(texto, opciones);
  return r.ok ? r.set : null;
}

/** Carpeta «Fondos» bajo la raíz de Media; si falta, se crea (createFolder deduplica). */
async function carpetaFondos(ref: EntityRef, deps: DepsFondos): Promise<string> {
  const { rootId } = await deps.carpetasMedia(ref);
  const doc = await deps.listar(ref);
  const found = doc.folders.find(
    (f) => f.parentId === rootId && f.name.trim().toLowerCase() === FONDOS_FOLDER_NAME.toLowerCase(),
  );
  return found ? found.id : deps.crearCarpeta(ref, FONDOS_FOLDER_NAME, rootId);
}

/**
 * Valida y sanea el set con sets-fondo.ts, lo guarda como `.starseed-fondo.json` (con su vista
 * previa incrustada) en `carpetaId` o en «Fondos», y lo mueve si la Biblioteca lo dejó en otra
 * carpeta. Nunca lanza: los fallos se devuelven como `{ ok:false, error }`.
 */
export async function guardarSet(
  ref: EntityRef, set: SetFondo, carpetaId?: string | null, deps: DepsFondos = DEPS_REALES,
): Promise<ResultadoGuardarSet> {
  try {
    const limpio = validarSet(set, await deps.opciones());
    if (!limpio.ok) return { ok: false, error: "El set no es válido.", motivos: limpio.motivos };
    const destino = carpetaId ?? (await carpetaFondos(ref, deps)), archivo = nombreArchivoSet(limpio.set);
    const res = await deps.guardarArchivo(ref, {
      file: new Blob([JSON.stringify(limpio.set)], { type: MIME_SET }), name: archivo, origin: ORIGEN_SET,
      destFolderId: destino,
      tags: ["fondo", "set-fondo", ...(limpio.set.capas.some((c) => c.kind === "shader") ? ["shader"] : [])],
    });
    if (!res.ok || !res.itemId) return { ok: false, error: res.error ?? "No se pudo guardar el set en la Biblioteca." };
    if (res.folderId && res.folderId !== destino) await deps.mover(ref, res.itemId, destino);
    return { ok: true, itemId: res.itemId, carpetaId: destino, archivo };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado al guardar el set." };
  }
}

/** Los sets de la Biblioteca que pasan la validación de sets-fondo.ts (el resto se omite). */
export async function listarSets(ref: EntityRef, deps: DepsFondos = DEPS_REALES): Promise<SetGuardado[]> {
  const doc = await deps.listar(ref), opciones = await deps.opciones();
  const sets: SetGuardado[] = [];
  for (const it of doc.items) {
    if (!esItemSet(it)) continue;
    try {
      const texto = it.content || (it.url ? await deps.leer(it.url) : "");
      const set = parsearSet(texto, opciones);
      if (set) sets.push({ set, itemId: it.id, carpetaId: it.folderId ?? null });
    } catch { /* un set ilegible no tumba la lista */ }
  }
  return sets;
}

/** Colaboradores reales; los módulos pesados se cargan al usarlos, nunca al importar este archivo. */
const DEPS_REALES: DepsFondos = {
  async carpetasMedia(ref) { return (await import("@/lib/library/media-library")).ensureMediaFolders(ref); },
  async crearCarpeta(ref, nombre, padre) { return (await import("@/lib/library/entity-library")).createFolder(ref, nombre, padre); },
  async listar(ref) { return (await import("@/lib/library/entity-library")).listLibrary(ref); },
  async guardarArchivo(ref, entrada) { return (await import("@/lib/library/media-library")).saveMediaToLibrary(ref, entrada); },
  async mover(ref, itemId, carpetaId) { return (await import("@/lib/library/media-library")).moveMediaItem(ref, itemId, carpetaId); },
  async leer(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo leer el set (${r.status}).`);
    return r.text();
  },
  async opciones() {
    const c = await import("./catalogo-shaders"), base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return { catalogo: await c.cargarCatalogo(), ...(base ? { biblioteca: [`${base}/storage/v1/object/public/os-files`] } : {}) };
  },
};
