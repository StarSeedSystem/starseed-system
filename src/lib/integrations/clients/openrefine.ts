/**
 * Cliente de la interfaz de órdenes de OpenRefine 3.10.1 (INV1025F · architecture/repos-libreria-1025.md §3.4).
 *
 * «limpiar» = token CSRF → crear proyecto (multipart) → aplicar receta → exportar → BORRAR el
 * proyecto provisional SIEMPRE, también si algo falla. Órdenes en /command/core/… con su
 * `csrf_token` (GetCSRFTokenCommand de la 3.10); el protocolo no está versionado: verifica cada
 * ruta contra el código de la 3.10 si OpenRefine cambia. Corre SIN autenticación en 127.0.0.1:3333:
 * se niega a hablar con un host que no sea loopback salvo que la configuración traiga el token de
 * una pasarela (apiKey → Authorization). Receta y límites: src/lib/datos/receta-limpieza.ts.
 * `fetch` inyectable y tiempo límite; sin `node:*`.
 */

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta } from "../../datos/receta-limpieza";

export const ENDPOINT_DEFECTO = "http://127.0.0.1:3333";
const TIEMPO_DEFECTO = 30_000;

/** Rutas de la interfaz de órdenes de la 3.10 (verificar contra el código de la 3.10 si cambia). */
const RUTA = {
  token: "/command/core/get-csrf-token",
  crear: "/command/core/create-project-from-upload",
  aplicar: "/command/core/apply-operations",
  exportar: "/command/core/export-rows",
  borrar: "/command/core/delete-project",
  version: "/command/core/get-version",
} as const;

/** `fetch` inyectable para las pruebas con servidor falso. */
export type ClienteFetch = typeof fetch;

export interface OpcionesCliente {
  fetch?: ClienteFetch;
  /** Tiempo límite por llamada, en ms. */
  timeoutMs?: number;
}

export interface PeticionLimpieza {
  csv: string;
  receta: unknown;
  /** Formato de importación y exportación; «csv» por defecto. */
  formato?: string;
}

const MOTOR_JSON = JSON.stringify({ facets: [], mode: "row-based" });
const OPCIONES_CSV = JSON.stringify({ separator: "," });

function esHostSeguro(u: URL): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(u.hostname.toLowerCase());
}

interface Conexión {
  base: string;
  hacer: ClienteFetch;
  tiempo: number;
  pasarela?: string;
}

/** Verifica el endpoint (solo loopback, salvo token de pasarela) y arma la conexión. */
function conexión(
  cfg: IntegrationConfig,
  o: OpcionesCliente,
): { ok: true; con: Conexión } | { ok: false; error: string } {
  const base = (cfg.endpoint || ENDPOINT_DEFECTO).trim().replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return { ok: false, error: "endpoint no válido" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "el endpoint debe ser http(s)" };
  }
  if (!esHostSeguro(u) && !cfg.apiKey) {
    return { ok: false, error: "OpenRefine local corre sin autenticación: solo loopback, salvo token de pasarela" };
  }
  return {
    ok: true,
    con: { base, hacer: o.fetch ?? globalThis.fetch, tiempo: o.timeoutMs ?? TIEMPO_DEFECTO, pasarela: cfg.apiKey },
  };
}

/** Llama con tiempo límite y, si hay pasarela, su Authorization. Nunca lanza por red: hace throw legible. */
async function respuesta(c: Conexión, ruta: string, init: RequestInit): Promise<Response> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), c.tiempo);
  try {
    const cabeceras = new Headers(init.headers);
    if (c.pasarela) cabeceras.set("Authorization", `Bearer ${c.pasarela}`);
    return await c.hacer(ruta, { ...init, headers: cabeceras, signal: control.signal });
  } catch (e) {
    const límite = e instanceof Error && e.name === "AbortError";
    throw new Error(
      límite ? "tiempo límite agotado hablando con OpenRefine"
        : e instanceof Error ? e.message
        : "fallo de red con OpenRefine",
    );
  } finally {
    clearTimeout(reloj);
  }
}

