/**
 * /api/mando/suenos — los SUEÑOS PROFUNDOS en el Puente de Mando (2026-09-29).
 *
 * GET  ?fecha=AAAA-MM-DD&informe=1 → { datos }: sesiones, rejilla área × lente (estado,
 *      proveedor, tokens estimados, tiempo, quién verificó), recomendaciones consolidadas,
 *      la cola propuesta y, con `informe=1`, el texto de INFORME.md.
 * POST { accion: "lanzar", horas, areas, lentes } → `suenos.py lanzar` (regla de UN orquestador).
 * POST { accion: "consolidar", fecha? }           → `suenos.py consolidar` (INFORME.md + propuesta).
 * POST { accion: "a-disenador", fecha? }          → el nombre de la cola propuesta para importarla
 *      en el Diseñador de olas (no lanza nada: esa cola espera a una persona).
 *
 * Solo local, como todo `/api/mando/*` (`guardianMando`: 404 en el despliegue público). El POST
 * exige JSON y, si el navegador dice su origen, que sea este mismo. Nunca devuelve claves ni
 * rutas del disco.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { consolidarSuenos, lanzarSuenos, leerDatosSuenos, leerSesion, PATRON_SESION, validarLanzamiento } from "@/lib/mando/suenos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);
    const fecha = url.searchParams.get("fecha") ?? undefined;
    if (fecha && !PATRON_SESION.test(fecha)) {
        return Response.json({ error: "Fecha no válida (AAAA-MM-DD)." }, { status: 400, headers: SIN_CACHE });
    }
    try {
        return Response.json({ datos: await leerDatosSuenos(fecha, url.searchParams.get("informe") === "1") }, { headers: SIN_CACHE });
    } catch {
        return Response.json({ error: "No se pudieron leer los sueños de esta máquina." }, { status: 500, headers: SIN_CACHE });
    }
}

function mismoOrigen(peticion: Request): boolean {
    const origen = peticion.headers.get("origin");
    if (!origen) return true;
    try {
        return new URL(origen).host === new URL(peticion.url).host;
    } catch {
        return false;
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    if (!(peticion.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
        return Response.json({ error: "Envía la orden como JSON." }, { status: 415, headers: SIN_CACHE });
    }
    if (!mismoOrigen(peticion)) {
        return Response.json({ error: "Solo desde el propio Puente de Mando." }, { status: 403, headers: SIN_CACHE });
    }
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400, headers: SIN_CACHE });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const fecha = typeof cuerpo.fecha === "string" && PATRON_SESION.test(cuerpo.fecha) ? cuerpo.fecha : undefined;

    if (accion === "lanzar") {
        const v = validarLanzamiento(cuerpo);
        if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400, headers: SIN_CACHE });
        const r = await lanzarSuenos(v.valor);
        return Response.json({ ok: r.ok, ...r.datos }, { status: r.ok ? 200 : 409, headers: SIN_CACHE });
    }
    if (accion === "consolidar") {
        const r = await consolidarSuenos(fecha);
        return Response.json({ ok: r.ok, ...r.datos }, { status: r.ok ? 200 : 409, headers: SIN_CACHE });
    }
    if (accion === "a-disenador") {
        const s = await leerSesion(fecha);
        if (!s?.propuesta) {
            return Response.json({ ok: false, error: "Esta sesión aún no tiene cola propuesta: consolida primero." }, { status: 404, headers: SIN_CACHE });
        }
        return Response.json({ ok: true, cola: s.propuesta.nombre, tareas: s.propuesta.tareas }, { headers: SIN_CACHE });
    }
    return Response.json({ error: "Acción desconocida (lanzar · consolidar · a-disenador)." }, { status: 400, headers: SIN_CACHE });
}
