/**
 * /api/mando/jev — uso del consejero Jev en esta máquina.
 * Solo expone contadores agregados; nunca claves ni rutas del disco.
 */

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { construirRespuestaJev } from "@/lib/mando/jev-medidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_USO = path.join(os.homedir(), ".starseed", "jev-uso.json");

function techo(nombre: "STARSEED_JEV_DIA_USD" | "STARSEED_JEV_MES_USD", respaldo: number): number {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) && valor >= 0 ? valor : respaldo;
}

function fechaLocal(): string {
    const ahora = new Date();
    const mes = String(ahora.getMonth() + 1).padStart(2, "0");
    const dia = String(ahora.getDate()).padStart(2, "0");
    return `${ahora.getFullYear()}-${mes}-${dia}`;
}

async function leerUso(): Promise<unknown> {
    try {
        return JSON.parse(await readFile(RUTA_USO, "utf8")) as unknown;
    } catch {
        return null;
    }
}

async function motorLocalVivo(): Promise<boolean> {
    const controlador = new AbortController();
    const plazo = setTimeout(() => controlador.abort(), 2_000);
    try {
        const respuesta = await fetch("http://127.0.0.1:8790/health", {
            cache: "no-store",
            signal: controlador.signal,
        });
        return respuesta.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(plazo);
    }
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const [uso, localVivo] = await Promise.all([leerUso(), motorLocalVivo()]);
    const respuesta = construirRespuestaJev(
        uso,
        fechaLocal(),
        {
            dia: techo("STARSEED_JEV_DIA_USD", 0.05),
            mes: techo("STARSEED_JEV_MES_USD", 1),
        },
        localVivo,
    );
    return Response.json(respuesta, { headers: { "Cache-Control": "no-store" } });
}
