import "server-only";
/** Cliente TS del servidor de cápsulas Memvid (MVD1027D, 2026-10-27) — SOLO servidor:
 * el token se lee con `node:fs` y jamás sale en un log; habla con `native/memvid-servidor`
 * en 127.0.0.1:4490 con 1,5 s de tope y `null` si el servidor no está: nunca lanza
 * (contrato: architecture/memvid-capsulas.md §4). 507 en «poner» → parte siguiente. */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { nombreCapsula, type SujetoMemoria, type TipoSujeto } from "./capsulas";

export const MEMVID_URL = "http://127.0.0.1:4490";
export const TOPE_MEMVID_MS = 1500;

/** Para prueba: `fetchImpl` y `token` dejan meter un fetch falso sin tocar el disco. */
export interface OpcionesCliente { fetchImpl?: typeof fetch; token?: string; }
export interface EstadoCapsula { fotogramas: number; bytes: number; tope: number; libre: number; }
export interface AciertoCapsula { titulo?: string; texto: string; uri?: string; ts?: number; }
export interface EntradaLinea { ts?: number; texto: string; titulo?: string; uri?: string; }
export interface ResultadoPoner { ok: true; nombre: string; parte: number; rotada: boolean; }

const TIPOS: readonly TipoSujeto[] = ["perfil", "personalidad", "agente", "bot", "pagina", "grupo", "comunidad", "cerebro", "capa"];

/** «pagina:abc» → sujeto; lo que no encaje, null. La ruta lo comparte. */
export function parsearSujeto(valor: string | null | undefined): SujetoMemoria | null {
  if (!valor) return null;
  const i = valor.indexOf(":");
  const tipo = i > 0 ? (valor.slice(0, i) as TipoSujeto) : null, id = i > 0 ? valor.slice(i + 1) : "";
  return tipo && TIPOS.includes(tipo) && id.trim() ? { tipo, id } : null;
}

/** Nombre seguro para la URL: el criterio del servidor, con el trimestre
 * «AAAATr» que sale del contrato (p. ej. «pagina-cafe-1-2026T4.mv2»). */
function sanearNombre(nombre: string): string | null {
  return /^[a-z0-9-]+(-\d{4}T[1-4][a-z]?)?\.mv2e?$/.test(nombre) && !nombre.includes("..") ? nombre : null;
}

/** JSON de una respuesta buena; 4xx/5xx, cuerpo roto o sin servidor → null. */
async function jsonDe<T>(r: Response | null): Promise<T | null> {
  if (!r || !r.ok) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

/** Token de la neurona (`~/.starseed/memvid.token`, 0600). Si no está, null. */
async function tokenLocal(): Promise<string | null> {
  try {
    const ruta = path.join(homedir(), ".starseed", "memvid.token");
    return (await readFile(ruta, "utf8")).trim() || null;
  } catch { return null; }
}

/** Una llamada al servidor: con token, 1,5 s de tope y sin lanzar nada. */
async function peticion(ruta: string, opciones: OpcionesCliente, init?: RequestInit): Promise<Response | null> {
  const token = opciones.token ?? (await tokenLocal());
  if (!token) return null;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TOPE_MEMVID_MS);
  try {
    return await (opciones.fetchImpl ?? fetch)(`${MEMVID_URL}${ruta}`, {
      ...init,
      cache: "no-store",
      signal: control.signal,
      headers: { "X-StarSeed-Token": token, ...(init?.headers ?? {}) },
    });
  } catch { return null; } finally { clearTimeout(reloj); }
}

/** ¿Está vivo el servidor? null es «no sé» (sin token o sin respuesta), no «no». */
export async function salud(opciones: OpcionesCliente = {}): Promise<boolean | null> {
  const r = await peticion("/salud", opciones); return r ? r.ok : null;
}

/** Fotogramas, tamaño, tope y cuánto queda de una cápsula. */
export async function estado(nombre: string, opciones: OpcionesCliente = {}): Promise<EstadoCapsula | null> {
  const n = sanearNombre(nombre);
  return n ? jsonDe<EstadoCapsula>(await peticion(`/capsulas/${n}/estado`, opciones)) : null;
}

/** La línea del tiempo, acotada por `desde`/`hasta` opcionales. */
export async function linea(nombre: string, desde?: number, hasta?: number, opciones: OpcionesCliente = {}): Promise<EntradaLinea[] | null> {
  const n = sanearNombre(nombre);
  if (!n) return null;
  const cola = [desde !== undefined && `desde=${desde}`, hasta !== undefined && `hasta=${hasta}`]
    .filter(Boolean).join("&");
  const r = await jsonDe<{ linea: EntradaLinea[] }>(await peticion(`/capsulas/${n}/linea${cola ? `?${cola}` : ""}`, opciones));
  return r?.linea ?? null;
}

/** Búsqueda por texto: los `k` mejores aciertos de la cápsula. */
export async function buscar(nombre: string, consulta: string, k: number, opciones: OpcionesCliente = {}): Promise<AciertoCapsula[] | null> {
  const n = sanearNombre(nombre);
  if (!n || !consulta.trim()) return null;
  const r = await jsonDe<{ aciertos: AciertoCapsula[] }>(await peticion(`/capsulas/${n}/buscar`, opciones, { method: "POST", body: JSON.stringify({ consulta, k }) }));
  return r?.aciertos ?? null;
}

/** Añade un recuerdo a la cápsula del trimestre en curso del sujeto. Con 507
 * (cápsula llena) abre la parte siguiente con `nombreCapsula(…, parte+1)` y
 * reintenta una vez; nunca lanza aunque el sujeto no sirva. */
export async function poner(sujeto: SujetoMemoria, texto: string, opciones: OpcionesCliente = {}): Promise<ResultadoPoner | null> {
  if (!texto.trim()) return null;
  const fecha = new Date();
  try {
    let parte = 1;
    for (let intento = 0; intento < 2; intento++) {
      const nombre = sanearNombre(nombreCapsula(sujeto, fecha, parte));
      if (!nombre) return null;
      const r = await peticion(`/capsulas/${nombre}/poner`, opciones, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      if (!r) return null;
      if (r.status === 507) { parte += 1; continue; }
      if (!r.ok) return null;
      const cuerpo = (await r.json().catch(() => null)) as { frame?: { id?: number } } | null;
      return cuerpo ? { ok: true, nombre, parte, rotada: parte > 1 } : null;
    }
  } catch { return null; }
  return null;
}

