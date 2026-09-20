/**
 * GET /api/mando/uso-claude (Ola 352 · MU1 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve el resumen de gasto de las sesiones de Claude Code de esta Mac
 * (tokens por tipo y % de relectura de caché), leído de
 * `~/.claude/projects/*.jsonl`. Nunca expone rutas ni contenido: solo números.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { resumirSesionesClaude } from "@/lib/mando/uso-claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const resumen = await resumirSesionesClaude();
    return Response.json(resumen, { headers: { "Cache-Control": "no-store" } });
}
