// Cliente del servidor de cápsulas Memvid (MVD1027D) — SOLO DE SERVIDOR: usa node:fs para
// leer el token del llavero de la neurona (`~/.starseed/memvid.token`), según
// architecture/memvid-capsulas.md §4. Nunca lanza: sin servidor o > 1,5 s vale null; un 507
// abre la parte siguiente con `capsulaDe(…, parte + 1)` y reintenta una sola vez.
import "server-only";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { capsulaDe, type SujetoMemoria, type TipoSujeto } from "./capsulas";

export const BASE_MEMVID = "http://127.0.0.1:4490";
export const TOPE_PETICION_MS = 1500;
export const RE_NOMBRE_CAPSULA = /^[a-z0-9-]+\.mv2e?$/; // como el servidor: sin `/` ni `..`
export const TIPOS_SUJETO: readonly TipoSujeto[] = ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];
export interface AciertoMemvid { titulo: string; texto: string; uri?: string; ts?: number }
export interface EstadoCapsula { fotogramas: number; bytes: number; topeBytes: number; quedaBytes: number }
export interface EntradaLinea { ts?: number; texto: string; uri?: string }
export interface ResultadoPoner { nombre: string; frame: number }
/** `token` y `fetch` existen solo para las pruebas; en vivo el token sale del disco. */
export interface OpcionesCliente { fetch?: typeof fetch; base?: string; token?: string }
/** «personalidad:aurora» → sujeto; null si el tipo no existe o el id queda vacío. */
export function sujetoDeParametro(valor: string | null | undefined): SujetoMemoria | null {
  const [tipo, id] = (valor ?? "").split(":");
  return TIPOS_SUJETO.includes(tipo as TipoSujeto) && id && id.trim().length > 0
    ? { tipo: tipo as TipoSujeto, id, grupoId: undefined } : null;
}
export function urlDe(nombre: string, ruta: string, base: string = BASE_MEMVID): string | null {
  if (!RE_NOMBRE_CAPSULA.test(nombre) || ruta.includes("/") || ruta.startsWith(".")) return null;
  return `${base.replace(/\/+$/, "")}/capsulas/${nombre}/${ruta}`;
}
/** Token del llavero de la neurona (0600); null si falta o no se puede leer. */
export async function leerToken(token?: string): Promise<string | null> {
  if (token !== undefined) return token;
  try {
    const leido = (await readFile(path.join(homedir(), ".starseed", "memvid.token"), "utf-8")).trim();
    return leido.length > 0 ? leido : null;
  } catch { return null; }
}
interface Respuesta { status: number; data: unknown }
async function pedir(url: string, metodo: "GET" | "POST", cuerpo: unknown, opciones: OpcionesCliente): Promise<Respuesta | null> {
  const token = await leerToken(opciones.token);
  if (!token) return null;
  const ctrl = new AbortController();
  const temporizador = setTimeout(() => ctrl.abort(), TOPE_PETICION_MS);
  try {
    const res = await (opciones.fetch ?? fetch)(url, {
      method: metodo, headers: { "X-StarSeed-Token": token, ...(cuerpo ? { "content-type": "application/json" } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: ctrl.signal, cache: "no-store",
    });
    const data = res.status < 400 ? ((await res.json().catch(() => null)) as unknown) : null;
    return { status: res.status, data };
  } catch { return null; } finally { clearTimeout(temporizador); }
}
/** Pide a la cápsula del trimestre; un sujeto mal formado también vale null. */
async function pedirCapsula(sujeto: SujetoMemoria, fecha: Date, ruta: string, metodo: "GET" | "POST", cuerpo: unknown, opciones: OpcionesCliente): Promise<Respuesta | null> {
  try { return await pedir(urlDe(capsulaDe(sujeto, fecha).nombre, ruta, opciones.base ?? BASE_MEMVID) ?? "", metodo, cuerpo, opciones); }
  catch { return null; }
}
/** Añade texto y hace commit; si la cápsula quedó llena (507) abre la parte siguiente. */
export async function poner(sujeto: SujetoMemoria, texto: string, fecha: Date = new Date(), opciones: OpcionesCliente = {}): Promise<ResultadoPoner | null> {
  let parte = 1;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const capsula = capsulaDe(sujeto, fecha, parte);
      const r = await pedir(urlDe(capsula.nombre, "poner", opciones.base ?? BASE_MEMVID) ?? "", "POST", { texto }, opciones);
      if (r && r.status === 507 && parte === 1) { parte += 1; continue; }
      const datos = r && r.status < 400 ? (r.data as { frame?: unknown } | null) : null;
      if (datos && typeof datos.frame === "number") return { nombre: capsula.nombre, frame: datos.frame };
      return null;
    } catch { return null; }
  }
  return null;
}
/** Busca en la cápsula del trimestre y devuelve hasta `k` aciertos; null sin servidor. */
export async function buscar(sujeto: SujetoMemoria, consulta: string, k = 5, fecha: Date = new Date(), opciones: OpcionesCliente = {}): Promise<AciertoMemvid[] | null> {
  const r = await pedirCapsula(sujeto, fecha, "buscar", "POST", { consulta, k }, opciones);
  const aciertos = (r?.data as { aciertos?: unknown } | null | undefined)?.aciertos;
  return r && r.status < 400 && Array.isArray(aciertos) ? (aciertos as AciertoMemvid[]) : null;
}
/** Fotogramas, bytes y cuánto queda de la cápsula del trimestre; null sin servidor. */
export async function estado(sujeto: SujetoMemoria, fecha: Date = new Date(), opciones: OpcionesCliente = {}): Promise<EstadoCapsula | null> {
  const r = await pedirCapsula(sujeto, fecha, "estado", "GET", undefined, opciones);
  return r && r.status < 400 ? estadoDe(r.data) : null;
}
/** La línea del tiempo de la cápsula del trimestre; null sin servidor. */
export async function linea(sujeto: SujetoMemoria, desde?: number, hasta?: number, fecha: Date = new Date(), opciones: OpcionesCliente = {}): Promise<EntradaLinea[] | null> {
  const etapa = (v: number | undefined, nombre: string) => (v !== undefined ? `${nombre}=${v}` : null);
  const q = [etapa(desde, "desde"), etapa(hasta, "hasta")].filter((v): v is string => v !== null).join("&");
  const r = await pedirCapsula(sujeto, fecha, `linea${q.length > 0 ? `?${q}` : ""}`, "GET", undefined, opciones);
  return r && r.status < 400 ? lineaDe(r.data) : null;
}
/** ¿Está vivo el servidor de cápsulas de esta neurona? */
export async function salud(opciones: OpcionesCliente = {}): Promise<boolean> {
  const r = await pedir(`${(opciones.base ?? BASE_MEMVID).replace(/\/+$/, "")}/salud`, "GET", undefined, opciones);
  return r?.status !== undefined && r.status < 400;
}
/** Comprueba el JSON de `/estado`: números mínimos y cuánto queda antes del giro. */
function estadoDe(json: unknown): EstadoCapsula | null {
  const d = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const bytes = n(d.bytes ?? d.size_bytes);
  const tope = n(d.topeBytes ?? d.capacity_bytes);
  const fotogramas = n(d.fotogramas ?? d.frame_count);
  if (bytes === null || tope === null || fotogramas === null) return null;
  return { fotogramas, bytes, topeBytes: tope, quedaBytes: Math.max(0, tope - bytes) };
}
/** Traduce el JSON de `/linea` (`texto` o `preview`) a entradas limpias o null. */
function lineaDe(json: unknown): EntradaLinea[] | null {
  const entradas = typeof json === "object" && json !== null ? (json as Record<string, unknown>).entradas : null;
  if (!Array.isArray(entradas)) return null;
  return entradas.flatMap((e) => {
    const d = e as { ts?: unknown; texto?: unknown; preview?: unknown; uri?: unknown };
    const texto = typeof d.texto === "string" ? d.texto : typeof d.preview === "string" ? d.preview : "";
    return texto ? [{
      ts: typeof d.ts === "number" ? d.ts : undefined, texto,
      uri: typeof d.uri === "string" && d.uri.length > 0 ? d.uri : undefined,
    }] : [];
  });
}
