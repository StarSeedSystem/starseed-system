/**
 * GET/POST /api/mando/colas (Ola 241 · Puente de Mando · Diseñador de olas)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → todas las colas completas del disco (id, ola, título, archivos, prompt,
 *        dependencias, modelo) y los modelos asignables.
 * POST → `{ accion: "validar" | "guardar" | "lanzar", ... }`
 *   · validar: `{ nombre, tareas }` → errores (sin tocar disco)
 *   · guardar: `{ nombre, tareas, sobrescribir? }` → escribe `olas/cola-<nombre>.json`
 *   · lanzar:  `{ nombre, donde: "mac" | "nube", workers?, tareas? }`
 *              mac → arranca el orquestador local; nube → orden firmada en el bus.
 *
 * ⚠️ Seguridad: 404 fuera de local; sesión en producción; validación estricta de
 * nombres, ids, rutas y modelos; nunca devuelve claves ni rutas absolutas.
 */

import { createClient } from "@/utils/supabase/server";
import {
    guardarCola,
    lanzarAqui,
    lanzarEnNube,
    leerColasCompletas,
    modelosAsignables,
    validarCola,
} from "@/lib/mando/colas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mandoHabilitado(): boolean {
    return process.env.NODE_ENV !== "production" || process.env.STARSEED_MANDO === "1";
}

async function guardian(): Promise<Response | null> {
    if (!mandoHabilitado()) return new Response("Not Found", { status: 404 });
    if (process.env.NODE_ENV === "production") {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }
    return null;
}

export async function GET(): Promise<Response> {
    const veto = await guardian();
    if (veto) return veto;
    const colas = await leerColasCompletas();
    return Response.json(
        { colas, modelos: modelosAsignables(), lanzadorNube: Boolean(process.env.STARSEED_LANZADOR_SECRETO) },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardian();
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const nombre = typeof cuerpo.nombre === "string" ? cuerpo.nombre.trim().toLowerCase() : "";

    if (accion === "validar" || accion === "guardar") {
        const { errores, tareas } = validarCola(nombre, cuerpo.tareas);
        if (accion === "validar" || errores.length > 0) {
            return Response.json({ ok: errores.length === 0, errores, tareas }, { headers: { "Cache-Control": "no-store" } });
        }
        const r = await guardarCola(nombre, tareas, cuerpo.sobrescribir === true);
        return Response.json(r.ok ? { ok: true, archivo: r.archivo, tareas } : { ok: false, errores: [r.error ?? "No se pudo guardar."] }, {
            status: r.ok ? 200 : 409,
            headers: { "Cache-Control": "no-store" },
        });
    }

    if (accion === "lanzar") {
        const donde = cuerpo.donde === "nube" ? "nube" : "mac";
        const workers = typeof cuerpo.workers === "number" ? cuerpo.workers : 2;
        if (!/^[0-9]{2,4}(-[a-z0-9]+){0,6}$/.test(nombre)) {
            return Response.json({ ok: false, error: "Nombre de cola no válido." }, { status: 400 });
        }
        if (donde === "mac") {
            const extra = Array.isArray(cuerpo.extra) ? (cuerpo.extra as unknown[]).filter((x): x is string => typeof x === "string") : [];
            const r = await lanzarAqui(nombre, workers, extra);
            return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
        }
        // nube: la cola viaja entera y firmada; si no viene, se lee del disco.
        let tareas = validarCola(nombre, cuerpo.tareas).tareas;
        if (tareas.length === 0) {
            const enDisco = (await leerColasCompletas()).find((c) => c.nombre === nombre);
            tareas = enDisco?.tareas ?? [];
        }
        if (tareas.length === 0) return Response.json({ ok: false, error: "La cola está vacía o no existe." }, { status: 400 });
        const r = await lanzarEnNube(nombre, tareas, Math.min(4, Math.max(1, Math.round(workers))));
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
