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

import { PUERTO_VOZ, saludDaemon } from "@/lib/aurora/voz-starseed/daemon";
import { exigirSesionSalvoLocal } from "@/lib/aurora/voz-starseed/puerta-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    // El rito de bienvenida habla ANTES de que exista sesión: exigirla aquí dejaba la voz
    // neuronal fuera de la primera pantalla y el OS caía a la voz robótica del navegador.
    // El demonio vive en 127.0.0.1 y no toca datos del usuario. La sesión solo se exige
    // en producción desplegada (Vercel); en producción LOCAL (modo ligero en la Mac,
    // 2026-09-06) la puerta local la deja pasar.
    const puerta = await exigirSesionSalvoLocal(request);
    if (puerta) return puerta;

    const salud = await saludDaemon(800);
    return Response.json(
        {
            vivo: salud.vivo,
            latenciaMs: salud.latenciaMs,
            modelo: salud.modelo,
            // (2026-09-06, Ola 251) el cliente distingue «despertando» de «apagado»
            // y enseña la memoria libre (poca memoria = despertar más lento).
            estado: salud.estado,
            despertandoDesdeMs: salud.despertandoDesdeMs,
            memoriaLibreMb: salud.memoriaLibreMb,
            puerto: PUERTO_VOZ,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
