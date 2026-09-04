/**
 * POST /api/movimiento/generar (Ola 229 · M2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Generación de un clip de movimiento por el demonio local Kimodo
 * (`127.0.0.1:4600`, ver `src/lib/avatares/movimiento/daemon.ts`). Recibe
 * `{ prompt, esqueleto, segundos, semilla? }` y devuelve el clip
 * (esqueleto, fps, duración, rotaciones y traslación de raíz). Si el demonio
 * está apagado o falla, responde 503 y el motor único baja de nivel con el
 * mismo carácter de gesto. La caché del servidor hace que los gestos que se
 * repiten no recalculen en el demonio.
 *
 * Reglas: exige sesión (como el resto de `/api/ai/*`), rate-limit por usuario
 * igual que `/api/ai/nvidia`, cuerpo saneado y validado, y jamás acepta una
 * URL del cliente ni expone rutas absolutas del disco.
 */

import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esEsqueletoAdmitido, generarMovimiento } from "@/lib/avatares/movimiento/daemon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Longitud máxima de la descripción del gesto (caracteres). */
const MAX_PROMPT = 300;
/** Duración mínima del clip, en segundos. */
const MIN_SEGUNDOS = 0.5;
/** Duración máxima del clip, en segundos. */
const MAX_SEGUNDOS = 10;

export async function POST(req: Request): Promise<Response> {
    let userId: string | null = null;
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            return Response.json(
                { error: "Necesitas iniciar sesión para generar movimiento en esta neurona." },
                { status: 401 },
            );
        }
        userId = data.user.id;
    } catch {
        return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
    }

    const rl = rateLimit(`movimiento-generar:${userId}`, 30, 10 * 60 * 1000);
    if (!rl.allowed) {
        return Response.json(
            { error: "Demasiadas generaciones de movimiento. Inténtalo más tarde." },
            { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
    }

    let cuerpo: { prompt?: unknown; esqueleto?: unknown; segundos?: unknown; semilla?: unknown };
    try {
        cuerpo = (await req.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    if (typeof cuerpo.prompt !== "string" || !cuerpo.prompt.trim()) {
        return Response.json({ error: "Falta la descripción del gesto (prompt)." }, { status: 400 });
    }
    const prompt = cuerpo.prompt.trim();
    if (prompt.length > MAX_PROMPT) {
        return Response.json(
            { error: `La descripción del gesto no puede pasar de ${MAX_PROMPT} caracteres.` },
            { status: 400 },
        );
    }

    if (!esEsqueletoAdmitido(cuerpo.esqueleto)) {
        return Response.json(
            { error: "Esqueleto no válido: debe ser smplx22, soma30 o g1-34." },
            { status: 400 },
        );
    }
    const esqueleto = cuerpo.esqueleto;

    if (
        typeof cuerpo.segundos !== "number" ||
        !Number.isFinite(cuerpo.segundos) ||
        cuerpo.segundos < MIN_SEGUNDOS ||
        cuerpo.segundos > MAX_SEGUNDOS
    ) {
        return Response.json(
            { error: `La duración debe estar entre ${String(MIN_SEGUNDOS).replace(".", ",")} y ${MAX_SEGUNDOS} segundos.` },
            { status: 400 },
        );
    }

    let semilla: number | undefined;
    if (cuerpo.semilla !== undefined && cuerpo.semilla !== null) {
        if (typeof cuerpo.semilla !== "number" || !Number.isFinite(cuerpo.semilla)) {
            return Response.json({ error: "La semilla debe ser un número." }, { status: 400 });
        }
        semilla = Math.floor(cuerpo.semilla);
    }

    const clip = await generarMovimiento(prompt, { esqueleto, segundos: cuerpo.segundos, semilla });
    if (!clip) {
        return Response.json(
            { error: "El demonio de movimiento de esta neurona está apagado o no respondió." },
            { status: 503 },
        );
    }

    return Response.json(clip, { headers: { "Cache-Control": "no-store" } });
}
