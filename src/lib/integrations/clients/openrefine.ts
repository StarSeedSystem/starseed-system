// ════════════════════════════════════════════════════════════════
// OpenRefine 3.10.1 — cliente de limpieza (INV1025F · §3.4 del contrato)
// ----------------------------------------------------------------
// Protocolo verificado contra el código del tag 3.10.1 (no versionado):
//   • CSRF: GET /command/core/get-csrf-token → {"token": …}; los POST lo
//     exigen como PARÁMETRO «csrf_token» (Command.java), en la consulta.
//   • Crear: POST multipart create-project-from-upload (project-file,
//     project-name, format, options) → REDIRECCIÓN /project?project=<id>
//     (CreateProjectCommand.java): id de «Location», redirect: "manual".
//   • Aplicar: POST apply-operations?project=<id> con `operations` (JSON);
//     responde {"code":"ok"} o JSON de error.
//   • Exportar: POST export-rows (project, format, engine) → texto.
//   • Borrar: POST delete-project?project=<id> → {"code":"ok"}.
// Sin autenticación: solo loopback salvo apiKey (pasarela). Fetch, tiempo
// límite y reloj inyectables; puro: sin node:*.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta, type RecetaLimpieza } from "../../datos/receta-limpieza";

/** URL base por defecto: el script `refine` levanta el servicio aquí. */
export const PUNTO_DEFECTO = "http://127.0.0.1:3333";

/** Firma de fetch inyectable (global o servidor falso de pruebas). */
export type Fetching = (url: string, init?: RequestInit) => Promise<Response>;

/** Fetch + reloj inyectables para health. */
export interface OpcionesSalud extends Pick<EntradaLimpieza, "fetch" | "tiempoLimiteMs"> {
  endpoint?: string;
}

/** Tabla a limpiar + receta ya validada; la salida sale en csv. */
export interface EntradaLimpieza {
  csv: string;
  /** Receta válida de src/lib/datos/receta-limpieza: se revalida aquí. */
  receta: RecetaLimpieza;
 .argsort;

export interface EntradaLimpieza {
  /** Tabla de entrada en csv (o tsv según `formato`); la salida sale en csv. */
  csv: string;
  /** Receta válida de src/lib/datos/receta-limpieza: se revalida aquí. */
  receta: RecetaLimpieza;
  formato?: "csv" | "tsv";
  fetch?: Fetching;
  tiempoLimiteMs?: number;
}

export interface ResultadoLimpieza {
  csv: string;
  formato: string;
}

export interface VersionAbierta {
  version: string | null;
  completa: string | null;
  java: string | null;
}

// ── Auxiliares puros ─────────────────────────────────────────────

/** Loopback de verdad: localhost, ::1, *.localhost o el rango 127/8. */
export function esHostLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "::1" || host.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(host);
  } catch {
    return false; // URL inválida no es loopback
  }
}

/** Resuelve la base y la guarda: sin pasarela (apiKey) solo loopback. */
function resolverBase(cfg: IntegrationConfig, extra?: OpcionesSalud): string {
  const base = cfg.endpoint || extra?.endpoint || PUNTO_DEFECTO;
  if (!esHostLocal(base) && !cfg.apiKey) {
    throw new Error(
      "OpenRefine corre en loopback y sin autenticación: no se habla con un host remoto si la configuración no trae el token de una pasarela (apiKey).",
    );
  }
  return base.replace(/\/+$/, "");
}

/** Construye <base>/command/core/<orden>?... con los parámetros dados. */
function ruta(base: string, orden: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra).toString();
  return `${base}/command/core/${orden}${q ? `?${q}` : ""}`;
}

/** Parsea el JSON de una respuesta; null si el cuerpo no es JSON. */
async function leerJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Auxiliares del flujo ─────────────────────────────────────────

const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : "Error desconocido de OpenRefine.");

/** RequestInit con la señal de aborto; el reloj es el tiempo límite. */
function conSenal(ms?: number): RequestInit {
  if (!ms) return {};
  const control = new AbortController();
  setTimeout(() => control.abort(), ms);
  return { signal: control.signal };
}

/** POST uniforme: multipart (crear) o form-urlencoded (aplicar/exportar/borrar). */
async function enviar(pido: Fetching, senal: RequestInit, url: string, forma?: FormData, cuerpo?: string): Promise<Response> {
  return pido(
    url,
    forma
      ? { ...senal, method: "POST", body: forma, redirect: "manual" }
      : { ...senal, method: "POST", body: cuerpo, headers: { "content-type": "application/x-www-form-urlencoded" } },
  );
}

