// Cliente del servidor de cápsulas Memvid (MVD1027D, 2026-10-28). SOLO servidor:
// habla con 127.0.0.1:4490 y lee el token de ~/.starseed/memvid.token; nunca lo
// devuelve, ni lo escribe en logs, ni expone rutas del disco. Sin el servidor,
// todo devuelve null y nada lanza. Contrato: architecture/memvid-capsulas.md §4.
import "server-only";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { capsulaDe, nombreCapsula, type SujetoMemoria, type TipoSujeto } from "./capsulas";
export const BASE_MEMVID = "http://127.0.0.1:4490";
export const TOPE_MS = 1500;
export const CABECERA_TOKEN = "X-StarSeed-Token";
/** Dependencias inyectables: en producción, el `fetch` real y el token del llavero. */
export interface Dependencias { fetch: typeof fetch; token: string | null; ahora: () => number }
export function dependenciasReales(): Dependencias {
  let token: string | null = null;
  try { token = readFileSync(path.join(os.homedir(), ".starseed", "memvid.token"), "utf8").trim() || null; } catch { token = null; }
  return { fetch, token, ahora: Date.now };
}

const TIPOS: TipoSujeto[] = ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];

/** «personalidad:aurora» → sujeto; cualquier otra forma, null. */
export function parsearSujeto(texto: string): SujetoMemoria | null {
  const corte = texto.indexOf(":");
  if (corte <= 0) return null;
  const tipo = texto.slice(0, corte) as TipoSujeto;
  const id = texto.slice(corte + 1).trim();
  return TIPOS.includes(tipo) && id ? { tipo, id } : null;
}
export interface AciertoCapsula { titulo: string; texto: string; uri: string; ts?: number }
export interface EstadoCapsula { nombre: string; fotogramas: number; bytes: number; topeBytes: number; quedaBytes: number }
export interface LineaCapsula { frame: number; ts: number; titulo?: string; uri?: string }
export interface OpcionesPoner { titulo?: string; uri?: string; etiquetas?: string[]; ts?: number; parte?: number; fecha?: Date; cifrada?: boolean }
export interface ResultadoPoner { frame: number; capsula: string }
interface Respuesta { estado: number; cuerpo: unknown }
const objeto = (v: unknown): Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown, alt = 0): number => typeof v === "number" && Number.isFinite(v) ? v : alt;
function primero(o: Record<string, unknown>, claves: string[], alt = 0): number {
  for (const clave of claves) { const v = numero(o[clave], Number.NaN); if (Number.isFinite(v)) return v; }
  return alt;
}
async function pedir(deps: Dependencias, metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<Respuesta | null> {
  if (!deps.token) return null;
  try {
    const r = await deps.fetch(`${BASE_MEMVID}${ruta}`, {
      method: metodo,
      headers: { [CABECERA_TOKEN]: deps.token, ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TOPE_MS),
      cache: "no-store",
    });
    let datos: unknown = null;
    try { datos = await r.json(); } catch { datos = null; }
    return { estado: r.status, cuerpo: datos };
  } catch { return null; }
}
/** Vivo (true), responde pero mal (false) o no está (null). Nunca lanza. */
export async function salud(deps: Dependencias = dependenciasReales()): Promise<boolean | null> {
  const r = await pedir(deps, "GET", "/salud");
  return r === null ? null : r.estado === 200;
}

/** Fotogramas, tamaño, tope y lo que queda de una cápsula; null si no existe o falla. */
export async function estado(nombre: string, deps: Dependencias = dependenciasReales()): Promise<EstadoCapsula | null> {
  const r = await pedir(deps, "GET", `/capsulas/${encodeURIComponent(nombre)}/estado`);
  if (!r || r.estado !== 200) return null;
  const o = objeto(r.cuerpo);
  const bytes = primero(o, ["bytes", "tamano", "size_bytes"]);
  const topeBytes = primero(o, ["topeBytes", "tope", "capacity_bytes"], 50 * 1024 * 1024);
  return { nombre, bytes, topeBytes, fotogramas: primero(o, ["fotogramas", "frames", "frame_count"]), quedaBytes: primero(o, ["quedaBytes", "queda"], Math.max(0, topeBytes - bytes)) };
}
function cuerpoPoner(t: string, o: OpcionesPoner): Record<string, unknown> {
  return { texto: t, ...(o.titulo ? { titulo: o.titulo } : {}), ...(o.uri ? { uri: o.uri } : {}), ...(o.etiquetas ? { etiquetas: o.etiquetas } : {}), ...(o.ts !== undefined ? { ts: o.ts } : {}) };
}
/** Añade un fotograma; si el servidor da 507 abre la parte siguiente y reintenta UNA vez. */
export async function poner(sujeto: SujetoMemoria, textoNuevo: string, opciones: OpcionesPoner = {}, deps: Dependencias = dependenciasReales()): Promise<ResultadoPoner | null> {
  const fecha = opciones.fecha ?? new Date(deps.ahora());
  const parte = opciones.parte ?? 1;
  try {
    const nombre = capsulaDe(sujeto, fecha, parte, opciones.cifrada).nombre;
    const enviar = (n: string) => pedir(deps, "POST", `/capsulas/${encodeURIComponent(n)}/poner`, cuerpoPoner(textoNuevo, opciones));
    let r = await enviar(nombre);
    let usado = nombre;
    if (r?.estado === 507) { usado = nombreCapsula(sujeto, fecha, parte + 1, opciones.cifrada); r = await enviar(usado); }
    if (!r || r.estado !== 200) return null;
    return { frame: numero(objeto(r.cuerpo).frame), capsula: usado };
  } catch { return null; }
}
/** Los k mejores fragmentos de una cápsula; null si el servidor no está. */
export async function buscar(nombre: string, consulta: string, k = 5, deps: Dependencias = dependenciasReales()): Promise<AciertoCapsula[] | null> {
  const tope = Number.isFinite(k) ? Math.min(20, Math.max(1, Math.trunc(k))) : 5;
  const r = await pedir(deps, "POST", `/capsulas/${encodeURIComponent(nombre)}/buscar`, { consulta, k: tope });
  if (!r) return null;
  const crudos = objeto(r.cuerpo).aciertos;
  if (r.estado !== 200 || !Array.isArray(crudos)) return [];
  return crudos.slice(0, tope).flatMap((crudo) => {
    const o = objeto(crudo);
    const cuerpo = texto(o.texto);
    return cuerpo ? [{ titulo: texto(o.titulo), texto: cuerpo, uri: texto(o.uri), ...(typeof o.ts === "number" ? { ts: o.ts } : {}) }] : [];
  });
}

/** Línea del tiempo de una cápsula; null si no está o el servidor no responde. */
export async function linea(nombre: string, desde?: number, hasta?: number, deps: Dependencias = dependenciasReales()): Promise<LineaCapsula[] | null> {
  const p = new URLSearchParams();
  if (desde !== undefined) p.set("desde", String(desde));
  if (hasta !== undefined) p.set("hasta", String(hasta));
  const r = await pedir(deps, "GET", `/capsulas/${encodeURIComponent(nombre)}/linea${p.size ? `?${p}` : ""}`);
  if (!r || r.estado !== 200) return null;
  const crudos = Array.isArray(r.cuerpo) ? r.cuerpo : objeto(r.cuerpo).linea;
  if (!Array.isArray(crudos)) return [];
  return crudos.flatMap((crudo) => {
    const o = objeto(crudo);
    const frame = primero(o, ["frame", "frame_id"], -1);
    const titulo = texto(o.titulo) || texto(o.preview);
    return frame < 0 ? [] : [{ frame, ts: primero(o, ["ts", "timestamp"]), ...(titulo ? { titulo } : {}), ...(texto(o.uri) ? { uri: texto(o.uri) } : {}) }];
  });
}
