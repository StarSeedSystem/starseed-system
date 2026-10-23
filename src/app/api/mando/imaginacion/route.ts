/**
 * /api/mando/imaginacion (Ola 1021I · IMN1021G)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que el medidor «Imaginación» necesita del disco: leer, aprobar, rechazar,
 * posponer y ajustes. Contrato `architecture/imaginacion-autodesarrollo.md` §6.
 *
 * GET  → `{ propuestas, ajustes }` normalizados (sin rutas del disco).
 * POST → `{ accion: "aprobar", id }`           «aprobada»; si es de Astraura, se aplica en su backend 1.58
 *        `{ accion: "rechazar", id, motivo? }`
 *        `{ accion: "posponer", id, horas }`    de 1 a 720 horas
 *        `{ accion: "ajustes", ajustes }`       validados con `validarAjustes`
 *
 * ⚠️ Solo local (`guardianMando`, como el resto de /api/mando/*): 404 fuera de la
 * máquina propia. Jamás devuelve claves ni rutas del disco: los errores de
 * escritura son genéricos.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { aprobar, guardarAjustes, leerAjustes, leerPropuestas, posponer, rechazar, type Resultado } from "@/lib/mando/imaginacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const responder = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: SIN_CACHE });

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    try {
        const [propuestas, ajustes] = await Promise.all([leerPropuestas(), leerAjustes()]);
        return responder({ propuestas, ajustes, actualizadoEn: new Date().toISOString() });
    } catch {
        return responder({ error: "No se pudieron leer las propuestas." }, 500);
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) throw new Error("no-objeto");
        cuerpo = crudo as Record<string, unknown>;
    } catch {
        return responder({ error: "Cuerpo JSON inválido." }, 400);
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";

    try {
        if (accion === "ajustes") return responder({ ok: true, ajustes: await guardarAjustes(cuerpo.ajustes) });
        let r: Resultado;
        if (accion === "aprobar" || accion === "rechazar" || accion === "posponer") {
            if (!id) return responder({ error: "Falta el id de la propuesta." }, 400);
            if (accion === "aprobar") r = await aprobar(id);
            else if (accion === "rechazar") r = await rechazar(id, typeof cuerpo.motivo === "string" ? cuerpo.motivo : "");
            else r = await posponer(id, typeof cuerpo.horas === "number" ? cuerpo.horas : Number(cuerpo.horas));
        } else {
            return responder({ error: "Acción desconocida: usa aprobar, rechazar, posponer o ajustes." }, 400);
        }
        return r.ok ? responder(r) : responder({ ok: false, error: r.error }, 409);
    } catch {
        return responder({ error: "No se pudo guardar el cambio." }, 500);
    }
}
