/**
 * GET /api/mando/neurona (Ola 258 · 2026-09-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * Salud de la neurona para la cabecera del Puente de Mando: memoria y swap,
 * demonio de voz, llama-server BitNet y Ollama. La puerta es el guardián común
 * de `/api/mando/*` (404 fuera de local; sesión solo en producción desplegada).
 * NUNCA devuelve rutas absolutas del disco: los crashes llegan como nombre de
 * archivo y el resto como resúmenes seguros.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { medirNeurona } from "@/lib/mando/neurona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const salud = await medirNeurona();
    return Response.json(salud, { headers: { "Cache-Control": "no-store" } });
}