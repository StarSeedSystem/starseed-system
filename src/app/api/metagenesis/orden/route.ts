/**
 * POST /api/metagenesis/orden — una persona con acceso a MetaGenesis manda una orden a los nodos
 * desde CUALQUIER neurona (OPA1011, 2026-10-10).
 *
 * Exige `Authorization: Bearer <token de la sesión>` (nunca cookie: así otra web no puede mandar
 * órdenes en nombre de nadie), comprueba que la cuenta es miembro (`es_metagenesis()`), valida la
 * orden con la lista blanca, la FIRMA con `STARSEED_LANZADOR_SECRETO` y la publica en el bus
 * (`relevo_eventos`), donde la recoge el nodo líder. Funciona igual en Vercel que en la Mac: no
 * es una ruta de `/api/mando/*`. Lógica: `src/lib/metagenesis/remoto-orden-servidor.ts`.
 * SOP: architecture/metagenesis-autonoma.md
 */

import { depsDeEntorno, procesarOrden, tokenDeCabecera } from "@/lib/metagenesis/remoto-orden-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_CUERPO = 4096;

export async function POST(req: Request): Promise<Response> {
    const token = tokenDeCabecera(req.headers.get("authorization"));
    const texto = await req.text().catch(() => "");
    if (texto.length > MAX_CUERPO) return Response.json({ ok: false, error: "Orden demasiado grande." }, { status: 413 });
    let cuerpo: unknown = null;
    try {
        cuerpo = texto ? JSON.parse(texto) : null;
    } catch {
        return Response.json({ ok: false, error: "La orden no es JSON." }, { status: 400 });
    }
    const r = await procesarOrden(cuerpo, token, depsDeEntorno());
    return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
