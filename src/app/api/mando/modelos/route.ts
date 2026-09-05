/**
 * GET /api/mando/modelos — todos los modelos que esta máquina puede usar ahora
 * (xKiro gratuitos, NIM, aihubmix, tokenrouter, OpenRouter, Gemini, Ollama local) con la
 * salud del supervisor del enjambre. Nunca devuelve claves.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { listarModelos } from "@/lib/mando/modelos-disponibles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
    const veto = await guardianMando();
    if (veto) return veto;
    const modelos = await listarModelos();
    return Response.json({ modelos, generadoEn: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
