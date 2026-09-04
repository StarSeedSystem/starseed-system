/**
 * GET /api/voz/salud (Ola 228)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sondeo del demonio local de voz (`127.0.0.1:4500`, ver
 * `src/lib/aurora/voz-starseed/daemon.ts`). Devuelve vivo/apagado, latencia y
 * modelo. Solo tiene sentido donde el servidor del OS corre en la MISMA
 * neurona que el demonio (desarrollo, Tauri, autoalojado); si no está, se
 * devuelve `vivo: false` con 200 para que el cliente elija otro nivel.
 *
 * Reglas: exige sesión (como el resto de `/api/ai/*`), nunca acepta una URL
 * del cliente y jamás expone rutas absolutas del disco.
 */

import { createClient } from "@/utils/supabase/server";
import { PUERTO_VOZ, saludDaemon } from "@/lib/aurora/voz-starseed/daemon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
    // El rito de bienvenida habla ANTES de que exista sesión: exigirla aquí dejaba la voz
    // neuronal fuera de la primera pantalla y el OS caía a la voz robótica del navegador.
    // El demonio vive en 127.0.0.1 y no toca datos del usuario; en producción no existe.
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

    const salud = await saludDaemon(800);
    return Response.json(
        {
            vivo: salud.vivo,
            latenciaMs: salud.latenciaMs,
            modelo: salud.modelo,
            puerto: PUERTO_VOZ,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
