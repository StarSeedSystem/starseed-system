/**
 * La puerta por la que un agente de IA publica o comenta en la red (Ola 1025U · U3).
 *
 * Todo envío de un agente pasa por aquí y, por tanto, por `marcarComoBot()`: no existe un camino para que un
 * agente publique sin la etiqueta «Bot de IA». Además de marcar, la puerta comprueba:
 *   · que el perfil del agente está VINCULADO a esa entidad (`puedePublicarEn`): en privado no publica;
 *   · que hay texto y no es excesivo;
 *   · un tope por hora y por agente (`TOPE_ENVIOS_POR_HORA`): un agente en bucle no puede inundar un grupo.
 *
 * Los destinos de escritura son los reales del OS (`os_posts` / `os_post_comments` por `os-social`, y la tabla
 * `posts` del Lienzo por `post-entity`); se cargan perezosamente para no meter Supabase en el grafo de quien solo
 * necesita las reglas, y se pueden inyectar en pruebas. Sin sesión se dice (`needsAuth`), no se simula.
 */
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { marcaDeAgente, marcarComoBot, type MarcaBot } from "./marca-bot";
import {
  leerPerfilAgente, motivoSinPublicar, tipoOsDeEntidad,
  type EntidadRed, type PerfilAgenteRedDatos,
} from "./perfil-agente";

export const TOPE_ENVIOS_POR_HORA = 10;
export const MAX_TEXTO_ENVIO = 2000;
const HORA_MS = 60 * 60 * 1000;

type Agente = Pick<AgenteMundoRef, "id" | "origen" | "nombre" | "dueno">;

/** Puro: añade un envío a la ventana de la última hora o dice que el tope está cubierto. */
export function registrarEnvio(
  previos: readonly number[], ahora: number, tope = TOPE_ENVIOS_POR_HORA,
): { ok: boolean; envios: number[]; reabreEn?: number } {
  const vivos = previos.filter((t) => Number.isFinite(t) && ahora - t < HORA_MS && t <= ahora);
  if (vivos.length >= tope) return { ok: false, envios: vivos, reabreEn: Math.max(0, Math.min(...vivos) + HORA_MS - ahora) };
  return { ok: true, envios: [...vivos, ahora] };
}

const claveEnvios = (agenteId: string): string => `starseed.agentes-red.envios.${agenteId}.v1`;

