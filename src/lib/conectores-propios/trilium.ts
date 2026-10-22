/**
 * Trilium Notes · cliente puro de ETAPI (RLB1020I).
 * Los cerebros y Astraura leen y guardan notas de perfiles, grupos, comunidades, archivos y
 * páginas. El token entra por parámetro y viaja solo en `Authorization`; nunca se escribe en
 * el código ni en los mensajes de error. Módulo PURO, sin `node:*`, con `pedir` inyectable.
 * Búsqueda: `GET /etapi/notes?search=…`; lectura: `GET /etapi/notes/:id/content` (texto plano,
 * tope de 64 KB); creación: `POST /etapi/create-note`.
 */

export type Pedir = (url: string, init: RequestInit) => Promise<Response>;

export const TOPE_CONTENIDO_BYTES = 64 * 1024;

export interface NotaResumen { id: string; titulo: string }
export interface NotaLeida { id: string; contenido: string; truncada: boolean }
export interface NotaCreada { id: string; titulo: string }
export type Resultado<T> = { ok: true; datos: T } | { ok: false; motivo: string };

function direccion(base: string, ruta: string): string {
  return `${base.trim().replace(/\/+$/, "")}${ruta}`;
}

function cabeceras(token: string, conCuerpo = false): Record<string, string> {
  return conCuerpo ? { Authorization: token, "Content-Type": "application/json" } : { Authorization: token };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> { return typeof valor === "object" && valor !== null; }

function notaDesde(valor: unknown): NotaResumen | null {
  if (!esObjeto(valor)) return null;
  const id = typeof valor.noteId === "string" ? valor.noteId : typeof valor.id === "string" ? valor.id : null;
  if (!id) return null;
  return { id, titulo: typeof valor.title === "string" ? valor.title : "" };
}

function recortar(texto: string, tope: number): { texto: string; truncado: boolean } {
  const bytes = new TextEncoder().encode(texto);
  if (bytes.length <= tope) return { texto, truncado: false };
  let fin = tope;
  let recorte = new TextDecoder().decode(bytes.subarray(0, fin));
  while (new TextEncoder().encode(recorte).length > tope && fin > 0) {
    fin -= 1;
    recorte = new TextDecoder().decode(bytes.subarray(0, fin));
  }
  return { texto: recorte, truncado: true };
}

function fallo(accion: string, respuesta: Response): Resultado<never> {
  const pista = respuesta.status === 401 || respuesta.status === 403 ? " (token no válido o sin permiso)" : "";
  return { ok: false, motivo: `ETAPI respondió ${respuesta.status} al ${accion}${pista}.` };
}

export async function buscarNotas(
  base: string,
  token: string,
  consulta: string,
  limite = 20,
  pedir: Pedir = fetch,
): Promise<Resultado<NotaResumen[]>> {
  const tope = Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 100) : 20;
  const ruta = `/etapi/notes?search=${encodeURIComponent(consulta)}&limit=${tope}`;
  try {
    const respuesta = await pedir(direccion(base, ruta), { method: "GET", headers: cabeceras(token) });
    if (!respuesta.ok) return fallo("buscar notas", respuesta);
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    const lista = esObjeto(cuerpo) && Array.isArray(cuerpo.results) ? cuerpo.results : [];
    const notas = lista.map(notaDesde).filter((n): n is NotaResumen => n !== null);
    return { ok: true, datos: notas };
  } catch {
    return { ok: false, motivo: "No se pudo contactar con el servidor de Trilium." };
  }
}

export async function leerNota(
  base: string,
  token: string,
  id: string,
  pedir: Pedir = fetch,
): Promise<Resultado<NotaLeida>> {
  if (!id.trim()) return { ok: false, motivo: "Falta el id de la nota." };
  const ruta = `/etapi/notes/${encodeURIComponent(id)}/content`;
  try {
    const respuesta = await pedir(direccion(base, ruta), { method: "GET", headers: cabeceras(token) });
    if (!respuesta.ok) return fallo("leer la nota", respuesta);
    const recorte = recortar(await respuesta.text(), TOPE_CONTENIDO_BYTES);
    return { ok: true, datos: { id, contenido: recorte.texto, truncada: recorte.truncado } };
  } catch {
    return { ok: false, motivo: "No se pudo contactar con el servidor de Trilium." };
  }
}

export async function crearNota(
  base: string,
  token: string,
  padreId: string,
  titulo: string,
  contenido: string,
  tipo = "text",
  pedir: Pedir = fetch,
): Promise<Resultado<NotaCreada>> {
  if (!padreId.trim() || !titulo.trim()) {
    return { ok: false, motivo: "La nota necesita un padre y un título." };
  }
  const cuerpo = JSON.stringify({ parentNoteId: padreId, title: titulo, type: tipo, content: contenido });
  try {
    const respuesta = await pedir(direccion(base, "/etapi/create-note"), {
      method: "POST",
      headers: cabeceras(token, true),
      body: cuerpo,
    });
    if (!respuesta.ok) return fallo("crear la nota", respuesta);
    const devuelto: unknown = await respuesta.json().catch(() => null);
    const nota = notaDesde(devuelto);
    if (!nota) return { ok: false, motivo: "ETAPI creó la nota pero no devolvió su id." };
    return { ok: true, datos: { id: nota.id, titulo: nota.titulo || titulo } };
  } catch {
    return { ok: false, motivo: "No se pudo contactar con el servidor de Trilium." };
  }
}
