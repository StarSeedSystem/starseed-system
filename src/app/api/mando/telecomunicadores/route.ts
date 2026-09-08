/**
 * /api/mando/telecomunicadores (Ola 287 · T1 · 2026-09-08) — SOLO local
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: plan del día de cada canal activo con telecomunicador asignado (una
 * personalidad + su cerebro), junto con los pendientes por publicar hoy.
 * POST {accion}: "generar" (canalId, plan) → genera UNA publicación con el router
 * del OS y devuelve el texto; "aprobar" (canalId, texto, formato) → SOLO registra
 * en el historial como «listo para publicar» (el envío real lo hace el panel con
 * el bot del usuario). La puerta es el guardián común de `/api/mando/*`: 404 fuera
 * de local. Jamás devuelve claves ni rutas del disco.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerCanales, leerHistorial } from "@/lib/canales/canales";
import {
    generarPublicacion,
    marcarListoParaPublicar,
    planDelDia,
    type PlanPublicacion,
} from "@/lib/canales/telecomunicadores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PeticionAccion {
    accion?: unknown;
    canalId?: unknown;
    plan?: unknown;
    texto?: unknown;
    formato?: unknown;
}

/** ¿Este canal tiene un telecomunicador asignado (personalidad + cerebro)? */
function conTelecomunicador(c: { activo: boolean; personalidadId: string | null; cerebroId: string | null }): boolean {
    return c.activo && Boolean(c.personalidadId) && Boolean(c.cerebroId);
}

/** Valida y devuelve un `PlanPublicacion` del cuerpo, o null si es inválido. */
function planValido(v: unknown): PlanPublicacion | null {
    if (typeof v !== "object" || v === null) return null;
    const p = v as Record<string, unknown>;
    if (typeof p.canalId !== "string" || typeof p.hora !== "string" || typeof p.formato !== "string" || typeof p.tema !== "string") {
        return null;
    }
    const fuente = p.fuente;
    return {
        canalId: p.canalId,
        hora: p.hora,
        formato: p.formato,
        tema: p.tema,
        fuente: fuente === "cuaderno" || fuente === "memoria" || fuente === "noticia" ? fuente : "libre",
    };
}

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const canales = await leerCanales();
    const historial = await leerHistorial(undefined, 200);
    const ahora = new Date();

    const planes = canales
        .filter(conTelecomunicador)
        .map((canal) => ({ canal, plan: planDelDia(canal, ahora, historial) }));

    return Response.json(
        { t: ahora.toISOString(), planes, pendientes: planes.reduce((acc, p) => acc + p.plan.length, 0) },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let cuerpo: PeticionAccion;
    try {
        cuerpo = (await request.json()) as PeticionAccion;
    } catch {
        return Response.json({ error: "Cuerpo JSON no válido." }, { status: 400 });
    }

    const noStore = { headers: { "Cache-Control": "no-store" } };

    switch (cuerpo.accion) {
        case "generar": {
            if (typeof cuerpo.canalId !== "string" || cuerpo.canalId.length === 0) {
                return Response.json({ error: "Falta el canalId de la publicación." }, { status: 400 });
            }
            const plan = planValido(cuerpo.plan);
            if (!plan) {
                return Response.json({ error: "Falta un plan válido (canalId, hora, formato y tema)." }, { status: 400 });
            }
            const resultado = await generarPublicacion(cuerpo.canalId, plan);
            if (!resultado.ok) return Response.json({ error: resultado.error ?? "No se pudo generar." }, { status: 502 });
            return Response.json({ ok: true, texto: resultado.texto, modelo: resultado.modelo }, noStore);
        }
        case "aprobar": {
            if (typeof cuerpo.canalId !== "string" || typeof cuerpo.texto !== "string") {
                return Response.json({ error: "Faltan canalId y texto de la publicación." }, { status: 400 });
            }
            const canal = (await leerCanales()).find((c) => c.id === cuerpo.canalId);
            if (!canal) return Response.json({ error: "Canal no encontrado." }, { status: 404 });
            await marcarListoParaPublicar(
                cuerpo.canalId,
                cuerpo.texto,
                typeof cuerpo.formato === "string" ? cuerpo.formato : "texto",
            );
            return Response.json({ ok: true }, noStore);
        }
        default:
            return Response.json(
                { error: "Acción desconocida: usa generar o aprobar." },
                { status: 400 },
            );
    }
}