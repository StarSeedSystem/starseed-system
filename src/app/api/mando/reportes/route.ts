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

function leerLimite(valor: string | null): number | undefined {
    // Rechazar sufijos evita que una consulta ambigua como `20basura` cambie
    // silenciosamente el tamaño de la bandeja.
    if (!valor || !/^\d+$/.test(valor)) return undefined;
    const numero = Number(valor);
    return Number.isSafeInteger(numero) && numero > 0
        ? Math.min(numero, LIMITE_MAX)
        : undefined;
}

function leerDesde(valor: string | null): string | undefined {
    if (!valor) return undefined;
    return Number.isFinite(new Date(valor).getTime()) ? valor : undefined;
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const { searchParams } = new URL(peticion.url);
    const desde = leerDesde(searchParams.get("desde"));
    const limite = leerLimite(searchParams.get("limite"));

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
