/**
 * /api/mando/servidor — administrador de servidor de Astraura 1.58 (capa nube) — SOLO local.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: energía (despierto/batería/reposo), Astraura 1.58 (backend/BitNet/llama/
 * fondo), túnel (solo huellas, nunca la URL), servicios `com.starseed.*`,
 * enjambre, esta máquina y el registro de servidores. POST {accion}:
 * "despierto" (activar/desactivar `caffeinate -i -m -s` vía launchd) ·
 * "apagar_pantalla" (`pmset displaysleepnow`) · "reiniciar" (solo servicios de
 * la lista blanca) · "servidor_agregar"/"servidor_quitar"/"servidor_sondear"
 * (registro de servidores). Puerta: el guardián común de `/api/mando/*` (404
 * fuera de local). Nunca devuelve claves, rutas absolutas ni la URL del túnel.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { accionServidor, estadoServidor } from "@/lib/mando/servidor-astraura";
import { ETIQUETAS_REINICIABLES } from "@/lib/mando/servidor-astraura-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const estado = await estadoServidor();
    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await request.json()) as unknown;
        cuerpo = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ ok: false, error: "Cuerpo JSON no válido." }, { status: 400 });
    }

    // «reiniciar» se rechaza aquí, ANTES de tocar nada, si el servicio no está
    // en la lista blanca: es un error del que pide la petición, no un fallo de
    // ejecución, así que responde 400 en vez de 200 con `ok:false`.
    if (cuerpo.accion === "reiniciar") {
        const servicio = typeof cuerpo.servicio === "string" ? cuerpo.servicio : "";
        if (!ETIQUETAS_REINICIABLES.includes(servicio)) {
            return Response.json(
                { ok: false, error: `«${servicio || "?"}» no se puede reiniciar desde aquí.` },
                { status: 400, headers: { "Cache-Control": "no-store" } },
            );
        }
    }

    const resultado = await accionServidor(cuerpo);
    return Response.json(resultado, { headers: { "Cache-Control": "no-store" } });
}
