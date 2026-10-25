/**
 * /api/mando/imaginacion (Ola 1021I · IMN1021G; Ola 1024I · IMG1024A)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que el medidor «Imaginación» necesita del disco: leer, integrar, reimaginar,
 * rechazar, posponer, decidir en lote y los ajustes (con el automático).
 * Contrato `architecture/imaginacion-autodesarrollo.md` §6 y el de la Ola 1024I §4.
 *
 * GET  `?ambito=<a>` (por defecto todos) → `{ propuestas, ajustes, resumen, actualizadoEn }`.
 * POST → `{ accion: "integrar" | "aprobar", id }`        «aprobada»; si es de Astraura, se aplica en su backend 1.58
 *        `{ accion: "reimaginar", id, notas, referencias? }` notas o al menos una referencia https
 *        `{ accion: "rechazar", id, motivo? }`
 *        `{ accion: "posponer", id, horas }`              de 1 a 720 horas
 *        `{ accion: "lote", ids: [..] | "pendientes", hacer, notas?, referencias?, motivo?, ambito? }`
 *                                                          → `{ ok, resultados: [{ id, ok, error? }] }`
 *        `{ accion: "ajustes", ajustes }`                 validados con `validarAjustes`
 *
 * ⚠️ Solo local (`guardianMando`, como el resto de /api/mando/*): 404 fuera de la
 * máquina propia. Jamás devuelve claves ni rutas del disco: los errores de
 * escritura son genéricos. Lo auxiliar vive en `src/lib/mando/imaginacion-*`.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { filtrarPorAmbito, interpretarPeticion, leerAmbito, resumenPastilla } from "@/lib/mando/imaginacion-tipos";
import { aprobar, guardarAjustes, leerAjustes, leerPropuestas, lote, posponer, rechazar, reimaginar, type Resultado } from "@/lib/mando/imaginacion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const responder = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: SIN_CACHE });

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const ambito = leerAmbito(new URL(peticion.url).searchParams.get("ambito"));
    if (ambito === null) return responder({ error: "Ámbito desconocido: usa metagenesis, personal, grupo:<id> o pagina:<id>." }, 400);
    try {
        const [todas, ajustes] = await Promise.all([leerPropuestas(), leerAjustes()]);
        const propuestas = filtrarPorAmbito(todas, ambito);
        return responder({ propuestas, ajustes, resumen: resumenPastilla(propuestas, new Date()), actualizadoEn: new Date().toISOString() });
    } catch {
        return responder({ error: "No se pudieron leer las propuestas." }, 500);
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let crudo: unknown;
    try {
        crudo = (await peticion.json()) as unknown;
    } catch {
        return responder({ error: "Cuerpo JSON inválido." }, 400);
    }
    const p = interpretarPeticion(crudo);
    if ("error" in p) return responder({ error: p.error }, 400);

    try {
        if (p.accion === "ajustes") return responder({ ok: true, ajustes: await guardarAjustes(p.ajustes) });
        if (p.accion === "lote") {
            const r = await lote(p.ids, p.hacer, { notas: p.notas, referencias: p.referencias, motivo: p.motivo }, { ambito: p.ambito, por: p.por });
            return r.error ? responder({ ok: false, error: r.error, resultados: [] }, 400) : responder(r);
        }
        let r: Resultado;
        if (p.accion === "integrar") r = await aprobar(p.id, { por: p.por });
        else if (p.accion === "reimaginar") r = await reimaginar(p.id, p.notas, p.referencias, p.por);
        else if (p.accion === "rechazar") r = await rechazar(p.id, p.motivo);
        else r = await posponer(p.id, p.horas);
        return r.ok ? responder(r) : responder({ ok: false, error: r.error }, 409);
    } catch {
        return responder({ error: "No se pudo guardar el cambio." }, 500);
    }
}
