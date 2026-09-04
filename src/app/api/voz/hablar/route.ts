/**
 * POST /api/voz/hablar (Ola 228)
 * ─────────────────────────────────────────────────────────────────────────────
 * Síntesis por el demonio local de voz (`127.0.0.1:4500`, ver
 * `src/lib/aurora/voz-starseed/daemon.ts`). Recibe `{ texto, voz?, speed?,
 * instruct? }` y devuelve el audio (WAV 24 kHz). Si el demonio está apagado o
 * falla, responde 503 y el cliente baja de nivel con el mismo timbre.
 *
 * Reglas: exige sesión (como el resto de `/api/ai/*`), rate-limit por usuario,
 * cuerpo saneado y tope de longitud, y jamás acepta una URL del cliente ni
 * expone rutas absolutas del disco.
 */

import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { sintetizarEnDaemon } from "@/lib/aurora/voz-starseed/daemon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longitud máxima del texto a sintetizar (caracteres). */
const MAX_TEXTO = 4000;

export async function POST(req: Request): Promise<Response> {
    let userId: string | null = null;
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return Response.json({ error: "Necesitas iniciar sesión para hablar por esta neurona." }, { status: 401 });
        }
        userId = data.user.id;
    } catch {
        return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }

    const rl = rateLimit(`voz-hablar:${userId}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) {
        return Response.json(
            { error: "Demasiadas síntesis. Inténtalo más tarde." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
    }

    let cuerpo: { texto?: unknown; voz?: unknown; speed?: unknown; instruct?: unknown };
    try {
        cuerpo = (await req.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    if (typeof cuerpo.texto !== "string" || !cuerpo.texto.trim()) {
        return Response.json({ error: "Falta el texto a sintetizar." }, { status: 400 });
    }
    const texto = cuerpo.texto.trim().slice(0, MAX_TEXTO);
    const voz = typeof cuerpo.voz === "string" && cuerpo.voz.trim() ? cuerpo.voz.trim().slice(0, 80) : "default";
    const speed =
        typeof cuerpo.speed === "number" && Number.isFinite(cuerpo.speed)
            ? Math.min(2, Math.max(0.5, cuerpo.speed))
            : 1;
    const instruct =
        typeof cuerpo.instruct === "string" && cuerpo.instruct.trim()
            ? cuerpo.instruct.trim().slice(0, 240)
            : undefined;

    const sintesis = await sintetizarEnDaemon(texto, { voz, speed, instruct });
    if (!sintesis) {
        return Response.json(
            { error: "El demonio de voz de esta neurona está apagado o no respondió." },
            { status: 503 },
        );
    }

    return new Response(sintesis.audio, {
        status: 200,
        headers: {
            "Content-Type": sintesis.tipo,
            "Cache-Control": "no-store",
        },
    });
}
