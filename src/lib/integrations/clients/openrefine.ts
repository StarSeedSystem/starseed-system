// ═════════════════════════════════════════════════════════════════════════════
// OpenRefine 3.10.1 — cliente del protocolo de órdenes (INV1025F). VERIFICADO contra el código
// de la etiqueta 3.10.1 (el protocolo NO está versionado: comprueba antes de fijar otro paso).
// GET /command/core/get-csrf-token → {"token":"…"} viaja como parámetro `csrf_token` EN LA QUERY
// de todos los POST; create-project-from-upload multiparte (project-file, project-name, format,
// options) → 302 a /project?project=<id>; apply-operations (forma `operations`, array JSON que
// `Recipe` acepta tal cual) → {"code":"ok"|"pending"}; export-rows (forma `engine`, pide token);
// delete-project → {"code":"ok"}; get-version → version/revision. OpenRefine local no tiene
// autenticación: solo loopback, o pasarela con su token.
// ═════════════════════════════════════════════════════════════════════════════

import { validarReceta } from "../../datos/receta-limpieza";

export type FetchRed = (url: string, init?: RequestInit) => Promise<Response>();

export interface OpcionesOpenRefine {
  /** http://127.0.0.1:3333 por defecto; un host fuera de loopback exige `tokenPasarela`. */
  endpoint?: string;
  /** `fetch` inyectable (pruebas, puerta de datos…); por defecto la global. */
  fetch?: FetchRed;
  /** Tiempo límite por petición, en ms. Por defecto 15 s. */
  tiempoLimiteMs?: number;
  /** Token de la pasarela (variable `STARSEED_PASARELA_OPENREFINE_TOKEN*`). */
  tokenPasarela?: string;
}

export type ResultadoLimpieza = { ok: true; csv: string } | { ok: false; error: string };
export type ResultadoSalud = { ok: true; version: string; revision?: string } | { ok: false; error: string };
export interface LimpiezaEntrada {
  csv: string;
  receta: unknown; // cruda o validada: aquí se valida, que es la única puerta
  formato?: "csv" | "tsv";
}

const PUNTO_DEFECTO = "http://127.0.0.1:3333";
const TIEMPO_LIMITE_MS = 15_000;
const RUTA = "/command/core";
const FORMATO_IMPORTACION = "text/line-based/*sv";

/** ¿El endpoint apunta a un host del propio aparato? Sin pasarela, solo se habla con estos. */
export function esHostLocal(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return (u.protocol === "http:" || u.protocol === "https:") && (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || /^127\./.test(u.hostname) || u.hostname === "::1");
  } catch {
    return false;
  }
}

function conexion(o: OpcionesOpenRefine): { pedir: FetchRed; base: string; ms: number } {
  const base = (o.endpoint?.trim() || PUNTO_DEFECTO).replace(/\/+$/, "");
  if (!esHostLocal(base) && !o.tokenPasarela) {
    throw new Error("OpenRefine solo se habla en loopback (127.0.0.1 o localhost) salvo que la configuración traiga el token de una pasarela.");
  }
  return { pedir: o.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init)), base, ms: o.tiempoLimiteMs ?? TIEMPO_LIMITE_MS };
}

