/**
 * Revisores continuos por área — puerta del Mando (Ola 301 · RV2 · 2026-09-09).
 *
 *   GET                        → estado de la vigilancia, sugerencias vivas y el área que tocaría ahora
 *   POST {accion:"barrido"}    → una pasada: UNA sola área, la más atrasada
 *   POST {accion:"vigilancia", activa} → enciende o apaga la vigilancia
 *   POST {accion:"aprobar", id}   → convierte la sugerencia en tarea de cola (no la lanza)
 *   POST {accion:"descartar", id} → la retira de las vivas
 *
 * AQUÍ NO ARRANCA NADA SOLO: esta ruta no programa temporizadores ni barre al
 * importarse. Quien dispara el barrido es la interfaz del Mando o una tarea
 * programada, y quien lanza la cola que sale de una aprobación es una persona.
 * Solo local: `guardianMando` devuelve 404 en producción desplegada.
 */
import { guardianMando } from "@/lib/mando/guardian";
import {
    aprobarSugerencia,
    areaQueToca,
    barridoRevisores,
    descartarSugerencia,
    estadoRevisores,
    guardarVigilancia,
    sugerenciasVivas,
} from "@/lib/mando/revisores-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60 s es el techo del plan de Vercel; un barrido en local tarda 10-40 s.
export const maxDuration = 60;

const SIN_CACHE = { "Cache-Control": "no-store" } as const;

/** Estado completo para la interfaz: vigilancia, últimas revisiones y qué toca. */
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const estado = await estadoRevisores();
    return Response.json(
        {
            vigilancia: estado.vigilancia,
            areas: Object.values(estado.areas).map((r) => ({ area: r.area, ultima: r.ultima, modelo: r.modelo, coste: r.coste, motivo: r.motivo, sugerencias: r.sugerencias.length })),
            vivas: sugerenciasVivas(estado).map((v) => ({ area: v.area, sugerencia: v.sugerencia })),
            gastadoHoyUsd: estado.gastadoHoyUsd,
            siguiente: areaQueToca(estado, new Date()),
        },
        { headers: SIN_CACHE },
    );
}

/** Acciones del Mando sobre la vigilancia. Todas explícitas, ninguna automática. */
export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown> = {};
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";

    if (accion === "barrido") {
        const r = await barridoRevisores(new Date());
        return Response.json(r, { headers: SIN_CACHE });
    }

    if (accion === "vigilancia") {
        const estado = await guardarVigilancia(cuerpo.activa === true);
        return Response.json(
            { vigilancia: estado.vigilancia, motivo: estado.vigilancia ? "Vigilancia encendida: los barridos que dispares mirarán el área más atrasada." : "Vigilancia apagada: no se pierde nada de lo ya sugerido." },
            { headers: SIN_CACHE },
        );
    }

    if (accion === "aprobar") {
        if (!id) return Response.json({ error: "Falta el id de la sugerencia." }, { status: 400 });
        const r = await aprobarSugerencia(id);
        return Response.json(r, { status: r.ok ? 200 : 404, headers: SIN_CACHE });
    }

    if (accion === "descartar") {
        if (!id) return Response.json({ error: "Falta el id de la sugerencia." }, { status: 400 });
        const r = await descartarSugerencia(id);
        return Response.json(r, { status: r.ok ? 200 : 404, headers: SIN_CACHE });
    }

    return Response.json({ error: "Acción no reconocida: usa barrido, vigilancia, aprobar o descartar." }, { status: 400 });
}
