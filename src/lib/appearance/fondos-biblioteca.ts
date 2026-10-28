"use client";

/**
 * fondos-biblioteca — guardar sets `.starseed-fondo.json` en la Biblioteca
 * (Ola 1018F · FSH1018I). Usa ensureMediaFolders/saveMediaToLibrary/moveMediaItem
 * de media-library.ts y libraryRef de entity-library.ts. PURO donde se pueda;
 * dependencias inyectables en pruebas.
 */
import type { EntityRef } from "@/lib/library/entity-library";
import type { SetFondo } from "./sets-fondo";
import { exportarSet, validarSet, type OpcionesSet } from "./sets-fondo";
import type { ShaderCatalog } from "./catalogo-shaders";

export const CARPETA_FONDOS = "Fondos";
export const EXTENSION_SET = ".starseed-fondo.json";

export interface DepsBiblioteca {
  ensureMediaFolders: (ref: EntityRef) => Promise<{ rootId: string; subfolders: Record<string, string> }>;
  saveMediaToLibrary: (ref: EntityRef, input: any) => Promise<any>;
  moveMediaItem?: (ref: EntityRef, itemId: string, folderId: string | null) => Promise<void>;
  listLibrary?: (ref: EntityRef) => Promise<any>;
}

function defectoDeps(): DepsBiblioteca {
  // Se resuelve en runtime; las pruebas pasan deps inyectables
  const m = require("@/lib/library/media-library");
  return {
    ensureMediaFolders: m.ensureMediaFolders,
    saveMediaToLibrary: m.saveMediaToLibrary,
    moveMediaItem: m.moveMediaItem,
    listLibrary: m.listLibrary,
  };
}

function blobTexto(s: string, type: string): Blob {
  return new Blob([s], { type });
}

export interface GuardarSetOpts {
  deps?: DepsBiblioteca;
  /** Carpeta destino (id). Si se omite, se usa/crea «Fondos». */
  carpetaId?: string | null;
  /** Opciones para validar/exportar el set. */
  opcionesSet?: OpcionesSet;
  ahora?: () => Date;
  crearId?: () => string;
  autor?: string;
  vistaPrevia?: string;
  licencias?: string[];
  isPublic?: boolean;
  tags?: string[];
  note?: string;
}

export interface GuardarSetResult {
  ok: boolean;
  error?: string;
  itemId?: string;
  folderId?: string | null;
}

/**
 * Guarda el `.starseed-fondo.json` (y su vista previa) en la carpeta elegida o en «Fondos» (la crea si falta).
 * Usa saveMediaToLibrary para dejarlo en la biblioteca de la entidad (ref).
 */
