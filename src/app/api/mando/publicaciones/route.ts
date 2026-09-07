/**
 * GET/POST /api/mando/publicaciones (Ola 274 · 2026-09-07 · Publicaciones del Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → commits sin publicar del OS y de Astraura (agrupados por ola, con
 *        diffstat, base remota y si el remoto se movió) + bitácora reciente.
 *        `?trabajo=<id>` → estado de una publicación en curso/terminada.
 * POST `{ accion: "publicar", repo, modo, hasta?, confirmacion, quien? }`
 *      → lanza la publicación desacoplada (solo en la Mac, con confirmación
 *        escrita; responde al instante con el id del trabajo).
 *
 * ⚠️ Solo local (`guardianMando`); jamás devuelve claves ni rutas del disco
 * (las rutas se enmascaran con `~` en `leerPendientes`).
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerTodo, leerTrabajo, publicar } from "@/lib/mando/publicaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const trabajo = url.searchParams.get("trabajo");
    if (trabajo) {
        const t = await leerTrabajo(trabajo);
        if (!t) return Response.json({ error: "Trabajo no encontrado." }, { status: 404 });
        return Response.json(t, { headers: { "Cache-Control": "no-store" } });
    }
    const todo = await leerTodo();
    return Response.json(todo, { headers: { "Cache-Control": "no-store" } });
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
    if (cuerpo.accion !== "publicar") return Response.json({ error: "Acción desconocida." }, { status: 400 });
    const repo = cuerpo.repo === "os" || cuerpo.repo === "astraura" ? cuerpo.repo : null;
    const modo = typeof cuerpo.modo === "string" ? cuerpo.modo : "";
    const confirmacion = typeof cuerpo.confirmacion === "string" ? cuerpo.confirmacion : "";
    if (!repo || !modo || !confirmacion) {
        return Response.json({ error: "Faltan campos (repo, modo, confirmacion)." }, { status: 400 });
    }
    if (process.env.STARSEED_LOCAL !== "1") {
        return Response.json({ error: "Publicar solo se permite desde la Mac de Alex (modo ligero)." }, { status: 403 });
    }
    const resultado = await publicar({
        repo,
        modo: modo as "produccion" | "vista-previa" | "paquete",
        hasta: typeof cuerpo.hasta === "string" ? cuerpo.hasta : undefined,
        confirmacion,
        quien: typeof cuerpo.quien === "string" && cuerpo.quien ? cuerpo.quien.slice(0, 60) : "alex",
    });
    return Response.json(resultado, { status: resultado.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
