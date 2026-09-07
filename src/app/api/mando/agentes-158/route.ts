/**
 * GET/POST /api/mando/agentes-158 (Ola 270 · 2026-09-07 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxy de la «ramificación 1.58»: el árbol vivo del backend Astraura 1.58 de
 * esta neurona (BitNet → personalidades → agentes de aprendizaje continuo →
 * procesos de fondo) para la pestaña «Procesos» del Mando.
 *
 *   GET  → `leerRama158()` (estado vivo cruzado con las personalidades del OS).
 *   POST → `{ agente, accion: "pausar" | "reanudar" | "ejecutar" }` reenviado al
 *          backend local (`POST /api/aprendizaje/agentes/{id}/{accion}`); solo
 *          esas tres acciones, 400 en cualquier otro caso.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` (404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local). Nunca devuelve claves ni rutas del disco.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    accionarAgente158,
    leerRama158,
    type AccionAgente158,
} from "@/lib/mando/agentes-158";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCIONES: AccionAgente158[] = ["pausar", "reanudar", "ejecutar"];

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const rama = await leerRama158();
    return Response.json(rama, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const agente = typeof cuerpo.agente === "string" ? cuerpo.agente.trim() : "";
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    if (!agente || !ACCIONES.includes(accion as AccionAgente158)) {
        return Response.json(
            { ok: false, error: "Acción no válida: usa pausar, reanudar o ejecutar." },
            { status: 400 },
        );
    }
    const ok = await accionarAgente158(agente, accion as AccionAgente158);
    return Response.json({ ok }, { status: ok ? 200 : 502 });
}
