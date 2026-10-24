"use client";
/**
 * fondos-biblioteca — sets `.starseed-fondo.json` en cualquier carpeta de la Biblioteca (Ola 1018F · FSH1018I ·
 * architecture/fondos-shaders.md §2-§3). Guarda el JSON validado y su vista previa PNG; al leer vuelve a validar.
 * Dependencias inyectables: pruebas sin disco, red, Supabase ni DOM.
 */
import { validarSet, importarSet, EXTENSION_SET, type SetFondo, type OpcionesSet } from "./sets-fondo";
import type { ShaderCatalog } from "./catalogo-shaders";
import type { EntityRef } from "@/lib/library/entity-library";
export const CARPETA_FONDOS = "Fondos", MIME_SET = "application/vnd.starseed.fondo+json";
const PNG = "data:image/png;base64,";
export interface CarpetaRef { id: string; name: string; parentId: string | null }
export interface ItemRef { id: string; title: string; mime?: string; url?: string; content?: string; folderId?: string | null }
export interface DocBiblioteca { folders: CarpetaRef[]; items: ItemRef[] }
export interface EntradaArchivo { blob: Blob; name: string; mime: string }
export interface ResultadoArchivo { ok: boolean; error?: string; itemId?: string; folderId?: string | null }
export interface DepsFondos {
  leerBiblioteca(ref: EntityRef): Promise<DocBiblioteca>;
  crearCarpeta(ref: EntityRef, nombre: string, padreId: string | null): Promise<string>;
  guardarArchivo(ref: EntityRef, entrada: EntradaArchivo): Promise<ResultadoArchivo>;
  mover(ref: EntityRef, itemId: string, carpetaId: string | null): Promise<void>;
  leerTexto(item: ItemRef): Promise<string>;
  catalogo?: ShaderCatalog; biblioteca?: readonly string[]; compartido?: boolean;
}
export interface SetGuardado { set: SetFondo; itemId: string; carpetaId: string | null }
export interface SetInvalido { itemId: string; motivos: string[] }
export interface ResultadoListarSets { sets: SetGuardado[]; invalidos: SetInvalido[] }
export interface ResultadoGuardarSet { ok: boolean; error?: string; motivos?: string[]; carpetaId?: string; itemId?: string; vistaItemId?: string; archivo?: string; aviso?: string }
/** Nombre de archivo estable y sin acentos, igual que el que produce `exportarSet`. */
export function slugFondo(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
export function nombreArchivoSet(set: Pick<SetFondo, "nombre">): string { return `${slugFondo(set.nombre) || "fondo"}${EXTENSION_SET}`; }
/** ¿Es un set? Vale el nombre del archivo, el MIME o el contenido. */
export function esItemDeSet(item: Pick<ItemRef, "title" | "mime" | "content">): boolean {
  if ((item.title ?? "").toLowerCase().endsWith(EXTENSION_SET) || item.mime === MIME_SET) return true;
  return typeof item.content === "string" && /"formato"\s*:\s*"starseed-fondo"/.test(item.content);
}
/** Carpeta «Fondos» de la RAÍZ (las homónimas anidadas no cuentan). */
export function idCarpetaFondos(folders: readonly CarpetaRef[]): string | undefined {
  return folders.find((f) => f.parentId === null && f.name.trim().toLowerCase() === CARPETA_FONDOS.toLowerCase())?.id;
}
/** Prefijos de la propia Biblioteca (`…/storage/v1/object/public/os-files/`) vistos en sus ítems. */
export function prefijosBibliotecaDe(urls: readonly (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const u of urls) { const m = typeof u === "string" ? /^(https?:\/\/[^/]+\/storage\/v1\/object\/public\/[^/?#]+\/)/i.exec(u) : null; if (m) out.add(m[1]); }
  return [...out];
}
/** Vista previa PNG a bytes (sin red ni DOM); si no es PNG válido, no hay vista. */
export function bytesVistaPrevia(vp: string | undefined): ArrayBuffer | undefined {
  if (!vp || !vp.startsWith(`${PNG}iVBORw0KGgo`)) return undefined;
  const b64 = vp.slice(PNG.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return undefined;
  try {
    const bin = atob(b64), ab = new ArrayBuffer(bin.length), out = new Uint8Array(ab);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return ab;
  } catch { return undefined; }
}
async function opciones(d: DepsFondos): Promise<OpcionesSet> { const catalogo = d.catalogo ?? await (await import("./catalogo-shaders")).cargarCatalogo(); return { catalogo, biblioteca: d.biblioteca, compartido: d.compartido }; }
async function resolverCarpeta(ref: EntityRef, carpetaId: string | null | undefined, d: DepsFondos): Promise<string> {
  const doc = await d.leerBiblioteca(ref);
  if (carpetaId && !doc.folders.some((f) => f.id === carpetaId)) throw new Error("La carpeta elegida ya no existe en esta biblioteca.");
  return carpetaId || idCarpetaFondos(doc.folders) || d.crearCarpeta(ref, CARPETA_FONDOS, null);
}
export async function guardarSet(ref: EntityRef, set: SetFondo, carpetaId?: string | null, deps?: DepsFondos): Promise<ResultadoGuardarSet> {
  const d = deps ?? (await depsPorDefecto());
  const v = validarSet(set, await opciones(d));
  if (!v.ok) return { ok: false, motivos: v.motivos, error: v.motivos[0] };
  try {
    const carpeta = await resolverCarpeta(ref, carpetaId, d), archivo = nombreArchivoSet(v.set);
    const g = await d.guardarArchivo(ref, { blob: new Blob([JSON.stringify(v.set)], { type: MIME_SET }), name: archivo, mime: MIME_SET });
    if (!g.ok || !g.itemId) return { ok: false, error: g.error || "No se pudo guardar el set en la Biblioteca." };
    await d.mover(ref, g.itemId, carpeta);
    let vistaItemId: string | undefined, aviso: string | undefined;
    const bytes = bytesVistaPrevia(v.set.vistaPrevia);
    if (bytes) {
      const nombre = `${archivo.slice(0, -EXTENSION_SET.length)}-vista.png`;
      try {
        const p = await d.guardarArchivo(ref, { blob: new Blob([bytes], { type: "image/png" }), name: nombre, mime: "image/png" });
        if (p.ok && p.itemId) { await d.mover(ref, p.itemId, carpeta); vistaItemId = p.itemId; }
        else aviso = "El set se guardó, pero su vista previa no.";
      } catch { aviso = "El set se guardó, pero su vista previa no."; }
    }
    return { ok: true, carpetaId: carpeta, itemId: g.itemId, vistaItemId, archivo, aviso };
  } catch (e) { return { ok: false, error: (e as Error)?.message || "No se pudo guardar el set en la Biblioteca." }; }
}
export async function listarSets(ref: EntityRef, deps?: DepsFondos): Promise<ResultadoListarSets> {
  const d = deps ?? (await depsPorDefecto()), doc = await d.leerBiblioteca(ref);
  const o = await opciones({ ...d, biblioteca: d.biblioteca ?? prefijosBibliotecaDe(doc.items.map((i) => i.url)) });
  const sets: SetGuardado[] = [], invalidos: SetInvalido[] = [];
  for (const item of doc.items.filter(esItemDeSet)) {
    try {
      const r = importarSet(await d.leerTexto(item), o);
      if (r.ok) sets.push({ set: r.set, itemId: item.id, carpetaId: item.folderId ?? null }); else invalidos.push({ itemId: item.id, motivos: r.motivos });
    } catch (e) { invalidos.push({ itemId: item.id, motivos: [(e as Error)?.message || "no se pudo leer el set"] }); }
  }
  return { sets, invalidos };
}
/** Dependencias reales: `libraryRef` + media-library + Storage de la cuenta. Solo en el navegador. */
async function depsPorDefecto(): Promise<DepsFondos> {
  const [media, lib] = await Promise.all([import("@/lib/library/media-library"), import("@/lib/library/entity-library")]);
  const ref = (r: EntityRef): EntityRef => lib.libraryRef(r.kind, r.id);
  return {
    async leerBiblioteca(r) { const doc = await lib.listLibrary(ref(r)); return { folders: doc.folders, items: doc.items }; },
    crearCarpeta: (r, nombre, padreId) => lib.createFolder(ref(r), nombre, padreId),
    async guardarArchivo(r, e) {
      const f = await media.ensureMediaFolders(ref(r)), res = await media.saveMediaToLibrary(ref(r), { file: e.blob,
        name: e.name, origin: "Importadas", destFolderId: f.subfolders.Importadas, tags: ["fondo"], note: "Set de fondos de StarSeed OS" });
      return { ok: res.ok, error: res.error, itemId: res.itemId, folderId: res.folderId };
    },
    mover: (r, itemId, carpetaId) => media.moveMediaItem(ref(r), itemId, carpetaId),
    async leerTexto(item) {
      if (typeof item.content === "string" && item.content.trim()) return item.content;
      if (!item.url) throw new Error("el set no tiene archivo ni contenido");
      const res = await fetch(item.url); if (!res.ok) throw new Error(`no se pudo descargar el set (${res.status})`); return res.text();
    },
  };
}
