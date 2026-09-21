/**
 * GET /api/mando/reportes (Ola p323Bb · bandeja curada de Reportes)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve `{ reportes, generadoEn }`: entradas curadas (qué pasó, por qué
 * importa y cómo comprobarlo, con enlaces y pruebas), ordenadas por relevancia.
 *
 * Query:
 *   ?desde=<ISO>   solo entradas de ese momento en adelante (inválida = sin filtro).
 *   ?limite=<n>    tope de reportes (máximo 200 para no ahogar la UI).
 *
 * Como toda ruta /api/mando: SOLO local (404 en producción, lo pone el
 * guardián), nunca caché (los datos cambian a cada commit y cada evento) y
 * nunca un 500 por git roto: el servidor reúne lo que pueda y lo demás espera.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { obtenerReportes } from "@/lib/mando/reportes-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Las bandejas de más de 200 entradas no se leen: se cortan aquí. */
const LIMITE_MAX = 200;

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const { searchParams } = new URL(peticion.url);
    const desde = searchParams.get("desde") ?? undefined;
    const bruto = Number.parseInt(searchParams.get("limite") ?? "", 10);
    const limite = Number.isFinite(bruto) && bruto > 0 ? Math.min(bruto, LIMITE_MAX) : undefined;

    try {
        const datos = await obtenerReportes({ desde, limite });
        return Response.json(datos, { headers: { "Cache-Control": "no-store" } });
    } catch {
        // Bandeja medio vacía antes que caída: el propósito es informar, no admitir derrota.
        return Response.json(
            { reportes: [], generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
