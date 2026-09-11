/**
 * API del panel «Publicar» (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → `leerPublicacion()`: el estado listo para el visto bueno (sin push).
 * POST → `prepararPublicacion(nota)`: deja el manifiesto en disco y lo devuelve.
 *
 * ⚠️ Solo local (el guardián devuelve 404 en producción) y NUNCA publica nada:
 * esta consola prepara y documenta; el `git push` lo firma Alex desde su terminal.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerPublicacion, prepararPublicacion } from "@/lib/mando/publicacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    try {
        const estado = await leerPublicacion();
        return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "No se pudo leer el estado de publicación." }, { status: 500 });
    }
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let nota = "";
    try {
        const cuerpo = (await request.json()) as { nota?: unknown };
        nota = typeof cuerpo.nota === "string" ? cuerpo.nota : "";
    } catch {
        return Response.json({ error: "Cuerpo no válido: envía `{ nota: \"…\" }`." }, { status: 400 });
    }

    try {
        const manifiesto = await prepararPublicacion(nota);
        return Response.json(manifiesto, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "No se pudo preparar la publicación." }, { status: 500 });
    }
}