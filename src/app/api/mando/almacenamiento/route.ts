/**
 * /api/mando/almacenamiento (Ola 273 · 2026-09-07) — SOLO local
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: disco de la neurona, regenerables por tamaño, espejo del memory root en
 * Google Drive (DriveFS), swap con explicación honesta y acciones disponibles.
 * POST {accion}: "espejar" (rsync desacoplado, sin --delete ni .env*) ·
 * "limpiar" (lista blanca de ids regenerables) · "aliviar" (BitNet a dormir +
 * cesión del pool de voz) · "mover"/"traer" (carpetas frías a/desde Drive, por
 * id) · "espejo-automatico" (launchd diario a las 04:00). La puerta es el
 * guardián común de `/api/mando/*`: 404 fuera de local. Jamás devuelve claves
 * ni rutas absolutas de la casa.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    aliviarMemoria,
    espejar,
    espejoAutomatico,
    leerAlmacenamiento,
    limpiarRegenerables,
    moverADrive,
    traerDeDrive,
} from "@/lib/mando/almacenamiento";

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
    id?: unknown;
    activar?: unknown;
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
        case "mover": {
            // Exige un id válido (string): el cliente manda ids, nunca rutas.
            if (typeof cuerpo.id !== "string" || cuerpo.id.length === 0) {
                return Response.json({ error: "Falta el id de la carpeta fría a mover." }, { status: 400 });
            }
            return Response.json(await moverADrive(cuerpo.id), { headers: { "Cache-Control": "no-store" } });
        }
        case "traer": {
            if (typeof cuerpo.id !== "string" || cuerpo.id.length === 0) {
                return Response.json({ error: "Falta el id de la carpeta fría a traer de vuelta." }, { status: 400 });
            }
            return Response.json(await traerDeDrive(cuerpo.id), { headers: { "Cache-Control": "no-store" } });
        }
        case "espejo-automatico": {
            if (typeof cuerpo.activar !== "boolean") {
                return Response.json({ error: "Falta el booleano «activar» para el espejo automático." }, { status: 400 });
            }
            return Response.json(await espejoAutomatico(cuerpo.activar), { headers: { "Cache-Control": "no-store" } });
        }
        default:
            return Response.json(
                { error: "Acción desconocida: usa espejar, limpiar, aliviar, mover, traer o espejo-automatico." },
                { status: 400 },
            );
    }
}
