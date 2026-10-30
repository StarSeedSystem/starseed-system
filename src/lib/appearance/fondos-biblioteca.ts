/**
 * fondos-biblioteca — sets de fondos (`.starseed-fondo.json`) en la Biblioteca por entidad
 * (Ola 1018F · FSH1018I · architecture/fondos-shaders.md §2). Modelo de `media-library.ts`
 * (carpeta raíz propia, guardar, mover) + referencias de `entity-library.ts`: el set vive UNA
 * vez (Entidad Única), su JSON en `content` del ítem y la vista previa en `thumbnail`.
 * PURO: la capa de Biblioteca es inyectable — `dependenciasEntityLibrary()` la une con
 * `import` dinámico solo en cliente — y las pruebas no tocan disco, red ni Supabase.
 */
import type { EntityLibraryDoc, EntityRef, LibraryFolder, SaveItemInput, SavedItem } from "@/lib/library/entity-library";
import { EXTENSION_SET, MAX_SET_BYTES, importarSet, type OpcionesSet, type SetFondo } from "./sets-fondo";

/** Carpeta raíz donde aterrizan los sets si quien guarda no eligió otra. */
export const CARPETA_FONDOS = "Fondos";
export const TAG_SET_FONDO = "fondo";
export const SET_FONDO_MIME = "application/vnd.starseed.fondo+json";
/** Prefijo del `refId` que identifica al ítem de un set (Entidad Única: uno por set). */
const PREFIJO_REFID = "fondo:";

/** Los cuatro movimientos de biblioteca que este módulo necesita; nada más. */
export interface DependenciasBiblioteca {
  listar(ref: EntityRef): Promise<EntityLibraryDoc>;
  crearCarpeta(ref: EntityRef, nombre: string, parentId: string | null): Promise<string>;
  guardar(ref: EntityRef, item: SaveItemInput, folderId?: string | null): Promise<{ ok: boolean; id: string }>;
  mover(ref: EntityRef, itemId: string, folderId: string | null): Promise<void>;
  /** Necesaria para REEMPLAZAR el contenido de un set ya guardado (saveItem deduplica y no reescribe). */
  quitar(ref: EntityRef, itemId: string): Promise<void>;
}

/** Une las dependencias con la biblioteca real (sin arrastrar entity-library al cargar el módulo). */
export async function dependenciasEntityLibrary(): Promise<DependenciasBiblioteca> {
  const lib = await import("@/lib/library/entity-library");
  return { listar: lib.listLibrary, crearCarpeta: lib.createFolder, guardar: lib.saveItem, mover: lib.moveItem, quitar: lib.removeItem };
}

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** La carpeta «Fondos» de la raíz, si existe (null = hay que crearla). */
export function carpetaFondos(folders: LibraryFolder[]): LibraryFolder | null {
  return folders.find((f) => f.parentId === null && f.name === CARPETA_FONDOS) ?? null;
}

/** ¿Es este ítem un set de fondos? (la marca es el MIME propio o la etiqueta «fondo»). */
export function esSetFondo(it: Pick<SavedItem, "type" | "mime" | "tags">): boolean {
  const marco = it.mime === SET_FONDO_MIME || it.tags.includes(TAG_SET_FONDO);
  return marco && (it.type === "design" || it.type === "file");
}

/** Construye el ítem de biblioteca a partir del set: content = JSON 1 a 1 del set. */
export function itemParaSet(set: SetFondo): SaveItemInput {
  return {
    type: "design",
    refId: `${PREFIJO_REFID}${set.id}`, // Entidad Única: un set, un ítem reencontrable por su id
    title: set.nombre,
    mime: SET_FONDO_MIME,
    content: JSON.stringify(set),
    thumbnail: set.vistaPrevia, // la vista previa ya es parte del formato (.starseed-fondo.json)
    tags: [TAG_SET_FONDO, "shaders"],
    language: "json",
    note: `${EXTENSION_SET} · base ${set.base ?? "el motor actual"}`,
  };
}

export type GuardadoSet = { ok: true; carpetaId: string | null; itemId: string } | { ok: false; motivo: string };

/** Guarda el set en la carpeta elegida o en «Fondos» (la crea si falta). */
export async function guardarSet(
  ref: EntityRef, set: SetFondo, carpetaId?: string | null, deps?: DependenciasBiblioteca,
): Promise<GuardadoSet> {
  const json = JSON.stringify(set);
  // El tope se mide ANTES de nada (igual que `importarSet`): nada de 2 MB+ convertido en objetos.
  if (bytes(json) > MAX_SET_BYTES) return { ok: false, motivo: "el set pesa más de 2 MB" };
  const d = deps ?? (await dependenciasEntityLibrary());
  const doc = await d.listar(ref);
  let destino: string | null;
  if (carpetaId) {
    // Carpeta elegida explícitamente: debe existir; nunca se inventa una desconocida.
    const elegida = doc.folders.find((f) => f.id === carpetaId);
    if (!elegida) return { ok: false, motivo: "la carpeta elegida no existe" };
    destino = elegida.id;
  } else {
    // «Fondos» en la raíz, igual que «Imágenes y videos» en media-library: idempotente.
    const propia = carpetaFondos(doc.folders);
    destino = propia ? propia.id : await d.crearCarpeta(ref, CARPETA_FONDOS, null);
  }
  // Entidad Única con contenido al día: `saveItem` deduplica por refId manteniendo el JSON
  // viejo, así que el ítem anterior se quita primero y el nuevo guardado manda.
  const ago = doc.items.find((it) => esSetFondo(it) && it.refId === `${PREFIJO_REFID}${set.id}`);
  if (ago) await d.quitar(ref, ago.id);
  const guardado = await d.guardar(ref, itemParaSet(set), destino);
  return guardado.ok ? { ok: true, carpetaId: destino, itemId: guardado.id } : { ok: false, motivo: "no se pudo guardar en la biblioteca" };
}

/** Mueve un set guardado a otra carpeta de su biblioteca (espejo de `moveMediaItem`). */
export async function moverSet(
  ref: EntityRef, itemId: string, carpetaId: string | null, deps?: DependenciasBiblioteca,
): Promise<void> {
  const d = deps ?? (await dependenciasEntityLibrary());
  return d.mover(ref, itemId, carpetaId);
}

export type SetGuardado =
  | { ok: true; itemId: string; carpetaId: string | null | undefined; set: SetFondo }
  | { ok: false; itemId: string; motivo: string };

/** Lee y valida con `sets-fondo` los sets guardados en la biblioteca de la entidad. */
export async function listarSets(
  ref: EntityRef, opciones: OpcionesSet, deps?: DependenciasBiblioteca,
): Promise<SetGuardado[]> {
  const d = deps ?? (await dependenciasEntityLibrary());
  const doc = await d.listar(ref);
  const salida: SetGuardado[] = [];
  for (const it of doc.items) {
    // Solo los sets de este módulo: los diseños .ssdesign.json y el resto pasan de largo.
    if (!esSetFondo(it) || !it.content) continue;
    // Validación completa con sets-fondo (catálogo de la versión instalada inyectado): el ítem
    // que ya no pasa (o su JSON roto) se cuenta con su motivo, nunca un fallo mudo.
    const r = importarSet(it.content, opciones);
    salida.push(r.ok ? { ok: true, itemId: it.id, carpetaId: it.folderId, set: r.set } : { ok: false, itemId: it.id, motivo: r.motivos.join(" · ") });
  }
  return salida;
}
