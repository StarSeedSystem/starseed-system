// Cliente del servidor local de cápsulas Memvid (MVD1027D, 2026-10-28) — SOLO servidor.
// Contrato: architecture/memvid-capsulas.md §4. Nada del SDK de Node ni de memvid.com:
// el token sale de ~/.starseed/memvid.token y jamás se devuelve. 1,5 s de tope; si el
// servidor no está responde `null` y este módulo nunca lanza hacia quien lo llama.
import "server-only";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { nombreCapsula, type SujetoMemoria } from "@/lib/memorias/capsulas";

export const TOPE_PETICION_MS = 1_500;
export const URL_CAPSULAS = "http://127.0.0.1:4490";
export type Acierto = { titulo: string | null; texto: string; uri: string | null; ts: number | null };
export type Estado = { nombre: string; fotogramas: number; bytes: number; topeBytes: number; quedanBytes: number };
export type Entrada = { frame: number; ts: number; texto: string; uri: string | null };
export type Puesto = { nombre: string; frame: number | null; parte: number };
export type RespuestaCapsulas = { status: number; json: () => Promise<unknown> };
export type FetchCapsulas = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<RespuestaCapsulas>;
export type Opciones = { fecha?: Date; parte?: number; ahora?: () => Date; titulo?: string; uri?: string; etiquetas?: string[]; ts?: number; desde?: number; hasta?: number };
export type DepsClienteMemvid = { token: string | null; baseUrl?: string; fetchImpl?: FetchCapsulas; ahora?: () => Date };

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const aciertosDesde = (v: unknown): Acierto[] => !Array.isArray(v) ? [] : v.flatMap((x) => {
  const d = obj(x), texto = str(d.texto);
  return texto ? [{ titulo: str(d.titulo) || null, texto, uri: str(d.uri) || null, ts: num(d.ts) }] : [];
});
const entradasDesde = (v: unknown): Entrada[] => !Array.isArray(v) ? [] : v.flatMap((x) => {
  const d = obj(x), frame = num(d.frame) ?? num(d.frameId), ts = num(d.ts) ?? num(d.timestamp);
  return frame === null || ts === null ? [] : [{ frame, ts, texto: str(d.texto) || str(d.vistaPrevia) || str(d.preview), uri: str(d.uri) || null }];
});
const estadoDesde = (nombre: string, datos: unknown): Estado | null => {
  const d = obj(datos), bytes = num(d.bytes) ?? num(d.tamanoBytes), tope = num(d.topeBytes) ?? num(d.tope);
  return bytes === null || tope === null ? null : { nombre, fotogramas: num(d.fotogramas) ?? num(d.frames) ?? 0, bytes, topeBytes: tope, quedanBytes: Math.max(0, tope - bytes) };
};

