import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { leerCreditosPago } from "@/lib/mando/creditos-pago";
import { tocaRecoger as decidirRecogida } from "@/lib/mando/creditos-pago-tipos";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// (2026-10-07) Sin `export`: una ruta de Next solo exporta GET/POST/runtime/dynamic… (CLAUDE.md, «Publicar»).
const tocaRecoger = decidirRecogida;

const correr = promisify(execFile);
let recogidaEnMarcha = false;
const sinCache = { "Cache-Control": "no-store" };

async function lecturaActual() {
    return (await leerCreditosPago().catch(() => null)) ?? { medidores: {} };
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    return Response.json(await lecturaActual(), { headers: sinCache });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const actual = await leerCreditosPago().catch(() => null);
    const instante = actual?.t ? Date.parse(actual.t) : Number.NaN;
    const ultimo = Number.isFinite(instante) ? instante : null;
    if (!tocaRecoger(ultimo, recogidaEnMarcha, Date.now())) {
        return Response.json(actual ?? { medidores: {} }, { status: 202, headers: sinCache });
    }

    recogidaEnMarcha = true;
    try {
        await correr("python3", ["scripts/puente/medidores_credito.py", "recoger"], {
            cwd: raizDelProyecto(),
            timeout: 120_000,
            maxBuffer: 1_000_000,
            windowsHide: true,
        });
        return Response.json(await lecturaActual(), { headers: sinCache });
    } catch {
        return Response.json(await lecturaActual(), { status: 503, headers: sinCache });
    } finally {
        recogidaEnMarcha = false;
    }
}
