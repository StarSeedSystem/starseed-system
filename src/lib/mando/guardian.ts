/**
 * Guardián común de las rutas `/api/mando/*` (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * 404 fuera de local (salvo `STARSEED_MANDO=1`); en producción, además, sesión.
 * Devuelve la respuesta de veto o `null` si se puede seguir.
 */

import { createClient } from "@/utils/supabase/server";

export function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

export async function guardianMando(): Promise<Response | null> {
    if (!mandoHabilitado()) return new Response("Not Found", { status: 404 });
    if (process.env.NODE_ENV === "production") {
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
