/**
 * GET /api/mando/grafo (Ola 239 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve el grafo de orquestación del desarrollo: olas → tareas →
 * dependencias → agente (modelo) → revisor → commit. Lo pinta la pestaña
 * «Grafo» del Centro de Mando.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve claves, tokens ni rutas absolutas del disco del usuario:
 * el grafo solo contiene identificadores y etiquetas de trabajo.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { construirGrafo } from "@/lib/mando/grafo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const grafo = await construirGrafo();
    return Response.json(grafo, { headers: { "Cache-Control": "no-store" } });
}