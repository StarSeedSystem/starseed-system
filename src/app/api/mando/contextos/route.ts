/**
 * GET /api/mando/contextos (Ola 239 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve el contexto que recibió cada tarea del enjambre (leído de
 * `starseed_memory_root/olas/contextos/`), normalizado y ordenado por lo más
 * reciente. Consume `leerContextos()` de `src/lib/mando/contextos.ts`.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión como el resto de rutas privadas solo cuando hay un despliegue
 *    alcanzable desde fuera (ver candado de `estado/route.ts`).
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 *    solo los textos de contexto y rutas relativas al repositorio.
 */

import { createClient } from "@/utils/supabase/server";
import { leerContextos } from "@/lib/mando/contextos";

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

    // El mando ya responde 404 fuera de local (arriba). En producción exigimos además
    // sesión porque ahí la consola es alcanzable desde fuera; en desarrollo basta con
    // el candado local, igual que en `GET /api/mando/estado`.
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

    const contextos = await leerContextos();
    return Response.json({ contextos }, { headers: { "Cache-Control": "no-store" } });
}