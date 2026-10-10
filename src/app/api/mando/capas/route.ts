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
 *
 * ⚠️ Solo local (`guardianMando`). Jamás devuelve rutas del disco ni claves.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { construirResumenRed, leerBanco, leerCatalogoCapas, leerNuevas } from "@/lib/mando/capas-red";
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
    const [crudoCatalogo, crudoEstado, crudoFichas, crudoBanco] = await Promise.all([
        leerJson(path.join(raizDelProyecto(), "config", "capas-astraura.json")),
        leerJson(path.join(hogar, ".starseed", "capas-estado.json")),
        leerJson(path.join(hogar, ".starseed", "capacidades-nodos.json")),
        leerJson(path.join(hogar, ".starseed", "capas-banco.json")),
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

    return Response.json({ ...resumen, servidoEn: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let accion: string;
    try {
        const cuerpo = (await peticion.json()) as unknown;
        if (!esObjeto(cuerpo) || typeof cuerpo.accion !== "string") throw new Error("no-objeto");
        accion = cuerpo.accion;
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
    return Response.json({ error: "Acción desconocida: usa «comprobar» o «banco»." }, { status: 400 });
}
