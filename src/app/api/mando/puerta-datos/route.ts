/**
 * /api/mando/puerta-datos — la fila «Puerta de datos (A1)» de Consumo y créditos (PDA1010).
 *
 * GET  → lo último que midió `scripts/puente/puerta_datos.py medir` (~/.starseed/puerta-datos.json),
 *        leído con lista blanca (ni URLs, ni IPs, ni fichas). No llama a la puerta.
 * POST → «Comprobar ahora»: mide YA (salud y métricas por SSH + sonda HTTPS) y devuelve lo nuevo.
 *        Como mucho una medición forzada por minuto y una a la vez.
 * Solo con `guardianMando` (Genesis local o miembro de MetaGenesis). Contrato:
 * architecture/puerta-datos-a1.md §5.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { leerDatosPuerta } from "@/lib/datos/puerta-a1-tipos";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const sinCache = { "Cache-Control": "no-store" };
let midiendo = false;
let ultimoForzado = 0;

async function leer() {
    try {
        return leerDatosPuerta(await readFile(path.join(os.homedir(), ".starseed", "puerta-datos.json"), "utf-8"));
    } catch {
        return null;
    }
}

/** (PDA1012) Una lectura más vieja que esto se renueva sola, en segundo plano, al pedirla. */
const VIEJA_MS = 15 * 60_000;

function pythonDeLaMac(): string {
    return existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
}

/** Lanza `puerta_datos.py medir` sin esperar (como mucho una vez a la vez y una por minuto). */
function medirEnSegundoPlano(): void {
    const ahora = Date.now();
    if (midiendo || ahora - ultimoForzado < 60_000) return;
    midiendo = true;
    ultimoForzado = ahora;
    correr(pythonDeLaMac(), ["scripts/puente/puerta_datos.py", "medir"], {
        cwd: raizDelProyecto(),
        timeout: 120_000,
        maxBuffer: 1_000_000,
        windowsHide: true,
    })
        .catch(() => undefined)
        .finally(() => {
            midiendo = false;
        });
}

export async function GET(req: Request) {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const datos = await leer();
    // Nadie lanzaba `medir` salvo el botón: la fila se quedaba con «lectura vieja». Ahora, si la
    // lectura tiene más de 15 min (o no hay), se renueva sola mientras se devuelve la que hay.
    const edad = datos ? Date.now() - Date.parse(datos.comprobado) : Infinity;
    if (!Number.isFinite(edad) || edad > VIEJA_MS) medirEnSegundoPlano();
    return Response.json(
        datos
            ? { datos }
            : { datos: null, error: "La puerta de datos aún no se ha medido en esta neurona: pulsa «Comprobar ahora»." },
        { headers: sinCache },
    );
}

export async function POST(req: Request) {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const ahora = Date.now();
    if (midiendo || ahora - ultimoForzado < 60_000) {
        return Response.json(
            { datos: await leer(), mensaje: midiendo ? "Ya se está comprobando la puerta." : "Se comprobó hace menos de un minuto." },
            { status: 202, headers: sinCache },
        );
    }
    midiendo = true;
    ultimoForzado = ahora;
    try {
        await correr(pythonDeLaMac(), ["scripts/puente/puerta_datos.py", "medir"], {
            cwd: raizDelProyecto(),
            timeout: 120_000,
            maxBuffer: 1_000_000,
            windowsHide: true,
        });
        return Response.json({ datos: await leer(), mensaje: "Puerta comprobada ahora." }, { headers: sinCache });
    } catch {
        return Response.json(
            { datos: await leer(), error: "La comprobación no terminó (¿sin llave SSH del A1 en esta neurona?): se enseña la última." },
            { status: 503, headers: sinCache },
        );
    } finally {
        midiendo = false;
    }
}