/** Salud: GET get-version (la versión que reporta el servicio). */
export async function health(cfg: IntegrationConfig, o: OpcionesCliente = {}): Promise<IntegrationResult> {
  const c = conexión(cfg, o);
  if (!c.ok) return { ok: false, error: c.error };
  try {
    const res = await respuesta(c.con, c.con.base + RUTA.version, { method: "GET" });
    if (!res.ok) return { ok: false, error: `OpenRefine respondió HTTP ${res.status}` };
    const datos = (await res.json()) as { version?: unknown };
    return { ok: true, data: { version: typeof datos.version === "string" ? datos.version : null } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "no se pudo leer la versión" };
  }
}

/** CSV + receta validada → CSV limpio; borra el proyecto provisional siempre. */
export async function limpiar(
  cfg: IntegrationConfig,
  petición: PeticionLimpieza,
  o: OpcionesCliente = {},
): Promise<IntegrationResult> {
  const c = conexión(cfg, o);
  if (!c.ok) return { ok: false, error: c.error };
  const veredicto = validarReceta(petición.receta);
  if (!veredicto.ok) {
    return { ok: false, error: `receta rechazada: ${(veredicto.errores ?? []).join(" · ")}` };
  }
  const formato = petición.formato?.trim() || "csv";
  const operaciones = JSON.stringify(veredicto.receta?.operaciones ?? []);
  try {
    const con = c.con;
    const rToken = await respuesta(con, con.base + RUTA.token, { method: "GET" });
    const t = (await rToken.json()) as { token?: unknown };
    const token = typeof t.token === "string" ? t.token : "";
    if (!token) throw new Error("OpenRefine no entregó token CSRF");

    const fd = new FormData();
    fd.append("csrf_token", token);
    fd.append("project-file", new Blob([petición.csv], { type: "text/csv" }), "datos.csv");
    fd.append("project-name", "starseed-limpieza");
    fd.append("format", formato);
    fd.append("options", OPCIONES_CSV);
    const rCrear = await respuesta(con, con.base + RUTA.crear, { method: "POST", body: fd });
    const creado = (await rCrear.json()) as { status?: unknown; projectId?: unknown; message?: unknown };
    const proyectoOk = typeof creado.projectId === "number" || typeof creado.projectId === "string";
    if (creado.status !== "ok" || !proyectoOk) {
      throw new Error(typeof creado.message === "string" ? creado.message : "no se pudo crear el proyecto provisional");
    }
    const proyecto = String(creado.projectId);
    try {
      const cuerpo = new URLSearchParams({ project: proyecto, csrf_token: token, operations: operaciones });
      const rAplicar = await respuesta(con, `${con.base}${RUTA.aplicar}?project=${encodeURIComponent(proyecto)}`, {
        method: "POST",
        body: cuerpo,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const aplicado = (await rAplicar.json()) as { code?: unknown; message?: unknown };
      if (aplicado.code !== "ok") {
        throw new Error(typeof aplicado.message === "string" ? aplicado.message : "OpenRefine no aceptó la receta");
      }
      const fdSalida = new FormData();
      fdSalida.append("csrf_token", token);
      fdSalida.append("project", proyecto);
      fdSalida.append("format", formato);
      fdSalida.append("engine", MOTOR_JSON);
      const rExport = await respuesta(con, con.base + RUTA.exportar, { method: "POST", body: fdSalida });
      if (!rExport.ok) throw new Error(`la exportación respondió HTTP ${rExport.status}`);
      const csv = await rExport.text();
      return { ok: true, data: { csv, formato } };
    } finally {
      const fdBorrar = new FormData();
      fdBorrar.append("csrf_token", token);
      fdBorrar.append("project", proyecto);
      await respuesta(con, con.base + RUTA.borrar, { method: "POST", body: fdBorrar }).catch(() => undefined);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "la limpieza falló" };
  }
}
