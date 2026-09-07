/**
 * /api/mando/almacenamiento (Ola 273 · 2026-09-07) — SOLO local
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: disco de la neurona, regenerables por tamaño, espejo del memory root en
 * Google Drive (DriveFS), swap con explicación honesta y acciones disponibles.
 * POST {accion}: "espejar" (rsync desacoplado, sin --delete ni .env*) ·
 * "limpiar" (lista blanca de ids regenerables) · "aliviar" (BitNet a dormir +
 * cesión del pool de voz). La puerta es el guardián común de `/api/mando/*`:
 * 404 fuera de local. Jamás devuelve claves ni rutas absolutas de la casa.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { aliviarMemoria, espejar, leerAlmacenamiento, limpiarRegenerables } from "@/lib/mando/almacenamiento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const estado = await leerAlmacenamiento();
    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}

interface PeticionAccion {
    accion?: unknown;
    ids?: unknown;
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let cuerpo: PeticionAccion;
    try {
        cuerpo = (await request.json()) as PeticionAccion;
    } catch {
        return Response.json({ error: "Cuerpo JSON no válido." }, { status: 400 });
    }

    switch (cuerpo.accion) {
        case "espejar":
            return Response.json(await espejar(), { headers: { "Cache-Control": "no-store" } });
        case "limpiar": {
            const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((i): i is string => typeof i === "string") : [];
            if (ids.length === 0) return Response.json({ error: "Falta la lista de ids a limpiar." }, { status: 400 });
            return Response.json(await limpiarRegenerables(ids), { headers: { "Cache-Control": "no-store" } });
        }
        case "aliviar":
            return Response.json(await aliviarMemoria(), { headers: { "Cache-Control": "no-store" } });
        default:
            return Response.json({ error: "Acción desconocida: usa espejar, limpiar o aliviar." }, { status: 400 });
    }
}
