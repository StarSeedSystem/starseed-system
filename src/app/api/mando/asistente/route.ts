/**
 * POST /api/mando/asistente — un turno con el asistente técnico del Mando.
 *
 *   {chatId, modelo, mensaje}            → responde con el modelo elegido (estado vivo + memorias)
 *   {accion:"leer", chatId?, ruta}       → lee un archivo permitido y, si hay chat, lo añade como turno «herramienta»
 *
 * El modelo solo PROPONE acciones (lanzar/detener/ver_tarea/leer); las ejecuta la interfaz,
 * las de lanzar/detener con confirmación humana y por `/api/mando/colas`.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { guardarChat, leerArchivoPermitido, leerChat, responder, crearChat } from "@/lib/mando/asistente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

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
    const chatId = typeof cuerpo.chatId === "string" ? cuerpo.chatId : "";

    if (cuerpo.accion === "leer") {
        const ruta = typeof cuerpo.ruta === "string" ? cuerpo.ruta : "";
        const r = await leerArchivoPermitido(ruta);
        if (r.ok && chatId) {
            const chat = await leerChat(chatId).catch(() => null);
            if (chat) {
                chat.mensajes.push({ rol: "herramienta", texto: `${r.ruta} (${r.bytes} bytes):\n${r.contenido}`, t: new Date().toISOString() });
                await guardarChat(chat);
            }
        }
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    const mensaje = typeof cuerpo.mensaje === "string" ? cuerpo.mensaje.trim() : "";
    const modelo = typeof cuerpo.modelo === "string" && cuerpo.modelo.includes("/") ? cuerpo.modelo : "nim/moonshotai/kimi-k3";
    if (!mensaje) return Response.json({ error: "Falta el mensaje." }, { status: 400 });
    let chat = chatId ? await leerChat(chatId).catch(() => null) : null;
    if (!chat) chat = await crearChat(mensaje.slice(0, 60), modelo);
    try {
        const r = await responder(chat, mensaje, modelo);
        return Response.json(
            { chatId: r.chat.id, titulo: r.chat.titulo, respuesta: r.respuesta, acciones: r.acciones },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (e) {
        // El mensaje del usuario ya quedó guardado en el chat; se devuelve el fallo del proveedor.
        await guardarChat(chat).catch(() => undefined);
        return Response.json({ chatId: chat.id, error: e instanceof Error ? e.message : "El modelo no respondió." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
}
