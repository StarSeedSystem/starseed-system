/**
 * /api/mando/oracle/consumo — el medidor de Oracle Cloud de «Consumo y créditos» (OC1010).
 *
 * GET  → lo último que midió `scripts/puente/medidor_oracle.py` (~/.starseed/oracle-consumo.json),
 *        validado con lista blanca (sin ids). No llama a Oracle.
 * POST → «Actualizar ahora»: mide YA con la CLI de Oracle (solo lectura) y devuelve lo nuevo.
 *        Como mucho una medición forzada por minuto y una a la vez.
 * Solo con `guardianMando` (Genesis local o miembro de MetaGenesis).
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { leerConsumoOracle } from "@/lib/mando/oracle-consumo-tipos";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const sinCache = { "Cache-Control": "no-store" };
let midiendo = false;
let ultimoForzado = 0;

async function leer() {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "oracle-consumo.json"), "utf-8");
        return leerConsumoOracle(crudo);
    } catch {
        return null;
    }
}

export async function GET(req: Request) {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const datos = await leer();
    return Response.json(
        datos
            ? { datos }
            : { datos: null, error: "Oracle todavía no se ha medido: pulsa «Actualizar ahora» o espera a la próxima pasada del recolector." },
        { headers: sinCache },
    );
}

export async function POST(req: Request) {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const ahora = Date.now();
    if (midiendo || ahora - ultimoForzado < 60_000) {
        return Response.json(
            { datos: await leer(), mensaje: midiendo ? "Ya se está midiendo Oracle." : "Se midió hace menos de un minuto." },
            { status: 202, headers: sinCache },
        );
    }
    midiendo = true;
    ultimoForzado = ahora;
    try {
        const python = existsSync("/opt/homebrew/bin/python3") ? "/opt/homebrew/bin/python3" : "python3";
        await correr(python, ["scripts/puente/medidor_oracle.py", "medir", "--forzar"], {
            cwd: raizDelProyecto(),
            timeout: 200_000,
            maxBuffer: 1_000_000,
            windowsHide: true,
        });
        return Response.json({ datos: await leer(), mensaje: "Oracle medido ahora." }, { headers: sinCache });
    } catch {
        return Response.json(
            { datos: await leer(), error: "La medición de Oracle no terminó: se enseña la última lectura." },
            { status: 503, headers: sinCache },
        );
    } finally {
        midiendo = false;
    }
}
