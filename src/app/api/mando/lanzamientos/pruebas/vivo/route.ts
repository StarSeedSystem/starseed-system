/**
 * GET /api/mando/lanzamientos/pruebas/vivo (PRB1111V)
 * ─────────────────────────────────────────────────────────────────────────────
 * Todo lo que pinta el panel «Pruebas» de Genesis en una sola lectura: las versiones de prueba con su build por
 * plataforma (pasos, tiempos típicos), el estado del director de pruebas, la evidencia de los aparatos, las
 * peticiones recientes, la cola local, los instaladores del prerelease y qué corre ahora. Solo local
 * (`guardianMando`); nunca devuelve rutas del disco ni claves. Cada archivo que falta es un estado, no un fallo.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { reunirVivo } from "@/lib/mando/pruebas-vivas-fuentes";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    try {
        return Response.json(await reunirVivo({ aprobarAqui: esPeticionDeEstaMaquina(peticion) }), { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "No se pudieron leer las pruebas." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
}
