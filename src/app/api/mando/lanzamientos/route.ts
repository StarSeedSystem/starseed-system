/**
 * /api/mando/lanzamientos (VER1105B · Centro de Versiones)
 * ─────────────────────────────────────────────────────────────────────────────
 * API local del panel «Versiones» en MetaGenesis (contrato
 * `architecture/centro-versiones-1105.md` §4).
 *
 * GET  → lee `~/.starseed/produccion/lanzamientos-estado.json`,
 *        `~/.starseed/produccion/lanzamientos.json` ({auto}) y
 *        `config/lanzamientos.json` (`auto_por_defecto`), y devuelve
 *        {estado, auto, filas: filasDeMedios(...)} con `NATIVE_VERSION`
 *        de `src/lib/version/os-release.ts` como versión publicada;
 *        nunca rutas del disco. El director escribe el estado por fases (en
 *        «esperando-lista» sin `medios`): `normalizarEstado` lo completa (SUP0611A).
 * POST → `validarPeticion`; `auto` escribe `lanzamientos.json`;
 *        `regenerar` de `web` escribe `~/.starseed/produccion/autopublicar-peticion.json`
 *        con {"accion": "revisar"}; las demás (también `pausar`/`reanudar`, que lee el
 *        director) escriben `lanzamientos-peticion.json` (escritura atómica: tmp + rename).
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves:
 * los errores de escritura son genéricos.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { validarPeticion, filasDeMedios, normalizarEstado } from "@/lib/mando/lanzamientos";
import { NATIVE_VERSION } from "@/lib/version/os-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function rutaAutopublicarPeticion(): string {
    return path.join(os.homedir(), ".starseed", "produccion", "autopublicar-peticion.json");
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

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const [crudoEstado, crudoInterruptor, crudoConfig] = await Promise.all([
        leerJson(rutaEstado()),
        leerJson(rutaInterruptor()),
        leerJson(rutaConfig()),
    ]);

    const estado = normalizarEstado(crudoEstado, NATIVE_VERSION);
    const auto = crudoInterruptor && typeof crudoInterruptor === "object" && "auto" in crudoInterruptor
        ? Boolean((crudoInterruptor as { auto?: unknown }).auto)
        : crudoConfig && typeof crudoConfig === "object" && "auto_por_defecto" in crudoConfig
            ? Boolean((crudoConfig as { auto_por_defecto?: unknown }).auto_por_defecto)
            : false;

    const filas = filasDeMedios(estado, NATIVE_VERSION);

    return Response.json(
        { estado, auto, filas, actualizadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (typeof crudo !== "object" || crudo === null) throw new Error("no-objeto");
        cuerpo = crudo as Record<string, unknown>;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    const validacion = validarPeticion(cuerpo);
    if ("error" in validacion) {
        return Response.json({ error: validacion.error }, { status: 400 });
    }

    const peticionValida = validacion;
    const accion = peticionValida.accion;
    const ahora = new Date().toISOString();

    if (accion === "auto") {
        const activo = peticionValida.activo === true;
        try {
            await escribirAtomico(rutaInterruptor(), { auto: activo, quien: "genesis", desde: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar el interruptor." }, { status: 500 });
        }
        return Response.json({ ok: true, activo }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "pausar" || accion === "reanudar") {
        // (SUP0611A) Una PETICIÓN, como pide el contrato (§4) y lee el director (`pasada`:
        // accion «pausar»/«reanudar» → `pausado`). Antes se escribía `pausada` dentro del
        // estado del director, que nadie leía y que él reescribe en cada pasada: el botón no
        // pausaba nada.
        const pausada = accion === "pausar";
        try {
            await escribirAtomico(rutaPeticion(), { accion, quien: "genesis", t: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
        }
        return Response.json({ ok: true, pausada }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "regenerar") {
        const medio = peticionValida.medio as string;
        if (medio === "web") {
            try {
                await escribirAtomico(rutaAutopublicarPeticion(), { accion: "revisar", quien: "genesis", t: ahora });
            } catch {
                return Response.json({ error: "No se pudo guardar la petición de autopublicación." }, { status: 500 });
            }
        } else {
            try {
                await escribirAtomico(rutaPeticion(), { accion: "regenerar", medio, quien: "genesis", t: ahora });
            } catch {
                return Response.json({ error: "No se pudo guardar la petición de regeneración." }, { status: 500 });
            }
        }
        return Response.json({ ok: true, medio }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "lanzar" || accion === "reintentar") {
        try {
            await escribirAtomico(rutaPeticion(), { accion, quien: "genesis", t: ahora });
        } catch {
            return Response.json({ error: "No se pudo guardar la petición." }, { status: 500 });
        }
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}