/**
 * GET /api/mando/agentes (Ola 238 · agente y sesiones)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de mando en `localhost`: muestra quién está trabajando en la neurona
 * (sesiones de Hermes, Claude y orquestadores del enjambre) leyendo archivos y
 * procesos reales de la máquina.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve claves, tokens ni rutas absolutas del disco del usuario:
 * todo se recorta a rutas relativas al repositorio y a resúmenes seguros.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerAgentes } from "@/lib/mando/agentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    return Response.json(await leerAgentes(), {
        headers: { "Cache-Control": "no-store" },
    });
}