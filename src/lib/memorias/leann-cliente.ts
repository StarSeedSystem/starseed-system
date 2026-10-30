// Cliente del recuerdo semántico LEANN del A1 (LNN1028D2) — SOLO DE SERVIDOR: lee el token
// con node:fs (`~/.starseed/leann.token`, cabecera `X-StarSeed-Token`) y la URL sale de
// `STARSEED_LEANN_URL` (por defecto http://127.0.0.1:4495), según
// architecture/leann-recuerdo-semantico.md §3. Nunca lanza: sin servidor o más de 1,5 s
// vale null; sin LEANN el recuerdo sigue con Memvid y nada falla.
import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { alcanceDe, saneaId, type SujetoMemoria } from "./capsulas";

export const BASE_LEANN = "http://127.0.0.1:4495";
export const TOPE_PETICION_MS = 1500;
const RE_INDICE = /^[a-z0-9][a-z0-9-]*$/; // índice plano, sin / ni ..

export interface AciertoLeann {
  id: string;
  puntuacion: number;
  texto: string;
  metadatos?: Record<string, string | number>;
}
export interface TextoLeann { texto: string; metadatos?: Record<string, string | number> }
export interface OpcionesBuscar { k?: number; filtros?: Record<string, unknown>; pesoVector?: number }
/** `token` y `fetch` existen solo para las pruebas; en vivo el token sale del disco. */
export interface OpcionesCliente { fetch?: typeof fetch; base?: string; token?: string }

/** Nombre del índice LEANN de un sujeto: el de la cápsula sin parte ni extensión. */
export function nombreIndiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}

/** URL base del servidor de LEANN (STARSEED_LEANN_URL, por defecto el A1 por el túnel). */
export function baseLeann(): string {
  const v = process.env.STARSEED_LEANN_URL;
  return v && v.trim().length > 0 ? v.replace(/\/+$/, "") : BASE_LEANN;
}

/** URL de la ruta de un índice; null si el nombre o la ruta no son limpios. */
export function indiceUrl(indice: string, ruta: string, base: string = baseLeann()): string | null {
  if (!RE_INDICE.test(indice) || ruta.includes("/") || ruta.startsWith(".")) return null;
  return `${base.replace(/\/+$/, "")}/indices/${indice}/${ruta}`;
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

/** POST único de este servidor (todas sus rutas útiles son POST con JSON). */
async function pedir(url: string, cuerpo: unknown, opciones: OpcionesCliente): Promise<Respuesta | null> {
  const token = await leerToken(opciones.token);
  if (!token) return null;
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), TOPE_PETICION_MS);
  try {
    const res = await (opciones.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "X-StarSeed-Token": token, "content-type": "application/json" },
      body: JSON.stringify(cuerpo), signal: ctrl.signal, cache: "no-store",
    });
    const data = res.status < 400 ? ((await res.json().catch(() => null)) as unknown) : null;
    return { status: res.status, data };
  } catch { return null; } finally { clearTimeout(temporizador); }
}

function aciertosDe(json: unknown): AciertoLeann[] | null {
  if (!Array.isArray(json)) return null;
  return json.flatMap((e) => {
    const d = (typeof e === "object" && e !== null ? e : {}) as Record<string, unknown>;
    if (typeof d.texto !== "string" || d.texto.length === 0) return [];
    const met = typeof d.metadatos === "object" && d.metadatos !== null ? d.metadatos : undefined;
    return [{
      id: typeof d.id === "string" ? d.id : "",
      puntuacion: typeof d.puntuacion === "number" && Number.isFinite(d.puntuacion) ? d.puntuacion : 0,
      texto: d.texto,
      metadatos: met as Record<string, string | number> | undefined,
    }];
  });
}

/** Búsqueda por significado en un índice del A1; null sin servidor o respuesta mala. */
export async function buscarLeann(
  indice: string, consulta: string, opcionesBuscar: OpcionesBuscar = {}, opciones: OpcionesCliente = {},
): Promise<AciertoLeann[] | null> {
  const cuerpo: Record<string, unknown> = { consulta, k: opcionesBuscar.k ?? 5 };
  if (opcionesBuscar.filtros) cuerpo.filtros = opcionesBuscar.filtros;
  if (typeof opcionesBuscar.pesoVector === "number") cuerpo.peso_vector = opcionesBuscar.pesoVector;
  const url = indiceUrl(indice, "buscar", opciones.base ?? baseLeann());
  if (!url) return null;
  const r = await pedir(url, cuerpo, opciones);
  return r && r.status < 400 ? aciertosDe(r.data) : null;
}

/** Añade textos (con metadatos) al índice con `update_index`; false si no se pudo. */
export async function ponerLeann(indice: string, textos: TextoLeann[], opciones: OpcionesCliente = {}): Promise<boolean> {
  const url = indiceUrl(indice, "poner", opciones.base ?? baseLeann());
  if (!url || textos.length === 0) return false;
  const r = await pedir(url, { textos }, opciones);
  return r !== null && r.status < 400;
}
