/**
 * fondos-biblioteca — sets `.starseed-fondo.json` en CUALQUIER carpeta de la Biblioteca propia o de
 * una página, grupo, mensaje o publicación (Ola 1018F · FSH1018I · architecture/fondos-shaders.md
 * §2-§3). El set es la ENTIDAD ÚNICA: se guarda una vez y se referencia; su vista previa va como
 * archivo hermano para los aparatos sin WebGPU. El puerto entra inyectado: las pruebas usan una
 * Biblioteca en memoria (sin red, disco ni DOM) y la app, el adaptador real de media-library.
 */
import { EXTENSION_SET, importarSet, validarSet, type OpcionesSet, type SetFondo } from "./sets-fondo";
import type { EntityRef } from "@/lib/library/entity-library";

export const CARPETA_FONDOS = "Fondos", MIME_SET = "application/json", SUFIJO_VISTA = ".vista-previa.png";
export interface CarpetaFondo { id: string; nombre: string; padreId: string | null }
export interface ItemFondo { id: string; titulo: string; mime?: string; carpetaId?: string | null; contenido?: string; url?: string }
export interface VistaBiblioteca { carpetas: CarpetaFondo[]; items: ItemFondo[] }
export interface ArchivoFondo { nombre: string; mime: string; contenido: string; carpetaId: string }

/** Todo lo que la Biblioteca sabe hacer para los fondos: se inyecta en las pruebas. */
export interface PuertoFondos {
  listar(ref: EntityRef): Promise<VistaBiblioteca>;
  crearCarpeta(ref: EntityRef, nombre: string, padreId: string | null): Promise<string>;
  guardarArchivo(ref: EntityRef, archivo: ArchivoFondo): Promise<{ ok: boolean; itemId?: string; error?: string }>;
  leerTexto(ref: EntityRef, item: ItemFondo): Promise<string | null>;
}
export interface OpcionesFondos extends Partial<OpcionesSet> { deps?: PuertoFondos }
export interface SetEnBiblioteca { itemId: string; nombreArchivo: string; carpetaId: string | null; set: SetFondo }
export interface SetRechazado { itemId: string; nombreArchivo: string; carpetaId: string | null; motivos: string[] }
export type ResultadoListado = { sets: SetEnBiblioteca[]; rechazados: SetRechazado[] };
export type ResultadoGuardado =
  | { ok: true; itemId: string; carpetaId: string; nombreArchivo: string; vistaPreviaId?: string; set: SetFondo }
  | { ok: false; motivos: string[] };

/** Slug estable del nombre: sin acentos, minúsculas y guiones (mismo criterio que `exportarSet`). */
export const slugFondo = (nombre: string): string => nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export const nombreArchivoSet = (set: SetFondo): string => `${slugFondo(set.nombre) || "fondo"}${EXTENSION_SET}`;
export const nombreVistaPrevia = (set: SetFondo): string => `${slugFondo(set.nombre) || "fondo"}${SUFIJO_VISTA}`;
/** Es un set si el nombre del ítem lleva la extensión del formato (esté en la carpeta que esté). */
export const esSetGuardado = (item: ItemFondo): boolean => item.titulo.trim().toLowerCase().endsWith(EXTENSION_SET);
/** Carpeta por nombre, sin distinguir mayúsculas ni espacios sobrantes. */
export function buscarCarpeta(carpetas: readonly CarpetaFondo[], nombre: string): CarpetaFondo | undefined {
  const n = nombre.trim().toLowerCase();
  return carpetas.find((c) => c.nombre.trim().toLowerCase() === n);
}
async function opcionesDe(o?: OpcionesFondos): Promise<OpcionesSet> {
  const catalogo = o?.catalogo ?? (await import("./catalogo-shaders")).cargarCatalogo();
  return { catalogo: await catalogo, biblioteca: o?.biblioteca, compartido: o?.compartido };
}
/** PNG en data URL → Blob (sin red): lo que la vista previa entrega a `saveMediaToLibrary`. */
function blobDeDataUrl(dataUrl: string, mime: string): Blob | null {
  const m = /^data:[^;,]+(;base64)?,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    if (!m[1]) return new Blob([decodeURIComponent(m[2])], { type: mime });
    const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch { return null; }
}
/** Adaptador real: `os-files` + Biblioteca por entidad, solo con su API pública (nada se toca). */
async function puertoPorDefecto(): Promise<PuertoFondos> {
  const media = await import("@/lib/library/media-library"), lib = await import("@/lib/library/entity-library");
  return {
    async listar(ref) {
      const doc = await lib.listLibrary(ref);
      return { carpetas: doc.folders.map((f) => ({ id: f.id, nombre: f.name, padreId: f.parentId })),
        items: doc.items.map((it) => ({ id: it.id, titulo: it.title, mime: it.mime, carpetaId: it.folderId ?? null, contenido: it.content, url: it.url })) };
    },
    crearCarpeta: (ref, nombre, padreId) => lib.createFolder(ref, nombre, padreId),
    async guardarArchivo(ref, a) {
      const file = a.mime.startsWith("image/") ? blobDeDataUrl(a.contenido, a.mime) : new File([a.contenido], a.nombre, { type: a.mime });
      if (!file) return { ok: false, error: "la vista previa no es una imagen válida" };
      const r = await media.saveMediaToLibrary(ref, { file, name: a.nombre, origin: "Importadas", destFolderId: a.carpetaId, tags: ["fondos"] });
      if (!r.ok || !r.itemId) return { ok: false, error: r.error ?? "No se pudo guardar el archivo en la Biblioteca." };
      if (r.folderId !== a.carpetaId) await media.moveMediaItem(ref, r.itemId, a.carpetaId);
      return { ok: true, itemId: r.itemId };
    },
    async leerTexto(_ref, item) {
      if (typeof item.contenido === "string") return item.contenido;
      if (!item.url) return null;
      try { const res = await fetch(item.url); return res.ok ? await res.text() : null; } catch { return null; }
    },
  };
}
/**
 * Guarda el set (y su vista previa, si la trae) en la carpeta elegida o en «Fondos», creándola si
 * falta. Valida antes de escribir: nunca mete en la Biblioteca un set que `sets-fondo` rechazaría.
 */
