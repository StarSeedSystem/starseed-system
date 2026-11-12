/**
 * GET /api/mando/lanzamientos/pruebas/registro?run=<id>&job=<id> (PRB1111V)
 * Las últimas líneas del paso que falló de un job de GitHub Actions, ya sin claves ni rutas del disco y con las
 * líneas largas partidas. Solo si lo pide quien mira (no se carga con el panel). Solo local (`guardianMando`).
 */

import { guardianMando } from "@/lib/mando/guardian";
import { registroDeFallo } from "@/lib/mando/pruebas-vivas-fuentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const run = url.searchParams.get("run") ?? "";
    const job = url.searchParams.get("job") ?? "";
    if (!/^\d{1,15}$/.test(run) || !/^\d{1,15}$/.test(job)) {
        return Response.json({ error: "Run o job no válidos." }, { status: 400, headers: SIN_CACHE });
    }
    const r = await registroDeFallo(Number(run), Number(job));
    if (!r) return Response.json({ error: "GitHub no devolvió el registro (¿gh sin sesión o el registro ya caducó?)." }, { status: 502, headers: SIN_CACHE });
    return Response.json(r, { headers: SIN_CACHE });
}