async function pedirConTope(pedir: FetchRed, url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await pedir(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

/** Sin 2xx/3xx lanza; con estado bueno devuelve el texto (JSON de las órdenes o el CSV exportado). */
async function pedirTexto(pedir: FetchRed, url: string, init: RequestInit, ms: number): Promise<string> {
  const r = await pedirConTope(pedir, url, init, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.text();
}

async function pedirJson(pedir: FetchRed, url: string, init: RequestInit, ms: number): Promise<unknown> {
  try { return JSON.parse(await pedirTexto(pedir, url, init, ms)) as unknown; } catch { return null; }
}

type ConToken = { valor: string };

/** Token nuevo: como la interfaz de OpenRefine, se pide antes de cada POST. */
async function tokenNuevo(pedir: FetchRed, base: string, ms: number): Promise<string> {
  const json = (await pedirJson(pedir, `${base}${RUTA}/get-csrf-token`, { method: "GET" }, ms)) as { token?: unknown } | null;
  if (!json || typeof json.token !== "string" || !json.token) throw new Error("get-csrf-token no devolvió un token");
  return json.token;
}

function esFalloCSRF(json: unknown): boolean {
  return json !== null && typeof json === "object" && (json as { code?: unknown }).code === "error" && String((json as { message?: unknown }).message ?? "").toLowerCase().includes("csrf");
}

/** Token en la QUERY + un solo reintento si el servicio pide token nuevo. */
async function postConToken(pedir: FetchRed, base: string, ms: number, token: ConToken, ruta: string, init: RequestInit): Promise<unknown> {
  for (let i = 0; ; i++) {
    const sep = ruta.includes("?") ? "&" : "?";
    const json = await pedirJson(pedir, `${base}${ruta}${sep}csrf_token=${encodeURIComponent(token.valor)}`, init, ms);
    if (!(esFalloCSRF(json) && i === 0)) return json;
    token.valor = await tokenNuevo(pedir, base, ms);
  }
}

/** Id de proyecto desde `Location`/`res.url` (302 de create-project-from-upload) o JSON del cuerpo. */
function idDeProyecto(r: Response, json: unknown): number | null {
  const m = /[?&]project=(\d+)/.exec(r.headers.get("location") ?? r.url);
  if (m) return Number(m[1]);
  const id = json && typeof json === "object" ? (json as { "project-id"?: unknown })["project-id"] : null;
  return typeof id === "number" && id > 0 ? id : null;
}

/** Crea un proyecto temporal desde el CSV (multipart); un reintento si pidió token nuevo. */
async function crearProyecto(pedir: FetchRed, base: string, ms: number, e: LimpiezaEntrada, nombre: string, token: ConToken): Promise<number> {
  const forma = new FormData();
  forma.append("project-file", new Blob([e.csv], { type: "text/csv" }), "datos.csv");
  forma.append("project-name", nombre);
  forma.append("format", FORMATO_IMPORTACION);
  forma.append("options", JSON.stringify({ separator: e.formato === "tsv" ? "\t" : ",", headerLines: 1 }));
  for (let i = 0; ; i++) {
    const url = `${base}${RUTA}/create-project-from-upload?csrf_token=${encodeURIComponent(token.valor)}`;
    const r = await pedirConTope(pedir, url, { method: "POST", body: forma, redirect: "manual" }, ms);
    const id = idDeProyecto(r, await r.json().catch(() => null));
    if (id !== null) return id;
    if (i === 0) token.valor = await tokenNuevo(pedir, base, ms);
    else throw new Error(`create-project-from-upload no devolvió un id (HTTP ${r.status})`);
  }
}

/**
 * CSV (o TSV) limpios: validar receta → token → crear proyecto temporal → aplicar → exportar →
 * BORRAR el proyecto siempre, también si algo falla (no se deja basura en el OpenRefine local).
 */
export async function limpiar(o: OpcionesOpenRefine, entrada: LimpiezaEntrada): Promise<ResultadoLimpieza> {
  const v = validarReceta(entrada.receta);
  if (!v.ok) return { ok: false, error: `Receta rechazada: ${v.errores.join(" · ")}` };
  try {
    const { pedir, base, ms } = conexion(o);
    const token: ConToken = { valor: await tokenNuevo(pedir, base, ms) };
    const id = await crearProyecto(pedir, base, ms, entrada, v.receta.nombre ?? "limpieza", token);
    try {
      const aplicado = await postConToken(pedir, base, ms, token, `/apply-operations?project=${id}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ operations: JSON.stringify(v.receta.operaciones) }),
      });
      const codigo = aplicado && typeof aplicado === "object" ? (aplicado as { code?: unknown }).code : null;
      if (codigo !== "ok" && codigo !== "pending") throw new Error(`apply-operations contestó ${JSON.stringify(aplicado ?? "vacío")}`);
      const url = `${base}${RUTA}/export-rows?project=${id}&format=${entrada.formato === "tsv" ? "tsv" : "csv"}&csrf_token=${encodeURIComponent(token.valor)}`;
      const cuerpo = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ engine: JSON.stringify({ facets: [], mode: "row-based" }) }) };
      return { ok: true, csv: await pedirTexto(pedir, url, cuerpo, ms) };
    } finally {
      await postConToken(pedir, base, ms, token, `/delete-project?project=${id}`, { method: "POST" }).catch(() => undefined);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fallo de limpieza" };
  }
}

/** Salud: get-version, la orden más barata y sin efectos. */
export async function salud(o: OpcionesOpenRefine = {}): Promise<ResultadoSalud> {
  try {
    const { pedir, base, ms } = conexion(o);
    const json = (await pedirJson(pedir, `${base}${RUTA}/get-version`, { method: "GET" }, ms)) as { version?: unknown; revision?: unknown } | null;
    if (!json || typeof json.version !== "string") return { ok: false, error: "get-version sin versión" };
    return { ok: true, version: json.version, revision: typeof json.revision === "string" ? json.revision : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sin conexión" };
  }
}
