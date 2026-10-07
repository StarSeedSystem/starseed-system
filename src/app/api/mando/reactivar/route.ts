/**
 * Botón «Reactivar directores» (2026-10-06). GET: el último parte del reactivador.
 * POST: lo lanza en segundo plano (`scripts/puente/reactivar_mando.py --origen boton`) y
 * contesta enseguida; el botón va leyendo el parte con GET mientras avanza. Uno a la vez.
 */
import { spawn } from "node:child_process";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { informeVigente, leerInformeReactivador, puedeLanzar } from "@/lib/mando/reactivador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const informe = informeVigente(await leerInformeReactivador(), Date.now());
    return Response.json({ informe }, { headers: SIN_CACHE });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const actual = await leerInformeReactivador();
    if (!puedeLanzar(actual, Date.now())) {
        return Response.json({ lanzado: false, yaEnMarcha: true, informe: actual }, { status: 202, headers: SIN_CACHE });
    }
    try {
        const hijo = spawn("python3", ["scripts/puente/reactivar_mando.py", "--origen", "boton"], {
            cwd: raizDelProyecto(),
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
        hijo.unref();
        return Response.json({ lanzado: true }, { status: 202, headers: SIN_CACHE });
    } catch (e) {
        const msj = e instanceof Error ? e.message : String(e);
        return Response.json({ error: `No pude lanzar el reactivador: ${msj.slice(0, 200)}` }, { status: 500 });
    }
}