export function crearClienteMemvid(deps: DepsClienteMemvid) {
  const base = (deps.baseUrl ?? URL_CAPSULAS).replace(/\/+$/, "");
  const fetchImpl: FetchCapsulas = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const ahora = deps.ahora ?? (() => new Date());
  const fechaDe = (o: Opciones) => o.fecha ?? (o.ahora ?? ahora)();
  const nombreDe = (s: SujetoMemoria, f: Date, p: number): string | null => {
    try { return nombreCapsula(s, f, p); } catch { return null; }
  };
  async function pedir(ruta: string, metodo: "GET" | "POST", cuerpo?: unknown): Promise<{ estado: number; datos: unknown } | null> {
    if (!deps.token) return null;
    const control = new AbortController(), reloj = setTimeout(() => control.abort(), TOPE_PETICION_MS);
    try {
      const r = await fetchImpl(`${base}${ruta}`, { method: metodo,
        headers: { "X-StarSeed-Token": deps.token, ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: control.signal });
      let datos: unknown = null;
      try { datos = await r.json(); } catch { datos = null; }
      return { estado: r.status, datos };
    } catch { return null; } finally { clearTimeout(reloj); }
  }
  async function estado(s: SujetoMemoria, o: Opciones = {}): Promise<Estado | null> {
    const nombre = nombreDe(s, fechaDe(o), o.parte ?? 1);
    if (!nombre) return null;
    const r = await pedir(`/capsulas/${nombre}/estado`, "GET");
    return r && r.estado >= 200 && r.estado < 300 ? estadoDesde(nombre, r.datos) : null;
  }
  async function poner(s: SujetoMemoria, texto: string, o: Opciones = {}): Promise<Puesto | null> {
    const limpio = texto.trim(), fecha = fechaDe(o), desde = o.parte ?? 1;
    if (!limpio) return null;
    const cuerpo = { texto: limpio, ...(o.titulo ? { titulo: o.titulo } : {}), ...(o.uri ? { uri: o.uri } : {}),
      ...(o.etiquetas ? { etiquetas: o.etiquetas } : {}), ...(o.ts !== undefined ? { ts: o.ts } : {}) };
    for (let parte = desde; parte <= Math.min(desde + 1, 26); parte++) {
      const nombre = nombreDe(s, fecha, parte);
      if (!nombre) return null;
      const r = await pedir(`/capsulas/${nombre}/poner`, "POST", cuerpo);
      if (!r) return null;
      if (r.estado >= 200 && r.estado < 300) return { nombre, frame: num(obj(r.datos).frame), parte };
      if (r.estado !== 507) return null;
    }
    return null;
  }
  async function buscar(s: SujetoMemoria, consulta: string, k = 5, o: Opciones = {}): Promise<Acierto[] | null> {
    const q = consulta.trim(), tope = Math.max(1, Math.min(50, Math.trunc(k))), fecha = fechaDe(o), desde = o.parte ?? 1, salida: Acierto[] = [];
    if (!q) return null;
    for (let parte = desde; parte >= 1 && salida.length < tope; parte--) {
      const nombre = nombreDe(s, fecha, parte);
      if (!nombre) return salida.length ? salida : null;
      const r = await pedir(`/capsulas/${nombre}/buscar`, "POST", { consulta: q, k: tope - salida.length });
      if (!r) return salida.length ? salida : null;
      if (r.estado === 404) continue;
      if (r.estado < 200 || r.estado >= 300) return salida.length ? salida : null;
      salida.push(...aciertosDesde(obj(r.datos).aciertos));
    }
    return salida.slice(0, tope);
  }
  async function linea(s: SujetoMemoria, o: Opciones = {}): Promise<Entrada[] | null> {
    const nombre = nombreDe(s, fechaDe(o), o.parte ?? 1);
    if (!nombre) return null;
    const qs = new URLSearchParams();
    if (o.desde !== undefined) qs.set("desde", String(o.desde));
    if (o.hasta !== undefined) qs.set("hasta", String(o.hasta));
    const cola = qs.toString(), r = await pedir(`/capsulas/${nombre}/linea${cola ? `?${cola}` : ""}`, "GET");
    return r && r.estado >= 200 && r.estado < 300 ? entradasDesde(obj(r.datos).linea ?? r.datos) : null;
  }

  async function salud(): Promise<boolean> {
    const r = await pedir("/salud", "GET");
    return !!r && r.estado >= 200 && r.estado < 300;
  }
  return { poner, buscar, estado, linea, salud };
}

export type ClienteMemvid = ReturnType<typeof crearClienteMemvid>;

/** Lee el token del llavero de la neurona; si no existe, el cliente queda apagado (null). */
export function tokenDelServidor(): string | null {
  try { return readFileSync(path.join(homedir(), ".starseed", "memvid.token"), "utf8").trim() || null; } catch { return null; }
}

/** Cliente por defecto: token del llavero y servidor local de cápsulas. */
export function clienteMemvid(): ClienteMemvid {
  return crearClienteMemvid({ token: tokenDelServidor() });
}
