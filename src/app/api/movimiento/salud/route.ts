/**
 * GET /api/movimiento/salud (Ola 229 · M2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sondeo del demonio local de movimiento Kimodo (`127.0.0.1:4600`, ver
 * `src/lib/avatares/movimiento/daemon.ts`). Devuelve vivo/apagado, latencia,
 * modelo y esqueletos. Solo tiene sentido donde el servidor del OS corre en
 * la MISMA neurona que el demonio (desarrollo, Tauri, autoalojado); si no
 * está, se devuelve `vivo: false` con 200 para que el cliente elija otro
 * nivel del motor de movimiento.
 *
 * Reglas: exige sesión (como el resto de `/api/ai/*`), nunca acepta una URL
 * del cliente y jamás expone rutas absolutas del disco.
 */

import { createClient } from "@/utils/supabase/server";
import { PUERTO_MOVIMIENTO, saludDaemonMovimiento } from "@/lib/avatares/movimiento/daemon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        }
    } catch {
        return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }

    const salud = await saludDaemonMovimiento(800);
    return Response.json(
        {
            vivo: salud.vivo,
            latenciaMs: salud.latenciaMs,
            modelo: salud.modelo,
            esqueletos: salud.esqueletos,
            puerto: PUERTO_MOVIMIENTO,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
