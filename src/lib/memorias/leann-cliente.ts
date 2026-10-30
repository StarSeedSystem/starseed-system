// Cliente del recuerdo semántico LEANN (LNN1028D2) — SOLO DE SERVIDOR: usa node:fs para
// leer el token del llavero de la neurona (`~/.starseed/leann.token`) y llama al servidor
// del A1 (127.0.0.1:4495, cabecera X-StarSeed-Token), según
// architecture/leann-recuerdo-semantico.md §3. Nunca lanza: sin servidor o por encima del
// tope vale null y el recuerdo sigue con Memvid; sin claves ni rutas del disco aquí.
import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { alcanceDe, saneaId, type SujetoMemoria } from "./capsulas";

export const BASE_LEANN = process.env.STARSEED_LEANN_URL ?? "http://127.0.0.1:4495";
export const TOPE_LEANN_MS = 1500;
// La misma regla que valida el servidor en §3; nunca `/`, `..` ni extensión.
const RE_NOMBRE = /^[a-z0-9-]+$/;

export interface MetadatosLeann { alcance: string; sujeto: string; uri?: string; ts?: number }
export interface TextoLeann { texto: string; metadatos: MetadatosLeann }
/** Filtro de metadatos del servidor: campo → operadores (`==`, `in`, `contains`…). */
export interface FiltrosLeann { [campo: string]: Record<string, unknown> }
export interface AciertoLeann {
  id: string | number; puntuacion: number; texto: string; metadatos: Record<string, unknown>;
}
export interface OpcionesBuscar { k?: number; filtros?: FiltrosLeann; pesoVector?: number }
/** `token` y `fetch` existen solo para las pruebas; en vivo el token sale del disco. */
export interface OpcionesCliente { fetch?: typeof fetch; base?: string; token?: string }

/** `<tipo>-<id saneado>-<alcance>`: el índice del sujeto, sin cápsula ni parte ni extensión. */
export function nombreIndiceDe(sujeto: SujetoMemoria): string | null {
  try {
    const nombre = `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
    return RE_NOMBRE.test(nombre) ? nombre : null;
  } catch { return null; }
}

/** Token del llavero de la neurona (0600); null si falta o no se puede leer. */
export async function leerToken(token?: string): Promise<string | null> {
  if (token !== undefined) return token;
  try {
    const leido = (await readFile(path.join(homedir(), ".starseed", "leann.token"), "utf-8")).trim();
    return leido.length > 0 ? leido : null;
  } catch { return null; }
}

interface Respuesta { status: number; data: unknown }
function baseDe(opciones: OpcionesCliente): string {
  return (opciones.base ?? BASE_LEANN).replace(/\/+$/, "");
}
function urlDe(nombre: string, accion: "poner" | "buscar", base?: string): string {
  return `${baseDe({ base })}/indices/${nombre}/${accion}`;
}
async function pedir(ruta: string, cuerpo: unknown, opciones: OpcionesCliente): Promise<Respuesta | null> {
  const token = await leerToken(opciones.token);
  if (!token) return null;
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), TOPE_LEANN_MS);
  try {
    const res = await (opciones.fetch ?? fetch)(ruta, {
      method: "POST",
      headers: { "X-StarSeed-Token": token, "content-type": "application/json" },
      body: JSON.stringify(cuerpo), signal: ctrl.signal, cache: "no-store",
    });
    const data = res.status < 400 ? ((await res.json().catch(() => null)) as unknown) : null;
    return { status: res.status, data };
  } catch { return null; } finally { clearTimeout(temporizador); }
}

/** Añade los textos al índice (el servidor lo crea si no existe, §3); true si aceptó,
 * false si el servidor respondió un rechazo y null sin token, sin servidor o al tope. */
export async function ponerLeann(
  indice: string, textos: TextoLeann[], opciones: OpcionesCliente = {},
): Promise<boolean | null> {
  if (!RE_NOMBRE.test(indice) || textos.length === 0) return null;
  const r = await pedir(urlDe(indice, "poner", opciones.base), { textos }, opciones);
  return r ? r.status < 400 : null;
}

/** Búsqueda por significado; sin `k`, `filtros` ni `pesoVector` los decide el servidor. */
export async function buscarLeann(
  indice: string, consulta: string, opcionesBuscar: OpcionesBuscar = {}, opciones: OpcionesCliente = {},
): Promise<AciertoLeann[] | null> {
  const { k, filtros, pesoVector } = opcionesBuscar;
  if (!RE_NOMBRE.test(indice) || consulta.trim().length === 0) return null;
  const cuerpo = {
    consulta,
    ...(k === undefined ? {} : { k }),
    ...(filtros === undefined ? {} : { filtros }),
    ...(pesoVector === undefined ? {} : { peso_vector: pesoVector }),
  };
  const r = await pedir(urlDe(indice, "buscar", opciones.base), cuerpo, opciones);
  return r && r.status < 400 ? aciertosDe(r.data) : null;
}

/** Traduce la lista del servidor a aciertos limpios; null si no llegó una lista y sin
 * texto o puntuación, fuera el acierto. */
function aciertosDe(json: unknown): AciertoLeann[] | null {
  if (!Array.isArray(json)) return null;
  return json.flatMap((e) => {
    const d = e as { id?: unknown; puntuacion?: unknown; texto?: unknown; metadatos?: unknown };
    if (typeof d.texto !== "string" || typeof d.puntuacion !== "number" || !Number.isFinite(d.puntuacion)) return [];
    return [{
      id: typeof d.id === "string" || typeof d.id === "number" ? d.id : "",
      puntuacion: d.puntuacion, texto: d.texto,
      metadatos: typeof d.metadatos === "object" && d.metadatos !== null
        ? d.metadatos as Record<string, unknown> : {},
    }];
  });
}
