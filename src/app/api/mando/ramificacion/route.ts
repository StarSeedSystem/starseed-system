/**
 * GET /api/mando/ramificacion (Ola 241 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * El árbol vivo de las olas: tareas → dependencias → agente (modelo, proveedor,
 * fase, tokens, ventana) → revisor → commit, cruzando disco, bus y latidos.
 *
 * `?olas=N` limita a las N olas más recientes (por defecto 4, máximo 30).
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * Nunca devuelve claves ni rutas absolutas del disco del usuario.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { construirRamificacion } from "@/lib/mando/ramificacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const pedidas = Number.parseInt(url.searchParams.get("olas") ?? "4", 10);
    const cuantas = Number.isFinite(pedidas) ? Math.min(30, Math.max(1, pedidas)) : 4;
    const ramificacion = await construirRamificacion(cuantas);
    return Response.json(ramificacion, { headers: { "Cache-Control": "no-store" } });
}