export async function guardarSet(
  ref: EntityRef,
  set: SetFondo | any,
  carpetaId?: string | null,
  opts: GuardarSetOpts = {},
): Promise<GuardarSetResult> {
  try {
    const d = opts.deps ?? defectoDeps();
    const opcionesSet = opts.opcionesSet ?? ({ catalogo: {} } as OpcionesSet);
    const autor = opts.autor ?? "Alex";
    const licencias = opts.licencias ?? [];
    const creado = opts.ahora?.() ?? new Date();

    // Validar el set que nos pasan (acepta SetFondo ya formado o datos)
    let setValidado: SetFondo | null = null;
    if (set && set.formato === "starseed-fondo" && Array.isArray(set.capas)) {
      const r = validarSet(set, opcionesSet);
      if (!r.ok) return { ok: false, error: r.motivos.join("; ") };
      setValidado = r.set;
    } else if (set && Array.isArray(set.capas)) {
      const exp = exportarSet(
        {
          nombre: set.nombre ?? "Fondo",
          base: set.base ?? null,
          capas: set.capas,
          autor,
          licencias,
          vistaPrevia: opts.vistaPrevia ?? set.vistaPrevia,
          id: set.id,
        },
        { ...opcionesSet, ahora: () => creado, crearId: opts.crearId },
      );
      if (!exp.ok) return { ok: false, error: exp.motivos.join("; ") };
      setValidado = exp.set;
    } else {
      return { ok: false, error: "Set de fondos inválido" };
    }

    const exp2 = exportarSet(
      {
        nombre: setValidado.nombre,
        base: setValidado.base,
        capas: setValidado.capas,
        autor: setValidado.autor,
        licencias: setValidado.licencias,
        vistaPrevia: setValidado.vistaPrevia,
        id: setValidado.id,
      },
      { ...opcionesSet, ahora: () => new Date(setValidado.creado), crearId: () => setValidado!.id },
    );
    const json = exp2.ok ? exp2.json : JSON.stringify(setValidado, null, 2);

    let folderIdDest = carpetaId ?? null;
    if (folderIdDest === undefined || folderIdDest === null) {
      // Buscar/crear carpeta «Fondos»
      try {
        const folders = await d.ensureMediaFolders(ref);
        // ensureMediaFolders devuelve rootId + subfolders; para «Fondos» lo buscamos en la biblioteca
        if (d.listLibrary) {
          const lib = await d.listLibrary(ref);
          const f = lib?.folders?.find((x: any) => x.parentId === null && x.name === CARPETA_FONDOS);
          if (f) folderIdDest = f.id;
          else {
            // intentar crear vía createFolder si existe
            const cl = require("@/lib/library/entity-library");
            if (cl.createFolder) {
              folderIdDest = await cl.createFolder(ref, CARPETA_FONDOS, null);
            } else {
              folderIdDest = folders.rootId ?? null;
            }
          }
        } else {
          folderIdDest = folders.rootId ?? null;
        }
      } catch {
        folderIdDest = null;
      }
    }

    const file = blobTexto(json, "application/json");
    const res = await d.saveMediaToLibrary(ref, {
      file,
      name: exp2.ok ? exp2.archivo : `${setValidado.nombre || "fondo"}.starseed-fondo.json`,
      origin: "Importadas",
      destFolderId: folderIdDest,
      isPublic: opts.isPublic ?? false,
      tags: opts.tags ?? ["fondo", "starseed-fondo"],
      note: opts.note,
    });

    if (res?.ok === false) return { ok: false, error: res?.error || "No se pudo guardar el set" };
    return { ok: true, itemId: res?.itemId, folderId: res?.folderId ?? folderIdDest };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error al guardar set" };
  }
}

export interface ListarSetsResult {
  ok: boolean;
  sets: SetFondo[];
  error?: string;
}

function leerTexto(item: any): string | null {
  if (typeof item?.content === "string") return item.content;
  if (typeof item?.note === "string" && item.note.trim().startsWith("{")) return item.note;
  return null;
}

/**
 * Lista los sets `.starseed-fondo.json` guardados en la biblioteca de la entidad (ref).
 * Los lee y valida con sets-fondo.ts.
 */
export async function listarSets(
  ref: EntityRef,
  opts: { deps?: DepsBiblioteca; opcionesSet?: OpcionesSet; listLibrary?: (ref: EntityRef) => Promise<any> } = {},
): Promise<ListarSetsResult> {
  try {
    const d = opts.deps ?? defectoDeps();
    const listLib = opts.listLibrary ?? d.listLibrary;
    if (!listLib) return { ok: false, sets: [], error: "listLibrary no disponible" };
    const lib = await listLib(ref);
    const items = lib?.items ?? [];
    const opcionesSet = opts.opcionesSet ?? ({ catalogo: {} } as OpcionesSet);
    const sets: SetFondo[] = [];
    for (const it of items) {
      const txt = leerTexto(it);
      if (!txt) continue;
      try {
        const j = JSON.parse(txt);
        if (j?.formato !== "starseed-fondo") continue;
        const r = validarSet(j, opcionesSet);
        if (r.ok) sets.push(r.set);
      } catch {
        // ignorar
      }
    }
    return { ok: true, sets };
  } catch (e: any) {
    return { ok: false, sets: [], error: e?.message || "Error al listar sets" };
  }
}

export async function moverSet(
  ref: EntityRef,
  itemId: string,
  carpetaId: string | null,
  deps?: DepsBiblioteca,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = deps ?? defectoDeps();
    if (d.moveMediaItem) await d.moveMediaItem(ref, itemId, carpetaId);
    else {
      const m = require("@/lib/library/media-library");
      if (m.moveMediaItem) await m.moveMediaItem(ref, itemId, carpetaId);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error al mover set" };
  }
}
