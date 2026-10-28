// ════════════════════════════════════════════════════════════════
// OpenRefine 3.10.1 — cliente de su interfaz de órdenes (INV1025F)
// ----------------------------------------------------------------
// Limpia un CSV con una receta validada: token CSRF → crear proyecto →
// aplicar operaciones → exportar → BORRAR el proyecto, también si algo falla.
// Rutas verificadas contra el código de la 3.10.1 (controller.js):
//   get-csrf-token · create-project-from-upload · apply-operations ·
//   export-rows/<fichero>.csv · delete-project · get-version
// El servicio local corre sin autenticación en 127.0.0.1:3333: este cliente
// solo habla con loopback salvo que la configuración traiga el token de una
// pasarela (R3, R10). Sin `node:*`; fetch y reloj se inyectan.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { validarReceta } from "@/lib/datos/receta-limpieza";

export const ENDPOINT_POR_DEFECTO = "http://127.0.0.1:3333";
export const TIMEOUT_POR_DEFECTO_MS = 30_000;

export type FormatoLimpieza = "csv" | "tsv";
export type FetchInyectable = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpcionesRed {
    /** `fetch` inyectable (pruebas o proxy propio); por defecto el global. */
    fetch?: FetchInyectable;
    /** Tiempo límite total de la operación, en milisegundos. */
    timeoutMs?: number;
}

export interface OpcionesLimpiar extends OpcionesRed {
    /** Contenido del CSV/TSV de entrada (texto, nunca ruta). */
    csv: string;
    /** Receta de OpenRefine sin envolver o envuelta; se valida aquí. */
    receta: unknown;
    /** Formato de entrada y salida; por defecto «csv». */
    formato?: FormatoLimpieza;
}

export interface ResultadoLimpieza {
    csv: string;
    formato: FormatoLimpieza;
}

