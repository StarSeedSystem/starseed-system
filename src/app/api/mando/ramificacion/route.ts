/**
 * GET /api/mando/ramificacion (Ola 241 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * El árbol vivo de las olas: tareas → dependencias → agente (modelo, proveedor,
 * fase, tokens, ventana) → revisor → commit, cruzando disco, bus y latidos.
 *
 * `?olas=N` limita a las N olas más recientes (por defecto 4, máximo 30).
 *
 * ⚠️ Seguridad: solo en local (404 fuera); sesión exigida en producción; jamás
 * devuelve claves ni rutas absolutas del disco del usuario.
 */

import { createClient } from "@/utils/supabase/server";
import { construirRamificacion } from "@/lib/mando/ramificacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

export async function GET(peticion: Request): Promise<Response> {
    if (!mandoHabilitado()) {
        return new Response("Not Found", { status: 404 });
    }
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
    const url = new URL(peticion.url);
    const pedidas = Number.parseInt(url.searchParams.get("olas") ?? "4", 10);
    const cuantas = Number.isFinite(pedidas) ? Math.min(30, Math.max(1, pedidas)) : 4;
    const ramificacion = await construirRamificacion(cuantas);
    return Response.json(ramificacion, { headers: { "Cache-Control": "no-store" } });
}
