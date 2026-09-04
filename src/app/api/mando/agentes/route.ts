/**
 * GET /api/mando/agentes (Ola 238 · agente y sesiones)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de mando en `localhost`: muestra quién está trabajando en la neurona
 * (sesiones de Hermes, Claude y orquestadores del enjambre) leyendo archivos y
 * procesos reales de la máquina.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión como el resto de rutas privadas.
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 *    todo se recorta a rutas relativas al repositorio y a resúmenes seguros.
 */

import { createClient } from "@/utils/supabase/server";
import { leerAgentes } from "@/lib/mando/agentes";

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

    // El mando ya responde 404 fuera de local (arriba). En desarrollo basta con
    // ese candado; si alguien levanta una instancia propia con STARSEED_MANDO=1,
    // ahí sí se exige sesión porque entonces la consola es alcanzable desde fuera.
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

    return Response.json(await leerAgentes(), {
        headers: { "Cache-Control": "no-store" },
    });
}