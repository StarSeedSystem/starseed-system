/**
 * GET/POST /api/mando/oficina (Ola 272 · 2026-09-07 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * La Oficina 3D del Mando: los seres reales de la orquestación (escritores,
 * revisores, agentes 1.58, personalidades, procesos de fondo y BitNet) con su
 * sala, actividad viva y genoma evolutivo.
 *
 *   GET  → `leerOficina()` (estado vivo + genoma persistido).
 *   POST → `{ accion: "exportar-predeterminado", id }` exporta el ser como
 *          versión predeterminada; el id se valida antes de tocar el disco.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` (404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local). Nunca devuelve claves ni rutas del disco.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { exportarPredeterminado, leerOficina } from "@/lib/mando/oficina-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** El id de un ser: prov/modelo o familia:id; corto y sin espacios. */
const ID_VALIDO = /^[a-zA-Z0-9/_.:-]{1,80}$/;

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const oficina = await leerOficina();
    return Response.json(oficina, { headers: { "Cache-Control": "no-store" } });
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
    if (cuerpo.accion !== "exportar-predeterminado") {
        return Response.json({ ok: false, error: "Acción no válida: usa «exportar-predeterminado»." }, { status: 400 });
    }
    const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
    if (!ID_VALIDO.test(id)) {
        return Response.json({ ok: false, error: "Id de ser no válido." }, { status: 400 });
    }
    const exportado = await exportarPredeterminado(id);
    if (!exportado) {
        return Response.json({ ok: false, error: "Ese ser todavía no tiene genoma en la oficina." }, { status: 404 });
    }
    return Response.json({ ok: true, ruta: exportado.ruta, ser: exportado.ser });
}
