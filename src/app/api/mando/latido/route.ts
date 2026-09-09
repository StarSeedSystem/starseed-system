/**
 * GET/POST /api/mando/latido (Ola 298 · LT2 · autocuración de colas huérfanas)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → { saludes, resumen, autocuracion }
 * POST → { accion: "revivir", cola, trabajadores? }      (botón del Mando)
 *        { accion: "autocuracion", activa }              (interruptor)
 *        { accion: "barrido" }                           → barridoAutocuracion()
 *
 * ⚠️ Nada de esto arranca solo desde el módulo: quien dispara el barrido es la
 * interfaz (LT3) o una tarea programada. Puerta única `guardianMando` — 404 fuera
 * de local/STARSEED_MANDO; nunca devuelve claves ni rutas absolutas.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { saludDeLasColas, resumen } from "@/lib/mando/latido-orquestador";
import {
    barridoAutocuracion,
    estadoAutocuracion,
    guardarAutocuracion,
    revivir,
} from "@/lib/mando/latido-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const saludes = await saludDeLasColas();
    return Response.json(
        { saludes, resumen: resumen(saludes), autocuracion: await estadoAutocuracion() },
        { headers: { "Cache-Control": "no-store" } },
    );
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

    if (accion === "revivir") {
        const cola = typeof cuerpo.cola === "string" ? cuerpo.cola.trim() : "";
        const trabajadores = typeof cuerpo.trabajadores === "number" ? cuerpo.trabajadores : undefined;
        const r = await revivir(cola, trabajadores);
        return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "autocuracion") {
        const activa = cuerpo.activa === true;
        const r = await guardarAutocuracion(activa);
        return Response.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } });
    }

    if (accion === "barrido") {
        return Response.json(await barridoAutocuracion(), { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}