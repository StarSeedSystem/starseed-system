/**
 * /api/mando/jev — uso del consejero Jev en esta máquina.
 * Solo expone contadores agregados; nunca claves ni rutas del disco.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { construirRespuestaJev } from "@/lib/mando/jev-medidor";
import { raizDelProyecto } from "@/lib/mando/raiz";

const correr = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUTA_USO = path.join(os.homedir(), ".starseed", "jev-uso.json");

function techo(nombre: "STARSEED_JEV_DIA_USD" | "STARSEED_JEV_MES_USD", respaldo: number): number {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) && valor >= 0 ? valor : respaldo;
}

/** Los techos que jev.py dejó escritos en su archivo de uso. Nulos si aún no los escribió. */
function topesDe(uso: unknown): { dia: number | null; mes: number | null } {
    const raiz = uso && typeof uso === "object" ? (uso as Record<string, unknown>) : {};
    const t = raiz.topes && typeof raiz.topes === "object" ? (raiz.topes as Record<string, unknown>) : {};
    const num = (v: unknown): number | null => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
    return { dia: num(t.dia), mes: num(t.mes) };
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
    // (2026-09-21) Los techos estaban ESCRITOS A MANO aquí (0,05 y 1) y el medidor siguió
    // enseñándolos después de subirlos a 0,20 y 2 en scripts/puente/jev.py: dos sitios para
    // el mismo número, que es el fallo que hemos pagado todo el día en los demás medidores.
    // Ahora manda quien los decide: jev.py los escribe en `topes` dentro de su propio
    // archivo de uso, y aquí solo se leen. La variable de entorno sigue pudiendo forzarlos
    // —para una prueba—, y los literales quedan como último recurso si el archivo es viejo.
    const topesDelArchivo = topesDe(uso);
    const respuesta = construirRespuestaJev(
        uso,
        fechaLocal(),
        {
            dia: techo("STARSEED_JEV_DIA_USD", topesDelArchivo.dia ?? 0.05),
            mes: techo("STARSEED_JEV_MES_USD", topesDelArchivo.mes ?? 1),
        },
        localVivo,
    );
    return Response.json(respuesta, { headers: { "Cache-Control": "no-store" } });
}

// El guion de una línea importa jev desde scripts/puente y volca el dict en JSON;
// la contabilidad vive en Python y aquí NO se reimplementa: un solo sitio de verdad.
function guionReinicio(mes: boolean): string {
    return [
        "import json, sys",
        "sys.path.insert(0, 'scripts/puente')",
        "import jev",
        `print(json.dumps(jev.reiniciar_limite(dia=True, mes=${mes ? "True" : "False"})))`,
    ].join("\n");
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: { accion?: string; mes?: boolean };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    if (cuerpo.accion !== "reiniciar-limite") {
        return Response.json({ error: `Acción desconocida: ${cuerpo.accion ?? ""}` }, { status: 400 });
    }

    const raiz = raizDelProyecto();
    // cwd en la raíz del repo porque el guion referencia 'scripts/puente' de forma relativa.
    const mes = cuerpo.mes === true;
    try {
        const { stdout } = await correr("python3", ["-c", guionReinicio(mes)], {
            cwd: raiz,
            timeout: 30_000,
            maxBuffer: 1_000_000,
        });
        const resultado = JSON.parse(stdout.trim()) as unknown;
        return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        return Response.json(
            { error: `No se pudo reiniciar el límite: ${e instanceof Error ? e.message.slice(0, 200) : "error"}` },
            { status: 500 },
        );
    }
}
