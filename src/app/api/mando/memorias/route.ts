/**
 * GET /api/mando/memorias (Ola de Memorias · Puente de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Todas las memorias del proyecto StarSeed OS en ocho capas —núcleo, proyecto,
 * relevo e informes, aprendizajes, recuerdos por tarea, preferencias y
 * configuración, agentes externos, y programas/enlaces/medios/versiones—, con
 * sus vínculos, el grafo memoria→memoria y las últimas actualizaciones.
 *
 * Query:
 *   ?q=<texto>        filtra los archivos de cada capa por título/ruta/resumen.
 *   ?forzar=1         relee todas las fuentes (salta el memo de 20 s).
 *   ?archivo=<ruta>   el detalle (texto completo redactado, vínculos resueltos
 *                      y «mencionado por») de una memoria concreta, tal y como
 *                      aparece en el catálogo (`ruta` de una respuesta anterior).
 *
 * ⚠️ Seguridad: puerta única `guardianMando` (404 fuera de local/STARSEED_MANDO,
 * como el resto de `/api/mando/*`). `leerDetalleArchivo` solo lee un archivo
 * que YA está en el catálogo construido en este mismo proceso (nunca una ruta
 * arbitraria del disco) y todo el texto que sale de aquí pasa antes por
 * `redactarTexto`. Sin caché HTTP; solo un memo de 20 s en el proceso que
 * «Actualizar» salta (`?forzar=1`).
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerDetalleArchivo, leerMemorias } from "@/lib/mando/memorias-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const { searchParams } = new URL(peticion.url);
    const archivo = searchParams.get("archivo");

    if (archivo) {
        try {
            const detalle = await leerDetalleArchivo(archivo);
            return Response.json(detalle, { headers: { "Cache-Control": "no-store" } });
        } catch {
            return Response.json({ error: "no encontrado" }, { headers: { "Cache-Control": "no-store" } });
        }
    }

    const q = searchParams.get("q") ?? undefined;
    try {
        const datos = await leerMemorias(q, searchParams.get("forzar") === "1");
        return Response.json(datos, { headers: { "Cache-Control": "no-store" } });
    } catch {
        // Memorias a medias antes que consola caída: si una fuente falla, el
        // resto igual se sirve; esto solo cubre el caso extremo de que TODO falle.
        return Response.json(
            {
                capas: [],
                ultimasActualizaciones: [],
                grafo: { nodos: [], aristas: [] },
                totalArchivos: 0,
                generadoEn: new Date().toISOString(),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
