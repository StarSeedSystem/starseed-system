/**
 * POST /api/mando/reparar — repara un medidor: comprueba, arregla lo que esté mal y vuelve a comprobar.
 * GET  /api/mando/reparar?medidor=<clave> — la última reparación de ese medidor (del botón o de los directores).
 *
 * (2026-10-23) Alex: «agrega un botón de reparar junto al de comprobar en los medidores». El trabajo lo
 * hace `scripts/puente/reparar_medidor.py`, el mismo que lanzan los directores cada 10 min desde la
 * autocuración. Solo local (el guardián da 404 en producción); nunca devuelve claves ni rutas absolutas.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import type { Reparacion } from "@/lib/mando/reparacion-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAÍZ = raizDelProyecto();
const ESTADO_DIR = path.join(RAÍZ, "starseed_memory_root", "mando", "comprobaciones");
const CLAVE_VALIDA = /^[a-z][a-z0-9-]{1,31}$/;

function rutaEstado(medidor: string): string {
    return path.join(ESTADO_DIR, `reparacion-${medidor}.json`);
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const medidor = new URL(peticion.url).searchParams.get("medidor") ?? "";
    if (!CLAVE_VALIDA.test(medidor)) return Response.json({ error: "Falta ?medidor= válido" }, { status: 400 });
    try {
        const r = JSON.parse(await readFile(rutaEstado(medidor), "utf8")) as Reparacion;
        return Response.json({ reparacion: r }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ reparacion: null }, { headers: { "Cache-Control": "no-store" } });
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
    if (!CLAVE_VALIDA.test(medidor)) return Response.json({ error: "Falta «medidor» válido." }, { status: 400 });
    try {
        await mkdir(ESTADO_DIR, { recursive: true });
        // Se escribe YA: así la primera lectura del panel no confunde la reparación vieja con esta.
        const inicio: Reparacion = {
            medidor,
            origen: "boton",
            empezado: new Date().toISOString(),
            terminado: null,
            resumen: "Reparando…",
            paso: "comprobando",
            acciones: [],
        };
        await writeFile(rutaEstado(medidor), JSON.stringify(inicio, null, 2), "utf8");
        const hijo = spawn(
            "python3",
            [path.join(RAÍZ, "scripts", "puente", "reparar_medidor.py"), medidor, "--origen", "boton"],
            { cwd: RAÍZ, detached: true, stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, STARSEED_ROOT: RAÍZ } },
        );
        hijo.unref();
        return Response.json({ medidor, lanzado: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        return Response.json({ error: "No se pudo lanzar la reparación: " + String(e) }, { status: 500 });
    }
}