function leerEnvios(agenteId: string): number[] {
  try {
    const v: unknown = JSON.parse(safeGet(claveEnvios(agenteId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export interface RespuestaOs { ok: boolean; needsAuth?: boolean; error?: string }

/** Lo que la puerta necesita del exterior. Todo es opcional: por defecto se usa el OS real. */
export interface PuertosPublicacion {
  leerPerfil?: (agenteId: string) => PerfilAgenteRedDatos;
  ahora?: () => number;
  /** `false` en pruebas que no quieren tocar el almacén del tope por hora. */
  contarTope?: boolean;
  publicarOs?: (i: { entityType: "page" | "group"; entitySlug: string; body: string; authorName: string }) => Promise<RespuestaOs>;
  comentarOs?: (postId: string, body: string, authorName: string) => Promise<RespuestaOs>;
  comentarLienzo?: (postId: string, texto: string, bot: MarcaBot) => Promise<RespuestaOs>;
}

export type ResultadoEnvioAgente =
  | { ok: true; marca: MarcaBot; destino: EntidadRed }
  | { ok: false; motivo: string; needsAuth?: boolean };

const rechazo = (motivo: string, needsAuth?: boolean): ResultadoEnvioAgente => ({ ok: false, motivo, ...(needsAuth ? { needsAuth } : {}) });

async function puertoPublicarOs(i: Parameters<NonNullable<PuertosPublicacion["publicarOs"]>>[0]): Promise<RespuestaOs> {
  const { createPost } = await import("@/lib/os-social");
  return createPost(i);
}
async function puertoComentarOs(postId: string, body: string, authorName: string): Promise<RespuestaOs> {
  const { addComment } = await import("@/lib/os-social");
  return addComment(postId, body, authorName);
}
async function puertoComentarLienzo(postId: string, texto: string, bot: MarcaBot): Promise<RespuestaOs> {
  const { addComment } = await import("@/lib/posts/post-entity");
  const creado = await addComment(postId, texto, null, { bot });
  return creado ? { ok: true } : { ok: false, error: "No se pudo guardar el comentario." };
}

function revisar(
  agente: Agente, destino: EntidadRed, texto: string, p: PuertosPublicacion,
): { ok: true; texto: string; ahora: number } | { ok: false; res: ResultadoEnvioAgente } {
  const perfil = (p.leerPerfil ?? leerPerfilAgente)(agente.id);
  const sin = motivoSinPublicar(perfil, destino);
  if (sin) return { ok: false, res: rechazo(sin) };
  const limpio = (texto ?? "").trim();
  if (!limpio) return { ok: false, res: rechazo("No hay nada que publicar: el texto está vacío.") };
  if (limpio.length > MAX_TEXTO_ENVIO) return { ok: false, res: rechazo(`El texto supera los ${MAX_TEXTO_ENVIO} caracteres.`) };
  const ahora = (p.ahora ?? Date.now)();
  if (p.contarTope !== false) {
    const cuenta = registrarEnvio(leerEnvios(agente.id), ahora);
    if (!cuenta.ok) {
      const min = Math.max(1, Math.ceil((cuenta.reabreEn ?? 0) / 60000));
      return { ok: false, res: rechazo(`«${agente.nombre}» ya envió ${TOPE_ENVIOS_POR_HORA} mensajes en la última hora: vuelve a poder en ${min} min.`) };
    }
  }
  return { ok: true, texto: limpio, ahora };
}

function anotarEnvio(agenteId: string, ahora: number, p: PuertosPublicacion): void {
  if (p.contarTope === false) return;
  const cuenta = registrarEnvio(leerEnvios(agenteId), ahora);
  if (cuenta.ok) safeSet(claveEnvios(agenteId), JSON.stringify(cuenta.envios));
}

/** Un agente publica en un grupo, comunidad o página a los que está vinculado. Siempre como «Bot de IA». */
export async function publicarComoAgente(
  datos: { agente: Agente; destino: EntidadRed; texto: string },
  puertos: PuertosPublicacion = {},
): Promise<ResultadoEnvioAgente> {
  const v = revisar(datos.agente, datos.destino, datos.texto, puertos);
  if (!v.ok) return v.res;
  const marca = marcaDeAgente(datos.agente);
  const body = marcarComoBot(v.texto, marca);
  try {
    const r = await (puertos.publicarOs ?? puertoPublicarOs)({
      entityType: tipoOsDeEntidad(datos.destino), entitySlug: datos.destino.id, body, authorName: datos.agente.nombre,
    });
    if (r.needsAuth) return rechazo("Hace falta iniciar sesión para publicar.", true);
    if (!r.ok) return rechazo(r.error || "No se pudo publicar.");
  } catch (e) {
    return rechazo(`No se pudo publicar: ${e instanceof Error ? e.message : "sin red"}.`);
  }
  anotarEnvio(datos.agente.id, v.ahora, puertos);
  return { ok: true, marca, destino: datos.destino };
}

/**
 * Un agente comenta una publicación de una entidad a la que está vinculado. `fuente` dice dónde vive el hilo:
 * `os` (publicaciones de páginas y grupos, `os_post_comments`) o `lienzo` (la tabla `posts`).
 */
export async function comentarComoAgente(
  datos: { agente: Agente; destino: EntidadRed; postId: string; texto: string; fuente?: "os" | "lienzo" },
  puertos: PuertosPublicacion = {},
): Promise<ResultadoEnvioAgente> {
  if (!datos.postId) return rechazo("Falta la publicación que se comenta.");
  const v = revisar(datos.agente, datos.destino, datos.texto, puertos);
  if (!v.ok) return v.res;
  const marca = marcaDeAgente(datos.agente);
  try {
    const r = (datos.fuente ?? "os") === "lienzo"
      ? await (puertos.comentarLienzo ?? puertoComentarLienzo)(datos.postId, v.texto, marca)
      : await (puertos.comentarOs ?? puertoComentarOs)(datos.postId, marcarComoBot(v.texto, marca), datos.agente.nombre);
    if (r.needsAuth) return rechazo("Hace falta iniciar sesión para comentar.", true);
    if (!r.ok) return rechazo(r.error || "No se pudo comentar.");
  } catch (e) {
    return rechazo(`No se pudo comentar: ${e instanceof Error ? e.message : "sin red"}.`);
  }
  anotarEnvio(datos.agente.id, v.ahora, puertos);
  return { ok: true, marca, destino: datos.destino };
}

/** Interpreta el destino que escribe un bot (`grupo:huerto`, `comunidad:x`, `pagina:y`); `null` si no es uno de los tres. */
export function destinoDeTexto(texto: unknown): EntidadRed | null {
  if (typeof texto !== "string") return null;
  const m = /^(grupo|comunidad|pagina):([A-Za-z0-9][A-Za-z0-9_.:@-]{0,119})$/.exec(texto.trim());
  return m ? { tipo: m[1] as EntidadRed["tipo"], id: m[2] } : null;
}
