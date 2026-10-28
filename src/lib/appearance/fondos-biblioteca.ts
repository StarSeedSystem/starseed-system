/**
 * fondos-biblioteca — sets `.starseed-fondo.json` en la Biblioteca (Ola 1018F · FSH1018I ·
 * architecture/fondos-shaders.md §2-3): json + vista previa PNG en la carpeta elegida (de cualquier
 * Biblioteca) o en «Fondos», que se crea si falta; `listarSets` los relee y valida con `sets-fondo.ts`.
 * Sube por `media-library.ts`/`entity-library.ts`; deps inyectables: sin red, disco, DOM, GPU ni Supabase.
 */
import { EXTENSION_SET, exportarSet, importarSet, type OpcionesSet, type SetFondo } from "./sets-fondo";
import type { ShaderCatalog } from "./catalogo-shaders";
import type { EntityRef, LibraryFolder, SavedItem } from "@/lib/library/entity-library";
export const CARPETA_FONDOS = "Fondos", MIME_SET = "application/json", MIME_VISTA = "image/png";
const TAGS_SET = ["fondos", "set-fondo"], TAGS_VISTA = ["fondos", "vista-previa"];
type Doc = { items: SavedItem[]; folders: LibraryFolder[] };
export interface EntradaArchivo { file: Blob; nombre: string; mime: string; carpetaId: string; tags: string[]; nota?: string }
export interface ResultadoArchivo { ok: boolean; id?: string; error?: string }
/** Todo inyectable: en las pruebas son dobles; en la app, media-library + entity-library. */
export interface DepsFondos {
  listar?: (ref: EntityRef) => Promise<Doc>; crearCarpeta?: (ref: EntityRef, nombre: string, padre: string | null) => Promise<string>;
  guardarArchivo?: (ref: EntityRef, e: EntradaArchivo) => Promise<ResultadoArchivo>; leer?: (item: SavedItem) => Promise<string>;
  catalogo?: () => Promise<ShaderCatalog>; biblioteca?: readonly string[]; compartido?: boolean; ahora?: () => Date;
}
type Deps = Required<Pick<DepsFondos, "listar" | "crearCarpeta" | "guardarArchivo" | "leer" | "catalogo">>;
export type ResultadoGuardarSet = { ok: true; carpetaId: string; archivo: string; itemId?: string; vistaId?: string; aviso?: string } | { ok: false; motivos: string[] };
export interface SetEnBiblioteca { item: SavedItem; carpetaId: string | null; set: SetFondo }
export interface ResultadoListarSets { sets: SetEnBiblioteca[]; descartados: Array<{ item: SavedItem; motivos: string[] }>; error?: string }
/** Nombre del archivo del set, estable y seguro en cualquier sistema de archivos. */
export function nombreArchivoSet(nombre: string): string {
  const slug = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "fondo"}${EXTENSION_SET}`;
}
/** ¿Este ítem de la Biblioteca es un set de fondos? (el título manda; el MIME ayuda). */
export function esSetGuardado(item: Pick<SavedItem, "title" | "mime">): boolean {
  const titulo = (item.title ?? "").trim().toLowerCase(), mime = (item.mime ?? "").toLowerCase();
  return titulo.endsWith(EXTENSION_SET) && (!mime || mime.includes("json"));
}
/** data: PNG → Blob real para subirlo como vista previa; null si no es una imagen base64 válida. */
export function blobDeDataUrl(dataUrl: string): Blob | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+={0,2})$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch { return null; }
}
/** Sube el archivo por la vía de siempre (os-files) y lo deja en la carpeta pedida. */
async function guardarEnMedia(ref: EntityRef, e: EntradaArchivo): Promise<ResultadoArchivo> {
  const media = await import("@/lib/library/media-library");
  await media.ensureMediaFolders(ref); // deja «Imágenes y videos › Importadas» lista
  const res = await media.saveMediaToLibrary(ref, { file: e.file, name: e.nombre, origin: "Importadas", tags: e.tags, note: e.nota });
  if (res.ok && res.itemId && res.folderId !== e.carpetaId) await media.moveMediaItem(ref, res.itemId, e.carpetaId);
  return { ok: res.ok, id: res.itemId, error: res.error };
}
function completar(deps: DepsFondos): Deps {
  const entidad = () => import("@/lib/library/entity-library");
  return {
    listar: deps.listar ?? (async (ref) => (await entidad()).listLibrary(ref)),
    crearCarpeta: deps.crearCarpeta ?? (async (ref, nombre, padre) => (await entidad()).createFolder(ref, nombre, padre)),
    guardarArchivo: deps.guardarArchivo ?? guardarEnMedia,
    leer: deps.leer ?? (async (item) => (item.content?.trim() ? item.content : item.url ? (await fetch(item.url)).text() : "")),
    catalogo: deps.catalogo ?? (async () => (await import("./catalogo-shaders")).cargarCatalogo()),
  };
}
function opciones(deps: DepsFondos, catalogo: ShaderCatalog): OpcionesSet {
  return { catalogo, biblioteca: deps.biblioteca, compartido: deps.compartido };
}
async function carpetaDestino(ref: EntityRef, pedida: string | null, d: Deps): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> {
  const doc = await d.listar(ref);
  if (pedida) return doc.folders.some((f) => f.id === pedida) ? { ok: true, id: pedida } : { ok: false, motivo: "La carpeta elegida ya no existe en esta Biblioteca." };
  const fondos = doc.folders.find((f) => f.parentId === null && f.name === CARPETA_FONDOS);
  return { ok: true, id: fondos ? fondos.id : await d.crearCarpeta(ref, CARPETA_FONDOS, null) };
}
export async function guardarSet(ref: EntityRef, set: SetFondo, carpetaId: string | null = null, deps: DepsFondos = {}): Promise<ResultadoGuardarSet> {
  const d = completar(deps);
  try {
    const ahora = deps.ahora ?? (() => { const f = new Date(set.creado); return Number.isNaN(f.getTime()) ? new Date() : f; });
    const exp = exportarSet(
      { nombre: set.nombre, base: set.base, capas: set.capas, autor: set.autor, licencias: set.licencias, vistaPrevia: set.vistaPrevia, id: set.id },
      { ...opciones(deps, await d.catalogo()), ahora, crearId: () => set.id },
    );
    if (!exp.ok) return { ok: false, motivos: exp.motivos };
    const destino = await carpetaDestino(ref, carpetaId, d);
    if (!destino.ok) return { ok: false, motivos: [destino.motivo] };
    const res = await d.guardarArchivo(ref, {
      file: new Blob([exp.json], { type: MIME_SET }), nombre: exp.archivo, mime: MIME_SET, carpetaId: destino.id,
      tags: TAGS_SET, nota: `Set de fondos «${exp.set.nombre}»`,
    });
    if (!res.ok) return { ok: false, motivos: [res.error ?? "No se pudo guardar el set en la Biblioteca."] };
    let vistaId: string | undefined, aviso: string | undefined;
    const blob = exp.set.vistaPrevia ? blobDeDataUrl(exp.set.vistaPrevia) : null;
    if (exp.set.vistaPrevia && !blob) aviso = "La vista previa no es un PNG válido y no se guardó.";
    else if (blob) {
      const v = await d.guardarArchivo(ref, {
        file: blob, nombre: `${exp.archivo.slice(0, -EXTENSION_SET.length)}.vista.png`, mime: MIME_VISTA,
        carpetaId: destino.id, tags: TAGS_VISTA, nota: `Vista previa de «${exp.set.nombre}»`,
      });
      if (v.ok) vistaId = v.id; else aviso = v.error ?? "No se pudo guardar la vista previa.";
    }
    return { ok: true, carpetaId: destino.id, archivo: exp.archivo, itemId: res.id, vistaId, ...(aviso ? { aviso } : {}) };
  } catch (e) { return { ok: false, motivos: [e instanceof Error ? e.message : "Error inesperado al guardar el set."] }; }
}
/** Lee TODOS los sets de la Biblioteca (estén en la carpeta que estén) y valida cada uno. */
export async function listarSets(ref: EntityRef, deps: DepsFondos = {}): Promise<ResultadoListarSets> {
  const d = completar(deps), sets: SetEnBiblioteca[] = [], descartados: ResultadoListarSets["descartados"] = [];
  try {
    const doc = await d.listar(ref), o = opciones(deps, await d.catalogo());
    for (const item of doc.items) {
      if (!esSetGuardado(item)) continue;
      let texto = "";
      try { texto = await d.leer(item); } catch { descartados.push({ item, motivos: ["no se pudo leer el archivo"] }); continue; }
      const r = importarSet(texto, o);
      if (r.ok) sets.push({ item, carpetaId: item.folderId ?? null, set: r.set });
      else descartados.push({ item, motivos: r.motivos });
    }
  } catch (e) { return { sets: [], descartados: [], error: e instanceof Error ? e.message : "No se pudo leer la Biblioteca." }; }
  return { sets, descartados };
}
