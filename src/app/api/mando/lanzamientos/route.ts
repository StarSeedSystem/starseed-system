/**
 * /api/mando/lanzamientos (VER1105B · Centro de Versiones)
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel de versiones en el pulso de MetaGenesis (contrato
 * `architecture/centro-versiones-1105.md` §4).
 *
 * GET  → estado del director (`lanzamientos-estado.json`), el interruptor `auto`
 *        (`lanzamientos.json` + `config/lanzamientos.json → auto_por_defecto`) y
 *        las filas por medio con versión servida y estado.
 * POST → `{ accion: "auto", activo: boolean }`              escribe `lanzamientos.json`
 *        `{ accion: "regenerar", medio: "web" }`            escribe `autopublicar-peticion.json` con `{accion: "revisar"}`
 *        `{ accion: "regenerar", medio: "macos"|... }`      escribe `lanzamientos-peticion.json` (atómico: tmp + rename)
 *        `{ accion: "lanzar" | "pausar" | "reanudar" | "reintentar" }`  escribe `lanzamientos-peticion.json`
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves:
 * los errores de escritura son genéricos.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { NATIVE_VERSION } from "@/lib/version/os-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIOS_PANEL = [
    { clave: "web", etiqueta: "Sitio web oficial" },
    { clave: "pwa", etiqueta: "App web instalable (PWA)" },
    { clave: "macos", etiqueta: "macOS" },
    { clave: "windows", etiqueta: "Windows" },
    { clave: "linux", etiqueta: "Linux" },
    { clave: "android", etiqueta: "Android" },
    { clave: "ios", etiqueta: "iOS" },
    { clave: "canales", etiqueta: "Canales del actualizador" },
    { clave: "libreria", etiqueta: "Librería de StarSeed OS" },
] as const;

function rutaEstado(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos-estado.json");
}

function rutaInterruptor(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos.json");
}

function rutaConfig(): string {
    return path.join(raizDelProyecto(), "config", "lanzamientos.json");
}

function rutaPeticion(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "lanzamientos-peticion.json");
}

function rutaPeticionAutopublicar(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "autopublicar-peticion.json");
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}

function filasDeMedios(estado: unknown): Array<{
    clave: string;
    etiqueta: string;
    version: string | null;
    estado: string;
    faltan: string[];
    pequenos: string[];
    problemas?: string[];
}> {
    if (!esObjeto(estado)) return [];
    const medios = esObjeto(estado.medios) ? estado.medios : {};
    return MEDIOS_PANEL.map(({ clave, etiqueta }) => {
        const m = esObjeto(medios[clave]) ? medios[clave] : {};
        return {
            clave,
            etiqueta,
            version: typeof m.version === "string" ? m.version : null,
            estado: typeof m.estado === "string" ? m.estado : "al-dia",
            faltan: Array.isArray(m.faltan) ? m.faltan.filter((x): x is string => typeof x === "string") : [],
            pequenos: Array.isArray(m.pequenos) ? m.pequenos.filter((x): x is string => typeof x === "string") : [],
            problemas: Array.isArray(m.problemas) ? m.problemas.filter((x): x is string => typeof x === "string") : undefined,
        };
    });
}

function tonoPastilla(estado: unknown): "normal" | "aviso" | "peligro" {
    if (!esObjeto(estado)) return "normal";
    const fase = typeof estado.fase === "string" ? estado.fase : "";
    if (fase === "atascado") return "peligro";
    const medios = esObjeto(estado.medios) ? estado.medios : {};
    for (const m of Object.values(medios)) {
        if (esObjeto(m) && m.estado === "atascado") return "peligro";
    }
    const fasesActivas = ["esperando-publicacion", "preparando", "etiquetando", "compilando", "verificando-archivos", "publicando", "verificando-medios"];
    if (fasesActivas.includes(fase)) return "aviso";
    return "normal";
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const [crudoEstado, crudoInterruptor, crudoConfig] = await Promise.all([
        leerJson(rutaEstado()),
        leerJson(rutaInterruptor()),
        leerJson(rutaConfig()),
    ]);

    const autoInterruptor = esObjeto(crudoInterruptor) && crudoInterruptor.auto === true;
    const autoConfig = esObjeto(crudoConfig) && crudoConfig.auto_por_defecto === true;
    const auto = autoInterruptor || autoConfig;

    const filas = filasDeMedios(crudoEstado);
    const tono = tonoPastilla(crudoEstado);
    const versionPublicada = NATIVE_VERSION;

    return Response.json(
        {
            estado: crudoEstado,
            auto,
            versionPublicada,
            filas,
            tono,
            actualizadoEn: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (!esObjeto(crudo)) throw new Error("no-objeto");
        cuerpo = crudo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const ahora = new Date().toISOString();

    if (accion === "auto") {
        if (typeof cuerpo.activo !== "boolean") {
            return Response.json({ error: "Falta «activo» (true o false)." }, { status: 400 });
        }
        try {
            await escribirAtomico(rutaInterruptor(), { auto: cuerpo.activo, quien: "genesis", desde: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar el interruptor." }, { status: 500 });
        }
        return Response.json({ ok: true, auto: cuerpo.activo }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "regenerar") {
        const medio = typeof cuerpo.medio === "string" ? cuerpo.medio : "";
        if (!medio) {
            return Response.json({ error: "Falta el medio a regenerar." }, { status: 400 });
        }
        if (medio === "web") {
            try {
                await escribirAtomico(rutaPeticionAutopublicar(), { accion: "revisar", quien: "genesis", t: ahora });
            } catch {
                return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
            }
            return Response.json({ ok: true, accion: "regenerar", medio: "web" }, { headers: { "Cache-Control": "no-store" } });
        }
        const mediosValidos: string[] = MEDIOS_PANEL.map((m) => m.clave).filter((m) => m !== "web" && m !== "pwa" && m !== "libreria");
        if (!mediosValidos.includes(medio)) {
            return Response.json({ error: `El medio '${medio}' no se puede regenerar desde aquí.` }, { status: 400 });
        }
        try {
            await escribirAtomico(rutaPeticion(), { accion: "regenerar", medio, quien: "genesis", t: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
        }
        return Response.json({ ok: true, accion: "regenerar", medio }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "lanzar" || accion === "pausar" || accion === "reanudar" || accion === "reintentar") {
        try {
            await escribirAtomico(rutaPeticion(), { accion, quien: "genesis", t: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
        }
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Acción desconocida: usa auto, regenerar, lanzar, pausar, reanudar o reintentar." }, { status: 400 });
}