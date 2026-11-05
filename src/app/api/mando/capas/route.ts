/**
 * /api/mando/capas (Ola 1007C · CPA1007K · contrato capas-autoadaptables §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → las filas de la pestaña «Capas» de Genesis: catálogo
 *        (`config/capas-astraura.json`) + estado del renovador
 *        (`~/.starseed/capas-estado.json`) + fichas reales de los nodos
 *        (`~/.starseed/capacidades-nodos.json`, si existe) + último banco
 *        (`~/.starseed/capas-banco.json`, si existe). Cada computación vive en
 *        `src/lib/mando/capas-red.ts` (puro).
 * POST → `{ accion: "comprobar" | "banco" }` lanza `capas_renovar.py --json`
 *        o `capas_banco.py` DESACOPLADOS (mismo patrón que
 *        `lanzarPasadaAutopublicar` de `/api/mando/produccion`).
 *        `{ accion: "mandar-propuesta", archivo, id }` copia ESA tarea de
 *        `olas/propuestas-automejora/` a `olas/cola-automejora-<fecha>.json` y la
 *        marca enviada; `{ accion: "descartar-propuesta", archivo, id }` la descarta.
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizarNocheAutomejora } from "@/lib/astraura/capas/automejora";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { construirResumenRed, leerBanco, leerCatalogoCapas, leerNuevas } from "@/lib/mando/capas-red";
import {
    colaConTarea,
    leerPropuestas,
    marcarPropuestaDescartada,
    marcarPropuestaEnviada,
    tareaDePropuesta,
    type PropuestaAutomejora,
} from "@/lib/mando/propuestas-automejora";
import type { CapacidadesNodo } from "@/lib/network/capacidades-nodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fichas anunciadas por los nodos, si hay registro local; nunca se inventan. */
function fichasDe(crudo: unknown): CapacidadesNodo[] {
    const lista = Array.isArray(crudo) ? crudo : esObjeto(crudo) && Array.isArray(crudo.nodos) ? crudo.nodos : [];
    return lista.filter(esObjeto).filter((n) => typeof n.nodoId === "string") as unknown as CapacidadesNodo[];
}

/** Lanza un script del puente sin hacer esperar a la pantalla. */
function lanzarScript(nombre: string, argumentos: string[] = []): void {
    try {
        const python = existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
        const hijo = spawn(python, [path.join(raizDelProyecto(), "scripts", "puente", nombre), ...argumentos], {
            cwd: raizDelProyecto(),
            detached: true,
            stdio: "ignore",
        });
        hijo.unref();
    } catch {
        /* el servicio del renovador lo hará en su próxima vuelta */
    }
}

async function escribirJson(ruta: string, datos: unknown): Promise<boolean> {
    try {
        await mkdir(path.dirname(ruta), { recursive: true });
        await writeFile(ruta, JSON.stringify(datos, null, 2) + "\n", "utf-8");
        return true;
    } catch {
        return false;
    }
}

function carpetaPropuestas(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "olas", "propuestas-automejora");
}

/** Solo un nombre de archivo: nunca una ruta del disco. */
function nombreSeguro(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const nombre = v.trim();
    return /^[A-Za-z0-9._-]+\.json$/.test(nombre) && !nombre.includes("..") ? nombre : null;
}

