/**
 * /api/mando/canales (Ola 285 · 2026-09-08) — SOLO local
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: catálogo de plataformas + canales StarSeed + historial de publicaciones.
 * POST {accion}: "guardar" (canal) · "borrar" (id) · "estado" (id, activo) ·
 * "sembrar" (desde TG_SPACES) · "publicar-prueba" (id, texto): valida y devuelve
 * `{ok, canal, texto}` SIN enviar nada —el envío a Telegram lo hace el cliente
 * con su token— para que el panel, tras enviar, llame a "registrar"
 * (canalId, texto, formato, ok, detalle?). La puerta es el guardián común de
 * `/api/mando/*`: 404 fuera de local. Jamás devuelve claves ni rutas del disco.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    PLATAFORMAS,
    borrarCanal,
    cambiarEstado,
    guardarCanal,
    leerCanales,
    leerHistorial,
    registrarPublicacion,
    sembrarDesdeTelegram,
    validarCanal,
    type CanalParcial,
} from "@/lib/canales/canales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const [canales, historial] = await Promise.all([leerCanales(), leerHistorial(undefined, 50)]);
    return Response.json(
        { t: new Date().toISOString(), plataformas: PLATAFORMAS, canales, historial },
        { headers: { "Cache-Control": "no-store" } },
    );
}

interface PeticionAccion {
    accion?: unknown;
    canal?: unknown;
    id?: unknown;
    canalId?: unknown;
    activo?: unknown;
    texto?: unknown;
    formato?: unknown;
    ok?: unknown;
    detalle?: unknown;
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
        case "guardar": {
            if (typeof cuerpo.canal !== "object" || cuerpo.canal === null) {
                return Response.json({ error: "Falta el canal a guardar." }, { status: 400 });
            }
            const parcial = cuerpo.canal as CanalParcial;
            const validado = validarCanal(parcial);
            if (!validado.ok) return Response.json({ error: validado.error }, { status: 400 });
            const canal = await guardarCanal(parcial);
            return Response.json({ ok: true, canal }, noStore);
        }
        case "borrar": {
            if (typeof cuerpo.id !== "string" || cuerpo.id.length === 0) {
                return Response.json({ error: "Falta el id del canal a borrar." }, { status: 400 });
            }
            const borrado = await borrarCanal(cuerpo.id);
            if (!borrado) return Response.json({ error: "Canal no encontrado." }, { status: 404 });
            return Response.json({ ok: true }, noStore);
        }
        case "estado": {
            if (typeof cuerpo.id !== "string" || cuerpo.id.length === 0 || typeof cuerpo.activo !== "boolean") {
                return Response.json({ error: "Faltan id y activo (booleano)." }, { status: 400 });
            }
            const cambiado = await cambiarEstado(cuerpo.id, cuerpo.activo);
            if (!cambiado) return Response.json({ error: "Canal no encontrado." }, { status: 404 });
            return Response.json({ ok: true }, noStore);
        }
        case "sembrar": {
            const creados = await sembrarDesdeTelegram();
            const canales = await leerCanales();
            return Response.json({ ok: true, creados: creados.length, canales }, noStore);
        }
        case "publicar-prueba": {
            if (typeof cuerpo.id !== "string" || cuerpo.id.length === 0 || typeof cuerpo.texto !== "string") {
                return Response.json({ error: "Faltan id y texto de la publicación." }, { status: 400 });
            }
            const canal = (await leerCanales()).find((c) => c.id === cuerpo.id);
            if (!canal) return Response.json({ error: "Canal no encontrado." }, { status: 404 });
            // No se envía nada: solo se prepara el texto para que el cliente lo mande
            // con su token y luego registre el resultado con la acción "registrar".
            return Response.json({ ok: true, canal, texto: cuerpo.texto }, noStore);
        }
        case "registrar": {
            if (typeof cuerpo.canalId !== "string" || typeof cuerpo.texto !== "string" || typeof cuerpo.ok !== "boolean") {
                return Response.json({ error: "Faltan canalId, texto y ok de la publicación." }, { status: 400 });
            }
            await registrarPublicacion({
                canalId: cuerpo.canalId,
                t: new Date().toISOString(),
                texto: cuerpo.texto,
                formato: typeof cuerpo.formato === "string" ? cuerpo.formato : "texto",
                ok: cuerpo.ok,
                detalle: typeof cuerpo.detalle === "string" ? cuerpo.detalle : undefined,
            });
            return Response.json({ ok: true }, noStore);
        }
        default:
            return Response.json(
                { error: "Acción desconocida: usa guardar, borrar, estado, sembrar, publicar-prueba o registrar." },
                { status: 400 },
            );
    }
}