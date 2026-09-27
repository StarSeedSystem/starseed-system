/**
 * GET /api/mando/radio-local — Wi-Fi y Bluetooth vistos por el SISTEMA de la Mac
 * (`system_profiler`), para el radar del OS servido en local. Solo local: en producción
 * el guardián devuelve 404. Nunca devuelve direcciones MAC (Ola 375 · RDV10).
 */
import { guardianMando } from "@/lib/mando/guardian";
import { leerRadioLocal } from "@/lib/mando/radio-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const lectura = await leerRadioLocal();
    return Response.json(lectura, { headers: { "Cache-Control": "no-store" } });
}
