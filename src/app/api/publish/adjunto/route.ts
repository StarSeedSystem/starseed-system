// POST /api/publish/adjunto
// Recibe por CUERPO JSON (nunca por querystring) el ítem que el Finder quiere
// publicar, lo recorta a los campos imprescindibles y devuelve solo ese recorte.
// El cliente guarda la respuesta en su pestaña y navega a /publish con un flag
// mínimo: el objeto completo no queda en el historial ni en los logs del
// servidor. No se registra el cuerpo en ningún log.

import { recortarAdjunto } from "@/lib/library/publicar-seguro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
    let cuerpo: unknown;
    try {
        cuerpo = await request.json();
    } catch {
        return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    const adjunto = recortarAdjunto(cuerpo);
    if (!adjunto) {
        return Response.json(
            { ok: false, error: "Faltan título o destino (url/route) para publicar." },
            { status: 400 },
        );
    }

    return Response.json(
        { ok: true, adjunto },
        { headers: { "Cache-Control": "no-store" } },
    );
}
