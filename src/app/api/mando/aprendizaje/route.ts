/**
 * GET/POST /api/mando/aprendizaje (Ola 270 · 2026-09-07 · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxy del «aprendizaje continuo» de Astraura 1.58 para la pestaña «Aprendizaje»
 * del Centro de Mando: corpus vivo por personalidad, curación, evaluaciones,
 * crónica, fábrica y adaptadores, más las acciones de valoración y exportación.
 *
 *   GET  → `leerAprendizaje()` (lectura tolerante en disco, nunca lanza).
 *   POST → `{ accion: "valorar", id, valoracion (-1|0|1), nota }` reenviado al
 *          backend, o `{ accion: "exportar", personalidad }` para exportar el
 *          corpus a train.jsonl.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` (404 fuera de local/STARSEED_MANDO).
 * Nunca devuelve claves ni rutas absolutas del disco: la exportación devuelve
 * solo el número de turnos y una ruta RELATIVA.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    exportarCorpus,
    leerAprendizaje,
    valorarTurno,
} from "@/lib/mando/aprendizaje";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const foto = await leerAprendizaje();
    return Response.json(foto, { headers: { "Cache-Control": "no-store" } });
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

    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

    if (accion === "valorar") {
        const id = typeof cuerpo.id === "string" ? cuerpo.id.trim() : "";
        const valoracion = typeof cuerpo.valoracion === "number" ? cuerpo.valoracion : NaN;
        const nota = typeof cuerpo.nota === "string" ? cuerpo.nota : "";
        if (!id || ![ -1, 0, 1 ].includes(valoracion)) {
            return Response.json({ ok: false, error: "Valoración no válida: usa id y valoracion -1, 0 o 1." }, { status: 400 });
        }
        const ok = await valorarTurno(id, valoracion as -1 | 0 | 1, nota);
        return Response.json({ ok }, { status: ok ? 200 : 502 });
    }

    if (accion === "exportar") {
        const personalidad = typeof cuerpo.personalidad === "string" ? cuerpo.personalidad.trim() : "";
        if (!personalidad) {
            return Response.json({ ok: false, error: "Falta la personalidad a exportar." }, { status: 400 });
        }
        const resultado = await exportarCorpus(personalidad);
        return Response.json(resultado, { status: resultado.ok ? 200 : 502 });
    }

    return Response.json(
        { ok: false, error: "Acción no válida: usa valorar o exportar." },
        { status: 400 },
    );
}