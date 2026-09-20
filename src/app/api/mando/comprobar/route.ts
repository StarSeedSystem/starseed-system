/**
 * POST /api/mando/comprobar — lanza la comprobación del medidor.
 * GET  /api/mando/comprobar?medidor=<clave> — última comprobación de ese medidor.
 *
 * Solo local (404 en producción); nunca devuelve claves ni rutas absolutas.
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import type { ClaveMedidorComprobacion, Comprobacion } from "@/lib/mando/comprobacion-tipos";
import { resumirComprobacion } from "@/lib/mando/comprobacion-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAÍZ = raizDelProyecto();
const ESTADO_DIR = path.join(RAÍZ, "starseed_memory_root", "mando", "comprobaciones");

function rutaEstado(medidor: string): string {
    return path.join(ESTADO_DIR, `comprobacion-${medidor}.json`);
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const medidor = url.searchParams.get("medidor") ?? "";
    if (!medidor) {
        return Response.json({ error: "Falta ?medidor=" }, { status: 400 });
    }
    try {
        const datos = await readFile(rutaEstado(medidor), "utf8");
        const c = JSON.parse(datos) as Comprobacion;
        return Response.json({ comprobacion: c, resumen: resumirComprobacion(c) }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ comprobacion: null, resumen: null, mensaje: "Sin comprobación previa para «" + medidor + "»" }, { headers: { "Cache-Control": "no-store" } });
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: { medidor?: string };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const medidor = typeof cuerpo.medidor === "string" ? cuerpo.medidor.trim() : "";
    if (!medidor) return Response.json({ error: "Falta «medidor»." }, { status: 400 });
    try {
        await mkdir(ESTADO_DIR, { recursive: true });
        const id = `comp-${medidor}-${Date.now()}`;
        const ahora = new Date().toISOString();
        const inicio: Comprobacion = {
            id,
            medidor: medidor as ClaveMedidorComprobacion,
            empezado: ahora,
            terminado: null,
            directores: ["vigilante", "director", "guardia"],
            veredictos: [],
            resumen: "Comprobación lanzada",
        };
        await writeFile(rutaEstado(medidor), JSON.stringify(inicio, null, 2), "utf8");
        const esNeedle = medidor === "needle";
        const ejecutable = esNeedle ? "bash" : "python3";
        const guion = esNeedle
            ? path.join(RAÍZ, "scripts", "renovar-needle.sh")
            : path.join(RAÍZ, "scripts", "puente", "renovador-pasarelas.py");
        const hijo = spawn(ejecutable, [guion], {
            cwd: RAÍZ,
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
            env: { ...process.env, STARSEED_ROOT: RAÍZ },
        });
        hijo.unref();
        return Response.json({ id, medidor, lanzado: true, pid: hijo.pid }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        return Response.json({ error: "No se pudo lanzar la comprobación: " + String(e) }, { status: 500 });
    }
}
