/**
 * /api/mando/hardware — uso de CPU, RAM, GPU, disco y batería de la Mac — SOLO local.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: devuelve el estado actual del hardware de la Mac.
 * Puerta: el guardián común de `/api/mando/*` (404 fuera de local).
 * Nunca devuelve claves, rutas absolutas ni información privada.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { medirHardware } from "@/lib/mando/hardware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const hardware = await medirHardware();
    return Response.json(hardware, { headers: { "Cache-Control": "no-store" } });
}