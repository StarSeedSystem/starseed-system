// Cliente del servidor de cápsulas Memvid (MVD1027D, 2026-10-27) — SOLO servidor. Contrato:
// architecture/memvid-capsulas.md §4 · núcleo: integraciones-de-codigo/memvid/README-starseed.md; nada del SDK
// de Node ni de memvid.com; nunca lanza: servidor caído → null. fetch/token/base/ahora inyectables.
import "server-only";
import { readFileSync } from "node:fs";
import { nombreCapsula, type TipoSujeto, type SujetoMemoria } from "@/lib/memorias/capsulas";
export const URL_CAPSULAS = process.env.STARSEED_MEMVID_URL ?? "http://127.0.0.1:4490"; // servidor Rust local
export const TOPE_PEDIDO_MS = 1500; // 1,5 s por petición y fuera
export interface EstadoCapsula { fotogramas: number; bytes: number; tope: number; queda: number; }
export type AciertoCapsula = { titulo?: string; texto: string; uri?: string; ts?: number };
export type EntradaLinea = { id: number; ts: number; texto: string; uri?: string };
export type OpcionesMemvid = { // inyectables para las pruebas; parte = parte del trimestre (1 la primera)
  fetchImpl?: typeof fetch;
  token?: string;
  base?: string;
  ahora?: Date;
  parte?: number;
};
function comoNum(v: unknown, min = -Infinity): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= min ? n : null;
}
function objetoDe(json: unknown): Record<string, unknown> | null {
  return typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
}
function listaDe(json: unknown, clave: string): Record<string, unknown>[] {
  const lista = objetoDe(json)?.[clave];
  return Array.isArray(lista) ? lista.flatMap(objetoDe).filter((x): x is Record<string, unknown> => x !== null) : [];
}
const cadenaDe = (x: Record<string, unknown>, k: string): string | undefined =>
  typeof x[k] === "string" ? (x[k] as string) : undefined;
/** Forma que admite el servidor: [a-z0-9-] más la T del trimestre («-2026T4»), y .mv2(e). */
export function nombreValido(nombre: string): boolean { return /^[a-z0-9T-]+\.mv2e?$/.test(nombre); }
export function tokenDelDisco(): string { // token del disco (`~/.starseed/memvid.token`); si no está, vacío
  const ruta = process.env.STARSEED_MEMVID_TOKEN ?? `${process.env.HOME ?? ""}/.starseed/memvid.token`;
  try { return readFileSync(ruta, "utf8").trim(); } catch { return ""; }
}
interface RespuestaServidor { status: number; json: unknown }
async function pedir(metodo: "GET" | "POST", ruta: string, cuerpo: unknown, opciones: OpcionesMemvid):
  Promise<RespuestaServidor | null> {
  try {
    const res = await (opciones.fetchImpl ?? fetch)(`${opciones.base ?? URL_CAPSULAS}${ruta}`, {
      method: metodo,
      headers: { "X-StarSeed-Token": opciones.token ?? tokenDelDisco() },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TOPE_PEDIDO_MS),
    });
    let json: unknown;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  } catch { return null; } // servidor caído o tiempo agotado
}
export async function salud(opciones: OpcionesMemvid = {}): Promise<boolean> { // ¿vivo el servidor?
  return (await pedir("GET", "/salud", undefined, opciones))?.status === 200; // caído, false
}
export function acotaK(k: unknown): number { return Math.min(comoNum(k, 1) ?? 5, 50); } // 1…50, por defecto 5
export function estadoDe(json: unknown): EstadoCapsula | null {
  const d = objetoDe(json), f = d ? comoNum(d.frame_count ?? d.fotogramas, 0) : null,
    b = d ? comoNum(d.size_bytes ?? d.bytes, 0) : null, t = d ? comoNum(d.capacity_bytes ?? d.tope, 0) : null;
  return f === null || b === null || t === null
    ? null : { fotogramas: f, bytes: b, tope: t, queda: Math.max(0, t - b) };
}
export function aciertosDe(json: unknown): AciertoCapsula[] {
  return listaDe(json, "aciertos").flatMap((x) => typeof x.texto !== "string" ? [] : [{
    texto: x.texto, titulo: cadenaDe(x, "titulo"), uri: cadenaDe(x, "uri"), ts: comoNum(x.ts) ?? undefined,
  }]);
}
export function lineaDe(json: unknown): EntradaLinea[] {
  return listaDe(json, "linea").flatMap((x) => {
    const id = comoNum(x.frame_id, 0), ts = comoNum(x.timestamp, 0);
    if (id === null || ts === null || typeof x.preview !== "string") return [];
    return [{ id, ts, texto: x.preview, uri: cadenaDe(x, "uri") }]; // id, ts y texto obligatorios
  });
}
export async function estado(nombre: string, op: OpcionesMemvid = {}): Promise<EstadoCapsula | null> {
  if (!nombreValido(nombre)) return null;
  const r = await pedir("GET", `/capsulas/${nombre}/estado`, undefined, op);
  return r?.status === 200 ? estadoDe(r.json) : null;
}
export async function buscar(nombre: string, consulta: string, k: unknown, op: OpcionesMemvid = {}):
  Promise<AciertoCapsula[] | null> {
  if (!nombreValido(nombre) || typeof consulta !== "string" || consulta.trim().length === 0) return null;
  const r = await pedir("POST", `/capsulas/${nombre}/buscar`, { consulta, k: acotaK(k) }, op);
  return r?.status === 200 ? aciertosDe(r.json) : null;
}
export async function linea(nombre: string, desde: number, hasta: number, op: OpcionesMemvid = {}):
  Promise<EntradaLinea[] | null> {
  if (!nombreValido(nombre)) return null;
  const q = new URLSearchParams({ desde: String(desde), hasta: String(hasta) });
  const r = await pedir("GET", `/capsulas/${nombre}/linea?${q}`, undefined, op);
  return r?.status === 200 ? lineaDe(r.json) : null;
}
const TIPOS: readonly TipoSujeto[] =
  ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];
