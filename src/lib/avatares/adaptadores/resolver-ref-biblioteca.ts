/**
 * Avatares 3D · RESOLUTOR DE REFERENCIAS «biblioteca:» (AV1011A · contrato architecture/astraura-avatares-3d.md §2 y §3).
 *
 * El ADN solo guarda referencias internas («biblioteca:carpeta/archivo»), nunca una URL externa. Aquí se traducen a la
 * dirección https del archivo con el MISMO catálogo público de la Biblioteca (`listPublicItems` sobre
 * `library_public_items`), donde `scripts/avatares/importar_plantillas.py` publica las plantillas VRM. Sin tablas nuevas.
 * Presupuesto (§3): UNA lectura por carpeta y sesión (las seis plantillas = una sola petición), nunca en bucle ni sondeo.
 * «genesis:» aún no tiene resolutor: se dice con su motivo, no se inventa una dirección.
 * El catálogo lo puede escribir cualquier cuenta (RLS: cada quien lo suyo), así que solo vale un ítem cuyo archivo esté en el
 * almacén público del MISMO proyecto (`NEXT_PUBLIC_SUPABASE_URL` + `/storage/v1/object/public/`): nunca una URL de fuera.
 */
import { esRefInterna } from "../adn/adn";
import { plantillaPorId } from "../plantillas";

export type RefResuelta = { ok: true; url: string } | { ok: false; motivo: string };
export interface ItemBiblioteca { name: string; folder: string; payload: { url?: string } }
export type ListarCarpeta = (carpeta: string) => Promise<ItemBiblioteca[]>;

/** Fuente universal para AvatarVivo. */
export type FuenteAvatar =
    | { tipo: "glb"; url: string }
    | { tipo: "imagen"; url: string }
    | { tipo: "procedural"; svg: string };

export const CARPETA_PLANTILLAS = "avatares/plantillas";
/** Donde `importar_plantillas.py` sube las plantillas con la clave de servicio: con la RLS de os-files cada cuenta solo escribe en
 * `<su uid>/…`, así que nadie más puede poner un archivo aquí. */
export const CAMINO_PLANTILLAS = "os-files/plantillas-avatares/";
const listarPublico: ListarCarpeta = async (carpeta) => (await import("@/lib/library/public-catalog")).listPublicItems({ folder: carpeta });
/** Caché de la sesión por fuente y carpeta: guarda la PROMESA, así dos avatares a la vez no repiten la petición. */
const cache = new WeakMap<ListarCarpeta, Map<string, Promise<ItemBiblioteca[]>>>();

/** El ítem de la carpeta que corresponde al archivo: por el final de su URL, por su nombre o, en plantillas, por el nombre de la plantilla.
 * El catálogo llega del más nuevo al más viejo y vale el MÁS VIEJO (quien lo publicó primero): otro con el mismo nombre publicado
 * después por otra cuenta no lo suplanta. */
export function elegirItem(items: readonly ItemBiblioteca[], carpeta: string, archivo: string): ItemBiblioteca | null {
  const sinExt = archivo.replace(/\.[a-z0-9]+$/i, "");
  const plantilla = carpeta === CARPETA_PLANTILLAS ? plantillaPorId(sinExt)?.nombre : undefined;
  return items.findLast((i) => i.folder === carpeta && (i.payload.url?.endsWith(`/${archivo}`) || i.name === archivo || i.name === sinExt || (!!plantilla && i.name === plantilla))) ?? null;
}

/** Prefijo https del almacén público del proyecto ("" si falta la variable: entonces no se carga nada). */
export function almacenPublico(base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): string {
  const b = base.trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+$/.test(b) ? `${b}/storage/v1/object/public/` : "";
}
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
/** Para el gestor de carga del VRM (como `cargar-modelo`): dentro del modelo solo data:, blob: o https del MISMO servidor. */
export function soloMismoOrigen(urlModelo: string): (u: string) => string {
  const origen = new URL(urlModelo).origin;
  return (u) => {
    if (/^(data|blob):/.test(u)) return u;
    try { const a = new URL(u, urlModelo); if (a.protocol === "https:" && a.origin === origen) return a.toString(); } catch { /* se bloquea */ }
    return PIXEL; // recurso de otro servidor: un píxel transparente en su lugar
  };
}

export async function resolverRefBiblioteca(ref: string, listar: ListarCarpeta = listarPublico, almacen = almacenPublico()): Promise<RefResuelta> {
  if (!esRefInterna(ref)) return { ok: false, motivo: "La referencia del avatar no es interna («biblioteca:» o «genesis:»): no se carga." };
  if (ref.startsWith("genesis:")) return { ok: false, motivo: "Las referencias «genesis:» aún no tienen resolutor en este visor." };
  const ruta = ref.slice("biblioteca:".length), corte = ruta.lastIndexOf("/");
  const carpeta = corte > 0 ? ruta.slice(0, corte) : "", archivo = ruta.slice(corte + 1);
  if (!almacen) return { ok: false, motivo: "Falta NEXT_PUBLIC_SUPABASE_URL (https) en este entorno: no se sabe dónde está el almacén de la Biblioteca." };
  const porCarpeta = cache.get(listar) ?? new Map<string, Promise<ItemBiblioteca[]>>();
  cache.set(listar, porCarpeta);
  if (archivo && !porCarpeta.has(carpeta)) porCarpeta.set(carpeta, listar(carpeta).catch(() => []));
  const items = archivo ? (await porCarpeta.get(carpeta)) ?? [] : [];
  // Las plantillas, solo de su camino oficial; lo demás, del almacén. Se compara la dirección YA normalizada: «..» no se cuela.
  const prefijo = carpeta === CARPETA_PLANTILLAS ? `${almacen}${CAMINO_PLANTILLAS}` : almacen;
  const normal = (u = ""): string => { try { const h = new URL(u).href; return h.startsWith(prefijo) ? h : ""; } catch { return ""; } };
  // Primero los del almacén: un ítem que apunte fuera no tapa al bueno.
  const item = elegirItem(items.filter((i) => normal(i.payload.url)), carpeta, archivo);
  if (item) return { ok: true, url: normal(item.payload.url) };
  if (elegirItem(items, carpeta, archivo)) return { ok: false, motivo: "El archivo de la Biblioteca no está en su almacén (https del proyecto; las plantillas, en su carpeta oficial): no se carga una dirección de fuera." };
  return { ok: false, motivo: `«${archivo || ruta}» no aparece en la Biblioteca (carpeta «${carpeta || "raíz"}»): no está publicado o no se pudo leer el catálogo.` };
}

/** Convierte una referencia interna a una FuenteAvatar para AvatarVivo (glb). Si la resolución falla, devuelve una fuente procedural vacía. */
export async function getFuenteParaRef(ref: string): Promise<FuenteAvatar> {
  const res = await resolverRefBiblioteca(ref);
  if (res.ok) {
    return { tipo: "glb", url: res.url };
  }
  // fallback to procedural empty avatar
  return { tipo: "procedural", svg: "" };
}