/** Id del proyecto: «Location» de la redirección de crear, o JSON {project}. */
async function idDeCreacion(res: Response, base: string): Promise<string | null> {
  try {
    const loc = res.headers.get("location");
    const deLocation = loc ? new URL(loc, base).searchParams.get("project") : null;
    if (deLocation) return deLocation;
  } catch {
    /* Location inválida: probamos el cuerpo */
  }
  const j = await leerJson(res);
  const v = j?.project ?? j?.project_id;
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

/** Borrar SIEMPRE el proyecto temporal, también si la limpieza falló. */
async function borrarProyecto(pido: Fetching, base: string, id: string, token: string, senal: RequestInit): Promise<void> {
  try {
    await pido(ruta(base, "delete-project", { project: id, csrf_token: token }), { ...senal, method: "POST" });
  } catch {
    /* con el servicio caído no hay nada más a mano: el proyecto muere con él */
  }
}

/** Versión: GET /command/core/get-version → {version, full_version, java…}. */
export async function health(cfg: IntegrationConfig, extra: OpcionesSalud = {}): Promise<IntegrationResult<VersionAbierta>> {
  try {
    const base = resolverBase(cfg, extra);
    const pido = extra.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
    const res = await pido(ruta(base, "get-version"), conSenal(extra.tiempoLimiteMs));
    const j = await leerJson(res);
    const data: VersionAbierta = {
      version: typeof j?.version === "string" ? j.version : null,
      completa: typeof j?.full_version === "string" ? j.full_version : null,
      java: typeof j?.java_runtime_version === "string" ? j.java_runtime_version : null,
    };
    return { ok: res.ok, data, error: res.ok ? undefined : `OpenRefine no responde (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, error: mensajeDe(e) };
  }
}

/** Limpieza completa: token → crear → aplicar → exportar → borrar SIEMPRE. */
export async function limpiar(cfg: IntegrationConfig, entrada: EntradaLimpieza): Promise<IntegrationResult<ResultadoLimpieza>> {
  if (cfg.enabled === false) return { ok: false, error: "La integración de OpenRefine está deshabilitada." };
  const v = validarReceta(entrada.receta);
  if (!v.ok) return { ok: false, error: `La receta no pasa la lista blanca: ${(v.errores ?? []).join(" · ")}` };
  if (typeof entrada.csv !== "string" || !entrada.csv.trim()) return { ok: false, error: "Falta la tabla csv a limpiar." };
  try {
    const base = resolverBase(cfg, entrada);
    const pido = entrada.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
    // Un solo tiempo límite para TODO el flujo, no por petición.
    const control = new AbortController();
    const reloj = entrada.tiempoLimiteMs ? setTimeout(() => control.abort(), entrada.tiempoLimiteMs) : null;
    const senal: RequestInit = { signal: control.signal };
    const formato = entrada.formato === "tsv" ? "tsv" : "csv";
    let id: string | null = null;
    try {
      // 1) Token CSRF (los POST lo exigen como parámetro de la petición).
      const resToken = await pido(ruta(base, "get-csrf-token"), senal);
      if (!resToken.ok) return { ok: false, error: `OpenRefine no entregó token CSRF (HTTP ${resToken.status}).` };
      const token = (await leerJson(resToken))?.token;
      if (typeof token !== "string") return { ok: false, error: "OpenRefine no entregó token CSRF." };
      // 2) Crear proyecto: multipart y redirect "manual" a /project?project=<id>.
      const forma = new FormData();
      forma.append("project-file", new Blob([entrada.csv], { type: "text/csv" }), "datos.csv");
      forma.append("project-name", "limpieza-starseed");
      forma.append("format", "text/line-based/*sv");
      forma.append("options", JSON.stringify(formato === "tsv" ? { separator: "\t" } : { separator: "," }));
      const resCrear = await enviar(pido, senal, ruta(base, "create-project-from-upload", { csrf_token: token }), forma);
      id = await idDeCreacion(resCrear, base);
      if (!id) return { ok: false, error: "OpenRefine no devolvió el id del proyecto creado." };
      // 3) Aplicar la receta; 4) exportar; el finally borra SIEMPRE el proyecto.
      try {
        const operations = new URLSearchParams({ operations: JSON.stringify(v.receta?.operaciones ?? []) }).toString();
        const resAplicar = await enviar(pido, senal, ruta(base, "apply-operations", { project: id, csrf_token: token }), undefined, operations);
        if (!resAplicar.ok || (await leerJson(resAplicar))?.code !== "ok") {
          return { ok: false, error: `OpenRefine rechazó la receta: HTTP ${resAplicar.status} o código de error al aplicarla.` };
        }
        const datos = new URLSearchParams({ format: formato, engine: JSON.stringify({ mode: "row-based", facets: [] }) }).toString();
        const resExport = await enviar(pido, senal, ruta(base, "export-rows", { project: id, csrf_token: token }), undefined, datos);
        if (!resExport.ok) return { ok: false, error: `OpenRefine no exportó: HTTP ${resExport.status}.` };
        return { ok: true, data: { csv: await resExport.text(), formato } };
      } finally {
        await borrarProyecto(pido, base, id, token, senal);
      }
    } finally {
      if (reloj !== null) clearTimeout(reloj);
    }
  } catch (e) {
    return { ok: false, error: mensajeDe(e) };
  }
}
