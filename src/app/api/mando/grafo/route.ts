/**
 * GET /api/mando/grafo (Ola 239 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve el grafo de orquestación del desarrollo: olas → tareas →
 * dependencias → agente (modelo) → revisor → commit. Lo pinta la pestaña
 * «Grafo» del Centro de Mando.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión como el resto de rutas privadas.
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 *    el grafo solo contiene identificadores y etiquetas de trabajo.
 */

import { createClient } from "@/utils/supabase/server";
import { construirGrafo } from "@/lib/mando/grafo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comprueba si el mando está permitido en esta instancia (solo local). */
function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

export async function GET(): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }

    // Igual que el resto de rutas del mando: en desarrollo el candado de arriba
    // basta (la consola se usa en la máquina local). Si alguien levanta una
    // instancia propia con STARSEED_MANDO=1, ahí sí se exige sesión porque
    // entonces la consola es alcanzable desde fuera.
    if (process.env.NODE_ENV === "production") {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) {
                return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
            }
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }

    const grafo = await construirGrafo();
    return Response.json(grafo, { headers: { "Cache-Control": "no-store" } });
}