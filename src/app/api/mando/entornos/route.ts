/**
 * GET /api/mando/entornos (Ola 239 · mando completo en la nube)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve los entornos vivos del proyecto (desarrollo, producción, backend,
 * bases de datos y agentes) con su salud medida en vivo y sus enlaces, SIN
 * claves ni rutas absolutas del disco.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • En producción se exige además una sesión válida.
 *  • NUNCA devuelve claves, tokens, contraseñas ni cadenas de conexión: solo
 *    NOMBRES de variables de entorno y URLs públicas o locales.
 */

import { createClient } from "@/utils/supabase/server";
import { leerEntornos } from "@/lib/mando/entornos";

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

    // En producción la consola es alcanzable desde fuera: se exige sesión.
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

    const entornos = await leerEntornos();

    return Response.json(
        { entornos, generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}