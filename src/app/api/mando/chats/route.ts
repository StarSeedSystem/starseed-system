/**
 * /api/mando/chats — los chats del asistente técnico del Mando (los mismos para la orbe y
 * para la pestaña Chat). Se guardan en `starseed_memory_root/mando/chats/` (no versionado).
 *
 * GET            → lista de chats
 * GET ?id=…      → un chat completo
 * POST {accion:"crear", titulo?, modelo?} · {accion:"borrar", id} · {accion:"renombrar", id, titulo}
 */
import { guardianMando } from "@/lib/mando/guardian";
import { borrarChat, crearChat, guardarChat, leerChat, listarChats } from "@/lib/mando/asistente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando();
    if (veto) return veto;
    const id = new URL(peticion.url).searchParams.get("id");
    if (id) {
        const chat = await leerChat(id).catch(() => null);
        return chat ? Response.json({ chat }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Chat no encontrado." }, { status: 404 });
    }
    return Response.json({ chats: await listarChats() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando();
    if (veto) return veto;
    let cuerpo: Record<string, unknown> = {};
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    try {
        if (accion === "crear") {
            const chat = await crearChat(typeof cuerpo.titulo === "string" ? cuerpo.titulo : "", typeof cuerpo.modelo === "string" ? cuerpo.modelo : "nim/moonshotai/kimi-k3");
            return Response.json({ chat }, { headers: { "Cache-Control": "no-store" } });
        }
        if (accion === "borrar" && typeof cuerpo.id === "string") {
            return Response.json({ ok: await borrarChat(cuerpo.id) });
        }
        if (accion === "renombrar" && typeof cuerpo.id === "string" && typeof cuerpo.titulo === "string") {
            const chat = await leerChat(cuerpo.id);
            if (!chat) return Response.json({ error: "Chat no encontrado." }, { status: 404 });
            chat.titulo = cuerpo.titulo.trim().slice(0, 80) || chat.titulo;
            await guardarChat(chat);
            return Response.json({ chat });
        }
    } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Error." }, { status: 400 });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
