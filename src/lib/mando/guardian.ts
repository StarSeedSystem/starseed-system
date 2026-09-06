/**
 * Guardián común de las rutas `/api/mando/*` (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * 404 fuera de local (salvo `STARSEED_MANDO=1`); en producción desplegada,
 * además, sesión. En un despliegue LOCAL (modo ligero en la neurona, Ola 253 ·
 * 2026-09-06) la consola pasa SIN sesión: es la misma puerta que la de la voz
 * (`esDespliegueLocal`), porque exigir login en la propia máquina dejaba el
 * Puente de Mando apagado justo donde tiene que usarse.
 * Devuelve la respuesta de veto o `null` si se puede seguir.
 */

import { createClient } from "@/utils/supabase/server";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";

/**
 * Cierto si el mando está habilitado en esta instancia:
 *  - `NODE_ENV !== "production"` (desarrollo y tests), o
 *  - `STARSEED_MANDO=1`, o
 *  - la petición llega a un despliegue local (`esDespliegueLocal`: localhost,
 *    127.0.0.1, *.local o `STARSEED_LOCAL=1`; nunca en Vercel).
 */
export function mandoHabilitado(req?: Request): boolean {
    if (process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1") return true;
    return req ? esDespliegueLocal(req) : false;
}

/**
 * Puerta única de `/api/mando/*`: 404 si la consola está apagada en esta
 * instancia; sesión obligatoria solo en producción NO local; en local pasa
 * sin sesión (la máquina ya es el perímetro de confianza).
 */
export async function guardianMando(req?: Request): Promise<Response | null> {
    if (!mandoHabilitado(req)) return new Response("Not Found", { status: 404 });
    if (process.env.NODE_ENV === "production" && !(req && esDespliegueLocal(req))) {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }
    return null;
}