/** Las propuestas de la automejora, leídas de su carpeta local (si existe). */
async function leerPropuestasLocales(): Promise<PropuestaAutomejora[]> {
    try {
        const nombres = (await readdir(carpetaPropuestas())).filter((n) => n.endsWith(".json")).sort();
        const entradas = await Promise.all(
            nombres.map(async (archivo) => ({
                archivo,
                crudo: await leerJson(path.join(carpetaPropuestas(), archivo)),
            })),
        );
        return leerPropuestas(entradas);
    } catch {
        return [];
    }
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const hogar = os.homedir();
    const rutaNoche = path.join(raizDelProyecto(), "starseed_memory_root", "aprendizaje", "automejora", "ultima-noche.json");
    const [crudoCatalogo, crudoEstado, crudoFichas, crudoBanco, crudoNoche, propuestas] = await Promise.all([
        leerJson(path.join(raizDelProyecto(), "config", "capas-astraura.json")),
        leerJson(path.join(hogar, ".starseed", "capas-estado.json")),
        leerJson(path.join(hogar, ".starseed", "capacidades-nodos.json")),
        leerJson(path.join(hogar, ".starseed", "capas-banco.json")),
        leerJson(rutaNoche),
        leerPropuestasLocales(),
    ]);

    const catalogo = leerCatalogoCapas(crudoCatalogo);
    const { nuevas, actualizado } = leerNuevas(crudoEstado);
    const resumen = construirResumenRed({
        catalogo,
        fichas: fichasDe(crudoFichas),
        banco: leerBanco(crudoBanco),
        nuevas,
        actualizado,
    });

    return Response.json(
        { ...resumen, noche: normalizarNocheAutomejora(crudoNoche), propuestas, servidoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let accion: string;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (!esObjeto(crudo) || typeof crudo.accion !== "string") throw new Error("no-objeto");
        cuerpo = crudo;
        accion = crudo.accion;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    if (accion === "comprobar") {
        lanzarScript("capas_renovar.py", ["--json"]);
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }
    if (accion === "banco") {
        lanzarScript("capas_banco.py");
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }
    if (accion === "mandar-propuesta" || accion === "descartar-propuesta") {
        return gestionarPropuesta(cuerpo, accion);
    }
    return Response.json(
        { error: "Acción desconocida: usa «comprobar», «banco», «mandar-propuesta» o «descartar-propuesta»." },
        { status: 400 },
    );
}

/** «Mandar al enjambre» copia UNA tarea a la cola; «Descartar» solo marca la propuesta. */
async function gestionarPropuesta(
    cuerpo: Record<string, unknown>,
    accion: "mandar-propuesta" | "descartar-propuesta",
): Promise<Response> {
    const archivo = nombreSeguro(cuerpo.archivo);
    const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
    if (!archivo || !id) {
        return Response.json({ error: "Falta el archivo o el id de la propuesta." }, { status: 400 });
    }
    const rutaPropuesta = path.join(carpetaPropuestas(), archivo);
    const crudo = await leerJson(rutaPropuesta);
    const propuesta = leerPropuestas([{ archivo, crudo }]).find((p) => p.id === id);
    if (!propuesta) return Response.json({ error: "Propuesta no encontrada." }, { status: 404 });

    const fecha = new Date().toISOString().slice(0, 10);
    if (accion === "descartar-propuesta") {
        if (propuesta.enviada) {
            return Response.json({ error: "La propuesta ya se mandó al enjambre." }, { status: 409 });
        }
        const nuevo = marcarPropuestaDescartada(crudo, id);
        if (!nuevo || !(await escribirJson(rutaPropuesta, nuevo))) {
            return Response.json({ error: "No se pudo descartar la propuesta." }, { status: 500 });
        }
        return Response.json({ ok: true, accion, archivo, id }, { headers: { "Cache-Control": "no-store" } });
    }

    if (propuesta.enviada) {
        return Response.json({ ok: true, accion, archivo, id, yaEnviada: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const tarea = tareaDePropuesta(propuesta, fecha);
    const nombreCola = `cola-automejora-${fecha}.json`;
    const rutaCola = path.join(raizDelProyecto(), "starseed_memory_root", "olas", nombreCola);
    const cola = colaConTarea(await leerJson(rutaCola), tarea, fecha);
    if (!(await escribirJson(rutaCola, cola))) {
        return Response.json({ error: "No se pudo escribir la cola de la automejora." }, { status: 500 });
    }
    const nuevo = marcarPropuestaEnviada(crudo, id, fecha);
    if (nuevo) await escribirJson(rutaPropuesta, nuevo);
    return Response.json(
        { ok: true, accion, archivo, id, cola: nombreCola },
        { headers: { "Cache-Control": "no-store" } },
    );
}
