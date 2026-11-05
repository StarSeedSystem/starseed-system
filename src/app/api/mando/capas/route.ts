/**
 * /api/mando/capas (Ola 1007C · CPA1007K · contrato capas-autoadaptables §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → las filas de la pestaña «Capas» de Genesis: catálogo
 *        (`config/capas-astraura.json`) + estado del renovador
 *        (`~/.starseed/capas-estado.json`) + fichas reales de los nodos
 *        (`~/.starseed/capacidades-nodos.json`, si existe) + último banco
 *        (`~/.starseed/capas-banco.json`, si existe). Cada computación vive en
 *        `src/lib/mando/capas-red.ts` (puro).
 * POST → `{ accion: "comprobar" | "banco" | "mandar-propuesta" }` lanza
 *        `capas_renovar.py --json`, `capas_banco.py` o manda una propuesta
 *        de automejora a la cola del enjambre.
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { construirResumenRed, leerBanco, leerCatalogoCapas, leerNuevas } from "@/lib/mando/capas-red";
import { leerPropuestasAutomejora, crearTareaParaCola, type PropuestaAutomejora, type PropuestaArchivo } from "@/lib/mando/automejora-propuestas";
import { leerUltimaNoche, leerPropuestasArchivo, type UltimaNoche, type PropuestaAutomejoraArchivo } from "@/lib/mando/automejora-noche";
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

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const hogar = os.homedir();
    const baseMemoria = path.join(hogar, ".starseed");
    const [crudoCatalogo, crudoEstado, crudoFichas, crudoBanco, crudoUltimaNoche, crudoPropuestas] = await Promise.all([
        leerJson(path.join(raizDelProyecto(), "config", "capas-astraura.json")),
        leerJson(path.join(baseMemoria, "capas-estado.json")),
        leerJson(path.join(baseMemoria, "capacidades-nodos.json")),
        leerJson(path.join(baseMemoria, "capas-banco.json")),
        leerJson(path.join(baseMemoria, "aprendizaje", "automejora", "ultima-noche.json")),
        leerJson(path.join(baseMemoria, "olas", "propuestas-automejora")),
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

    const ultimaNoche = leerUltimaNoche(crudoUltimaNoche);
    let propuestas: PropuestaAutomejoraArchivo[] = [];
    if (Array.isArray(crudoPropuestas)) {
        for (const p of crudoPropuestas) {
            const leida = leerPropuestasArchivo(p);
            if (leida) propuestas.push(leida);
        }
    }

    return Response.json(
        { ...resumen, servidoEn: new Date().toISOString(), ultimaNoche, propuestas },
        { headers: { "Cache-Control": "no-store" } }
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let accion: string;
    let archivo: string | undefined;
    let id: string | undefined;
    try {
        const cuerpo = (await peticion.json()) as unknown;
        if (!esObjeto(cuerpo) || typeof cuerpo.accion !== "string") throw new Error("no-objeto");
        accion = cuerpo.accion;
        archivo = typeof cuerpo.archivo === "string" ? cuerpo.archivo : undefined;
        id = typeof cuerpo.id === "string" ? cuerpo.id : undefined;
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
    if (accion === "mandar-propuesta") {
        if (!archivo || !id) {
            return Response.json({ error: "Faltan «archivo» e «id» para mandar-propuesta." }, { status: 400 });
        }
        const baseMemoria = path.join(os.homedir(), ".starseed");
        const rutaArchivo = path.join(baseMemoria, "olas", "propuestas-automejora", archivo);
        const crudo = await leerJson(rutaArchivo);
        const propuestaArchivo = leerPropuestasArchivo(crudo);
        if (!propuestaArchivo) {
            return Response.json({ error: "Archivo de propuesta no encontrado o inválido." }, { status: 404 });
        }
        const propuesta = propuestaArchivo.propuestas.find((p) => p.id === id);
        if (!propuesta) {
            return Response.json({ error: "Propuesta no encontrada en el archivo." }, { status: 404 });
        }
        if (propuesta.enviada) {
            return Response.json({ ok: true, yaEnviada: true }, { headers: { "Cache-Control": "no-store" } });
        }
        const fecha = new Date().toISOString().split("T")[0];
        const tarea = crearTareaParaCola({ ...propuesta, enviada: propuesta.enviada ?? false }, fecha);
        const colaDir = path.join(baseMemoria, "olas");
        const colaArchivo = path.join(colaDir, `cola-automejora-${fecha}.json`);
        let cola: unknown[] = [];
        const crudoCola = await leerJson(colaArchivo);
        if (Array.isArray(crudoCola)) cola = crudoCola;
        cola.push(tarea);
        await writeFile(colaArchivo, JSON.stringify(cola, null, 1), "utf-8");
        propuesta.enviada = true;
        const nuevoArchivo = { ...propuestaArchivo, propuestas: propuestaArchivo.propuestas };
        await writeFile(rutaArchivo, JSON.stringify(nuevoArchivo, null, 1), "utf-8");
        return Response.json({ ok: true, accion, tarea: tarea.id }, { headers: { "Cache-Control": "no-store" } });
    }
    if (accion === "descartar") {
        if (!archivo || !id) {
            return Response.json({ error: "Faltan «archivo» e «id» para descartar." }, { status: 400 });
        }
        const baseMemoria = path.join(os.homedir(), ".starseed");
        const rutaArchivo = path.join(baseMemoria, "olas", "propuestas-automejora", archivo);
        const crudo = await leerJson(rutaArchivo);
        const propuestaArchivo = leerPropuestasArchivo(crudo);
        if (!propuestaArchivo) {
            return Response.json({ error: "Archivo de propuesta no encontrado o inválido." }, { status: 404 });
        }
        const idx = propuestaArchivo.propuestas.findIndex((p) => p.id === id);
        if (idx === -1) {
            return Response.json({ error: "Propuesta no encontrada en el archivo." }, { status: 404 });
        }
        propuestaArchivo.propuestas.splice(idx, 1);
        await writeFile(rutaArchivo, JSON.stringify(propuestaArchivo, null, 1), "utf-8");
        return Response.json({ ok: true, accion }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
