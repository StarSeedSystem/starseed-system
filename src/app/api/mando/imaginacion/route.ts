/**
 * /api/mando/imaginacion (Ola 1021I · IMN1021G)
 * ─────────────────────────────────────────────────────────────────────────────
 * La parte del panel Imaginación que NO dibuja IMN1021H: leer, aprobar,
 * rechazar, posponer y ajustes. Contrato `architecture/imaginacion-autodesarrollo.md` §6.
 *
 * GET  → `{ propuestas, ajustes }` normalizados (sin rutas del disco).
 * POST → `{ accion: "aprobar", id }`          la marca; si es de Astraura la aplica en su backend 1.58
 *        `{ accion: "rechazar", id, motivo?}`
 *        `{ accion: "posponer", id, horas }`
 *        `{ accion: "ajustes", ajustes }`     validados con `validarAjustes`
 *
 * ⚠️ Solo local (`guardianMando`, como el resto de /api/mando/*): 404 fuera de la
 * máquina propia. Jamás devuelve claves ni rutas del disco: los errores de
 * escritura son genéricos.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    aprobarPropuesta,
    guardarAjustes,
    leerAjustes,
    leerPropuestas,
    posponerPropuesta,
    rechazarPropuesta,
} from "@/lib/mando/imaginacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const [propuestas, ajustes] = await Promise.all([leerPropuestas(), leerAjustes()]);
    return Response.json({ propuestas, ajustes }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (cuerpoCheck(crudo)) throw new Error("no-objeto");
        cuerpo = crudo as Record<string, unknown>;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

    if (accion === "aprobar") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
        if (!id) return Response.json({ error: "Falta el id de la propuesta." }, { status: 400 });
        const r = await aprobarPropuesta(id);
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "rechazar") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
        if (!id) return Response.json({ error: "Falta el id de la propuesta." }, { status: 400 });
        const motivo = typeof cuerpo.motivo === "string" ? cuerpo.motivo : "";
        const r = await rechazarPropuesta(id, motivo);
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "posponer") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
        const horas = typeof cuerpo.horas === "number" ? cuerpo.horas : Number(cuerpo.horas);
        if (!id) return Response.json({ error: "Falta el id de la propuesta." }, { status: 400 });
        const r = await posponerPropuesta(id, horas);
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "ajustes") {
        const r = await guardarAjustes(cuerpo.ajustes);
        if (!r.ok) return Response.json({ error: r.error }, { status: 400 });
        return Response.json({ ok: true, ajustes: r.valor }, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Acción desconocida: usa aprobar, rechazar, posponer o ajustes." }, { status: 400 });
}

function cuerpoCheck(v: unknown): boolean {
    return typeof v !== "object" || v === null || Array.isArray(v);
}
