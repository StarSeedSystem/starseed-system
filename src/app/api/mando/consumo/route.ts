/**
 * /api/mando/consumo — el medidor «Consumo y créditos» del Puente de Mando (2026-09-29).
 *
 * GET  → { datos }: Supabase (hoy, ciclo, freno, bucles, 14 días), Jev/OpenRouter y el
 *        crédito de Claude en la nube. Solo números, rutas de API saneadas y fechas.
 * POST { presupuestos } → valida y escribe `~/.starseed/presupuestos.json`; la vigía de
 *        consumo los aplica en su próxima vuelta (≤ 15 min).
 *
 * Solo local, como todo `/api/mando/*` (`guardianMando`: 404 en el despliegue público). El
 * POST, además, exige JSON (una página de otro origen no puede mandarlo sin preflight) y,
 * si el navegador dice su origen, que sea este mismo.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { guardarPresupuestos, leerDatosConsumo } from "@/lib/mando/consumo";
import { validarPresupuestos } from "@/lib/mando/consumo-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    try {
        return Response.json({ datos: await leerDatosConsumo() }, { headers: SIN_CACHE });
    } catch {
        return Response.json({ error: "No se pudo leer el consumo de esta máquina." }, { status: 500, headers: SIN_CACHE });
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
        return Response.json({ error: "Envía los presupuestos como JSON." }, { status: 415, headers: SIN_CACHE });
    }
    if (!mismoOrigen(peticion)) {
        return Response.json({ error: "Solo desde el propio Puente de Mando." }, { status: 403, headers: SIN_CACHE });
    }
    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400, headers: SIN_CACHE });
    }
    const envuelto = cuerpo && typeof cuerpo === "object" && "presupuestos" in cuerpo
        ? (cuerpo as { presupuestos: unknown }).presupuestos
        : cuerpo;
    const r = validarPresupuestos(envuelto);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400, headers: SIN_CACHE });
    try {
        await guardarPresupuestos(r.valor);
        return Response.json(
            {
                datos: await leerDatosConsumo(),
                mensaje: "Presupuestos guardados. La vigía de consumo los aplica en su próxima vuelta (15 min como mucho).",
            },
            { headers: SIN_CACHE },
        );
    } catch {
        return Response.json({ error: "No se pudieron guardar los presupuestos." }, { status: 500, headers: SIN_CACHE });
    }
}