/** «personalidad:aurora» → SujetoMemoria; tipo ajeno o id vacío, null. */
export function sujetoDeCadena(cadena: string): SujetoMemoria | null {
  const m = /^([a-z]+):(.+)$/.exec(cadena.trim()), id = m?.[2].trim();
  return m && id && (TIPOS as readonly string[]).includes(m[1]) ? { tipo: m[1] as TipoSujeto, id } : null;
}
/** Añade un fotograma (el servidor hace el commit). Con 507 —parte llena al tope de 50 MB—
 * abre la parte siguiente del trimestre (`nombreCapsula(…, parte+1)`) y reintenta UNA vez. */
export async function poner(sujeto: SujetoMemoria, texto: string,
  op: OpcionesMemvid & { titulo?: string; uri?: string; etiquetas?: string[]; ts?: number } = {},
): Promise<{ nombre: string; parte: number; frame: number } | null> {
  if (typeof texto !== "string" || texto.trim().length === 0) return null;
  const fecha = op.ahora ?? new Date();
  const cuerpo = { texto, titulo: op.titulo, uri: op.uri, etiquetas: op.etiquetas, ts: op.ts };
  const nombreDe = (p: number): string | null => { // nombreCapsula lanza si la parte no cabe
    try { return nombreCapsula(sujeto, fecha, p); } catch { return null; }
  };
  let parte = op.parte ?? 1;
  let nombre = nombreDe(parte);
  let r = nombre ? await pedir("POST", `/capsulas/${nombre}/poner`, cuerpo, op) : null;
  if (r?.status === 507) {
    const s = nombreDe(parte + 1); // la parte 27 no existe: r sigue siendo 507 → null
    if (s) { nombre = s; parte += 1; r = await pedir("POST", `/capsulas/${nombre}/poner`, cuerpo, op); }
  }
  return r?.status === 200 && nombre
    ? { nombre, parte, frame: comoNum(objetoDe(r.json)?.frame, 0) ?? 0 } : null;
}