export async function guardarSet(ref: EntityRef, set: SetFondo, carpetaId?: string | null, opciones?: OpcionesFondos): Promise<ResultadoGuardado> {
  const deps = opciones?.deps ?? (await puertoPorDefecto());
  const validado = validarSet(set, await opcionesDe(opciones));
  if (!validado.ok) return validado;
  const bueno = validado.set, vista = await deps.listar(ref);
  if (carpetaId && !vista.carpetas.some((c) => c.id === carpetaId)) return { ok: false, motivos: ["la carpeta elegida no existe en esta Biblioteca"] };
  const destino = carpetaId ?? buscarCarpeta(vista.carpetas, CARPETA_FONDOS)?.id ?? (await deps.crearCarpeta(ref, CARPETA_FONDOS, null));
  const nombreArchivo = nombreArchivoSet(bueno);
  const guardado = await deps.guardarArchivo(ref, { nombre: nombreArchivo, mime: MIME_SET, contenido: JSON.stringify(bueno, null, 2), carpetaId: destino });
  if (!guardado.ok || !guardado.itemId) return { ok: false, motivos: [guardado.error ?? "No se pudo guardar el set."] };
  const vp = bueno.vistaPrevia
    ? await deps.guardarArchivo(ref, { nombre: nombreVistaPrevia(bueno), mime: "image/png", contenido: bueno.vistaPrevia, carpetaId: destino })
    : null;
  return { ok: true, itemId: guardado.itemId, carpetaId: destino, nombreArchivo, vistaPreviaId: vp?.ok ? vp.itemId : undefined, set: bueno };
}
/**
 * Lee TODOS los sets de la Biblioteca (en cualquier carpeta) y los valida con `sets-fondo`. Los que
 * no pasan no se ocultan: vuelven en `rechazados` con sus motivos, para poder explicarlos.
 */
export async function listarSets(ref: EntityRef, opciones?: OpcionesFondos): Promise<ResultadoListado> {
  const deps = opciones?.deps ?? (await puertoPorDefecto());
  const o = await opcionesDe(opciones), vista = await deps.listar(ref);
  const sets: SetEnBiblioteca[] = [], rechazados: SetRechazado[] = [];
  for (const item of vista.items) {
    if (!esSetGuardado(item)) continue;
    const base = { itemId: item.id, nombreArchivo: item.titulo, carpetaId: item.carpetaId ?? null };
    const texto = await deps.leerTexto(ref, item), r = texto === null ? null : importarSet(texto, o);
    if (r?.ok) sets.push({ ...base, set: r.set });
    else rechazados.push({ ...base, motivos: r ? r.motivos : ["no se pudo leer el archivo del set"] });
  }
  sets.sort((a, b) => Date.parse(b.set.creado) - Date.parse(a.set.creado));
  return { sets, rechazados };
}
