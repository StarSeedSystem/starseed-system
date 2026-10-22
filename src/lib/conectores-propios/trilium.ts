/**
 * Trilium Notes · cliente puro de ETAPI (RLB1020I).
 *
 * Sirve a la memoria de los cerebros y a las notas de perfiles, grupos y
 * archivos. No importa `node:*` ni hace red por su cuenta: `pedir` entra
 * inyectado para que la misma lógica corra en el cliente o en una ruta.
 *
 * El token de ETAPI viaja SOLO en la cabecera `Authorization`; nunca se
 * escribe en la URL, en un mensaje de error ni en un registro.
 */

export const TOPE_CONTENIDO = 64 * 1024;

export interface RespuestaEtapi {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type Pedir = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<RespuestaEtapi>;

export interface NotaResumen {
  id: string;
  titulo: string;
}

export interface NotaLeida {
  id: string;
  contenido: string;
  truncado: boolean;
}

export interface NotaCreada {
  id: string;
  titulo: string;
}

export class ErrorTrilium extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorTrilium";
  }
}

function raizEtapi(base: string): string {
  const limpia = base.trim().replace(/\/+$/, "");
  return /\/etapi$/i.test(limpia) ? limpia : `${limpia}/etapi`;
}

function urlEtapi(base: string, ruta: string): string {
  return `${raizEtapi(base)}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}

function limpiarToken(texto: string, token: string): string {
  return token ? texto.split(token).join("«oculto»") : texto;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function idDe(fila: Record<string, unknown>): string {
  return texto(fila.noteId) || texto(fila.id);
}

async function detalleDeError(respuesta: RespuestaEtapi, token: string): Promise<string> {
  let cuerpo = "";
  try {
    cuerpo = (await respuesta.text()).trim();
  } catch {
    cuerpo = "";
  }
  const detalle = cuerpo ? `: ${limpiarToken(cuerpo.slice(0, 300), token)}` : "";
  return `Trilium respondió ${respuesta.status}${detalle}`;
}

async function pedirJson(pedir: Pedir, url: string, init: Parameters<Pedir>[1], token: string): Promise<unknown> {
  let respuesta: RespuestaEtapi;
  try {
    respuesta = await pedir(url, init);
  } catch {
    throw new ErrorTrilium(0, "No se pudo llegar a Trilium: sin conexión o el servidor no responde.");
  }
  if (!respuesta.ok) throw new ErrorTrilium(respuesta.status, await detalleDeError(respuesta, token));
  const crudo = await respuesta.text();
  if (!crudo.trim()) return null;
  try {
    return JSON.parse(crudo) as unknown;
  } catch {
    throw new ErrorTrilium(respuesta.status, "Trilium devolvió una respuesta que no es JSON.");
  }
}

function cabeceras(token: string, conJson = false): Record<string, string> {
  const limpio = token.trim();
  if (!limpio) throw new ErrorTrilium(0, "Falta el token de ETAPI de Trilium.");
  const cabecera: Record<string, string> = { Authorization: limpio };
  if (conJson) cabecera["Content-Type"] = "application/json";
  return cabecera;
}

/** Busca notas por texto y devuelve como mucho `limite` resúmenes con id y título. */
export async function buscarNotas(
  base: string,
  token: string,
  consulta: string,
  pedir: Pedir,
  limite = 20,
): Promise<NotaResumen[]> {
  const cuantas = Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 100) : 20;
  const url = `${urlEtapi(base, "/notes")}?search=${encodeURIComponent(consulta.trim())}`;
  const datos = await pedirJson(pedir, url, { method: "GET", headers: cabeceras(token) }, token);
  const filas = Array.isArray(datos) ? datos : [];
  const notas: NotaResumen[] = [];
  for (const fila of filas) {
    const nota = objeto(fila);
    if (!nota) continue;
    const id = idDe(nota);
    if (!id) continue;
    notas.push({ id, titulo: texto(nota.title) || texto(nota.titulo) });
    if (notas.length >= cuantas) break;
  }
  return notas;
}

/** Lee el contenido en texto plano de una nota, recortado a 64 KB como mucho. */
export async function leerNota(
  base: string,
  token: string,
  id: string,
  pedir: Pedir,
): Promise<NotaLeida> {
  const notaId = id.trim();
  if (!notaId) throw new ErrorTrilium(0, "Falta el id de la nota de Trilium.");
  const url = urlEtapi(base, `/notes/${encodeURIComponent(notaId)}/content`);
  let respuesta: RespuestaEtapi;
  try {
    respuesta = await pedir(url, { method: "GET", headers: cabeceras(token) });
  } catch {
    throw new ErrorTrilium(0, "No se pudo llegar a Trilium: sin conexión o el servidor no responde.");
  }
  if (!respuesta.ok) throw new ErrorTrilium(respuesta.status, await detalleDeError(respuesta, token));
  const crudo = await respuesta.text();
  const bytes = new TextEncoder().encode(crudo);
  if (bytes.length <= TOPE_CONTENIDO) return { id: notaId, contenido: crudo, truncado: false };
  const contenido = new TextDecoder().decode(bytes.slice(0, TOPE_CONTENIDO));
  return { id: notaId, contenido, truncado: true };
}

/** Crea una nota hija de `padreId`; `tipo` por defecto es «text». */
export async function crearNota(
  base: string,
  token: string,
  padreId: string,
  titulo: string,
  contenido: string,
  pedir: Pedir,
  tipo = "text",
): Promise<NotaCreada> {
  const padre = padreId.trim();
  if (!padre) throw new ErrorTrilium(0, "Falta el id de la nota padre de Trilium.");
  const cuerpo = JSON.stringify({ parentNoteId: padre, title: titulo, type: tipo, content: contenido });
  const datos = await pedirJson(
    pedir,
    urlEtapi(base, "/create-note"),
    { method: "POST", headers: cabeceras(token, true), body: cuerpo },
    token,
  );
  const nota = objeto(objeto(datos)?.note) ?? objeto(datos);
  const id = nota ? idDe(nota) : "";
  if (!id) throw new ErrorTrilium(0, "Trilium creó la nota pero no devolvió su id.");
  return { id, titulo: texto(nota?.title) || titulo };
}