/** ¿Host de loopback (127/8, localhost, ::1)? */
function esLoopback(host: string): boolean {
    return host === "localhost" || host === "::1" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

/** Resuelve el endpoint y aplica la puerta de host: fuera de loopback exige token de pasarela. */
function baseSegura(cfg: IntegrationConfig): { base?: string; error?: string } {
    const crudo = (cfg.endpoint || ENDPOINT_POR_DEFECTO).trim().replace(/\/+$/, "");
    let url: URL;
    try {
        url = new URL(crudo);
    } catch {
        return { error: "El endpoint de OpenRefine no es una URL válida." };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { error: "OpenRefine solo habla http(s)." };
    }
    if (esLoopback(url.hostname)) return { base: crudo };
    if (!(cfg.apiKey || "").trim()) {
        return { error: "OpenRefine local corre sin autenticación: un host remoto exige el token de una pasarela." };
    }
    return { base: crudo };
}

function cabeceras(cfg: IntegrationConfig): Record<string, string> {
    const token = (cfg.apiKey || "").trim();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Formato de importación/exportación de OpenRefine 3.10 (CSV y TSV comparten parser). */
function configFormato(formato: FormatoLimpieza = "csv"): { format: string; options: string; ext: FormatoLimpieza } {
    const separador = formato === "tsv" ? "\\t" : ",";
    return { format: "text/line-based/*sv", options: JSON.stringify({ separator: separador }), ext: formato };
}

function leerJson(res: Response): Promise<Record<string, unknown> | null> {
    return res.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

function mensajeRed(error: unknown): string {
    const e = error as { name?: string; message?: string } | null;
    return e?.name === "AbortError"
        ? "OpenRefine no respondió a tiempo."
        : `Fallo con OpenRefine: ${e?.message || "desconocido"}.`;
}

class FalloOpenRefine extends Error {}
function fallo(mensaje: string): never {
    throw new FalloOpenRefine(mensaje);
}

/** Crea el proyecto, aplica, exporta y borra. Nunca lanza: degrada con error. */
export async function limpiar(
    cfg: IntegrationConfig,
    opciones: OpcionesLimpiar,
): Promise<IntegrationResult<ResultadoLimpieza>> {
    if (!opciones) return { ok: false, error: "Falta el CSV y la receta de limpieza." };
    const veredicto = validarReceta(opciones.receta);
    if (!veredicto.ok || !veredicto.receta) {
        return { ok: false, error: `Receta rechazada: ${(veredicto.errores || []).join("; ")}` };
    }
    if (typeof opciones.csv !== "string" || !opciones.csv.trim()) {
        return { ok: false, error: "Falta el CSV de entrada." };
    }
    const sitio = baseSegura(cfg);
    if (!sitio.base) return { ok: false, error: sitio.error };

    const formato = opciones.formato === "tsv" ? "tsv" : "csv";
    const f = configFormato(formato);
    const fetchImpl = opciones.fetch ?? fetch;
    const cabecera = cabeceras(cfg);
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS);
    const pedir = (ruta: string, init: RequestInit = {}) =>
        fetchImpl(`${sitio.base}${ruta}`, { ...init, headers: cabecera, signal: control.signal });

    let proyecto: string | null = null;
    let token = "";
    let borrado: string | null = null;
    let resultado: IntegrationResult<ResultadoLimpieza> = { ok: false, error: "No se pudo completar la limpieza." };

    try {
        const resToken = await pedir("/command/core/get-csrf-token");
        const datosToken = await leerJson(resToken);
        token = typeof datosToken?.token === "string" ? datosToken.token : "";
        if (!resToken.ok || !token) fallo("OpenRefine no entregó el token CSRF (get-csrf-token).");

        const cuerpo = new FormData();
        const tipo = formato === "tsv" ? "text/tab-separated-values" : "text/csv";
        cuerpo.append("project-file", new Blob([opciones.csv], { type: tipo }), `entrada.${formato}`);
        cuerpo.append("project-name", "starseed-limpieza");
        cuerpo.append("format", f.format);
        cuerpo.append("options", f.options);
        const resCrear = await pedir(
            `/command/core/create-project-from-upload?csrf_token=${encodeURIComponent(token)}`,
            { method: "POST", body: cuerpo, redirect: "manual" },
        );
        const destino = resCrear.headers.get("location") || "";
        proyecto = /[?&]project=(\d+)/.exec(destino)?.[1] ?? null;
        if (!proyecto) {
            const datosCrear = await leerJson(resCrear);
            const id = datosCrear?.projectID ?? datosCrear?.project ?? datosCrear?.projectId;
            if (typeof id === "string" || typeof id === "number") proyecto = String(id).replace(/\D/g, "") || null;
        }
        if (!proyecto) fallo(`No se pudo crear el proyecto (HTTP ${resCrear.status}).`);

        const operaciones = veredicto.receta.operaciones.map((o) => ({
            ...o,
            op: o.op.startsWith("core/") ? o.op : `core/${o.op}`,
        }));
        const aplicar = new URLSearchParams({ operations: JSON.stringify(operaciones), csrf_token: token });
        const resAplicar = await pedir(`/command/core/apply-operations?project=${proyecto}`, {
            method: "POST",
            body: aplicar,
        });
        const datosAplicar = await leerJson(resAplicar);
        const codigo = String(datosAplicar?.code ?? "");
        if (!resAplicar.ok || (codigo !== "ok" && codigo !== "pending")) {
            const motivo = String(datosAplicar?.message || `HTTP ${resAplicar.status}`);
            fallo(`No se pudieron aplicar las operaciones: ${motivo}`);
        }

        const exportar = new URLSearchParams({
            project: proyecto,
            format: f.ext,
            engine: JSON.stringify({ facets: [], mode: "row-based" }),
            csrf_token: token,
        });
        const resExportar = await pedir(`/command/core/export-rows/salida.${f.ext}?project=${proyecto}`, {
            method: "POST",
            body: exportar,
        });
        if (!resExportar.ok) fallo(`No se pudo exportar el resultado (HTTP ${resExportar.status}).`);
        const csv = await resExportar.text();
        if (!csv.trim()) fallo("OpenRefine devolvió una exportación vacía.");
        resultado = { ok: true, data: { csv, formato } };
    } catch (error) {
        resultado = { ok: false, error: error instanceof FalloOpenRefine ? error.message : mensajeRed(error) };
    } finally {
        clearTimeout(temporizador);
        if (proyecto) {
            try {
                const borrar = new URLSearchParams({ project: proyecto, csrf_token: token });
                const res = await pedir("/command/core/delete-project", { method: "POST", body: borrar });
                if (!res.ok) borrado = `HTTP ${res.status}`;
            } catch (error) {
                borrado = mensajeRed(error);
            }
        }
    }

    if (proyecto && borrado && resultado.ok) {
        return { ok: false, error: `Se limpió el CSV pero no se pudo borrar el proyecto ${proyecto}: ${borrado}` };
    }
    return resultado;
}

/** Salud = GET /command/core/get-version (JSON con `version`). */
export async function health(
    cfg: IntegrationConfig,
    opciones: OpcionesRed = {},
): Promise<IntegrationResult<{ version: string; fullVersion: string }>> {
    const sitio = baseSegura(cfg);
    if (!sitio.base) return { ok: false, error: sitio.error };

    const fetchImpl = opciones.fetch ?? fetch;
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), opciones.timeoutMs ?? TIMEOUT_POR_DEFECTO_MS);
    try {
        const res = await fetchImpl(`${sitio.base}/command/core/get-version`, {
            headers: cabeceras(cfg),
            signal: control.signal,
        });
        const datos = await leerJson(res);
        if (!res.ok) return { ok: false, error: `OpenRefine respondió HTTP ${res.status}.` };
        const version = typeof datos?.version === "string" ? datos.version : "";
        if (!version) return { ok: false, error: "get-version no devolvió una versión." };
        const completa = typeof datos?.full_version === "string" ? datos.full_version : version;
        return { ok: true, data: { version, fullVersion: completa } };
    } catch (error) {
        return { ok: false, error: mensajeRed(error) };
    } finally {
        clearTimeout(temporizador);
    }
}
