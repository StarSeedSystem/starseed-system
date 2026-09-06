/**
 * GET /api/mando/contextos (Ola 239 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve el contexto que recibió cada tarea del enjambre (leído de
 * `starseed_memory_root/olas/contextos/`), normalizado y ordenado por lo más
 * reciente. Consume `leerContextos()` de `src/lib/mando/contextos.ts`.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 * solo los textos de contexto y rutas relativas al repositorio.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerContextos } from "@/lib/mando/contextos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const contextos = await leerContextos();
    return Response.json({ contextos }, { headers: { "Cache-Control": "no-store" } });
}