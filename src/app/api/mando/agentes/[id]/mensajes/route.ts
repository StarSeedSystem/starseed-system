import { guardianMando } from "@/lib/mando/guardian";
import { leerMensajesAgente, guardarMensajeAgente } from "@/lib/mando/mensajes-agente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Contexto): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const { id } = await ctx.params;
    const mensajes = await leerMensajesAgente(id);
    return Response.json({ mensajes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Contexto): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const { id } = await ctx.params;
    try {
        const body = (await req.json()) as { texto?: string };
        const texto = typeof body.texto === "string" ? body.texto.trim() : "";
        if (!texto) {
            return Response.json({ error: "El mensaje no puede estar vacío." }, { status: 400 });
        }
        const mensaje = await guardarMensajeAgente(id, texto, "alex");
        return Response.json({ ok: true, mensaje }, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "Petición inválida." }, { status: 400 });
    }
}
