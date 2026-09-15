/**
 * API del panel «Publicar» (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → el estado listo para el visto bueno + el diario de la última publicación.
 * POST → `{ accion: "preparar", nota }`  deja el manifiesto en disco (no publica).
 *        `{ accion: "publicar", nota }`  COMMITEA, pasa las cuatro puertas, empuja
 *                                        y verifica cada cambio uno a uno.
 *
 * ⚠️ Solo local: el guardián devuelve 404 en producción, así que esto no existe
 * fuera de la máquina de Alex. Publicar es siempre un acto suyo —el botón— y el
 * push solo ocurre con tsc, vitest, las pruebas del puente y la build en verde;
 * si una falla, el proceso para ahí y lo dice. Antes esta ruta no publicaba nada
 * y había que ir a la terminal; ese era justamente el problema.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerDiario, lanzarPublicacion, tituloDeEstado } from "@/lib/mando/publicador";
import { leerPublicacion, prepararPublicacion } from "@/lib/mando/publicacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    try {
        const [estado, diario] = await Promise.all([leerPublicacion(), leerDiario()]);
        return Response.json(
            { ...estado, diario, tituloDiario: tituloDeEstado(diario) },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch {
        return Response.json({ error: "No se pudo leer el estado de publicación." }, { status: 500 });
    }
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let nota = "";
    let accion = "preparar";
    try {
        const cuerpo = (await request.json()) as { nota?: unknown; accion?: unknown };
        nota = typeof cuerpo.nota === "string" ? cuerpo.nota : "";
        accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "preparar";
    } catch {
        return Response.json({ error: "Cuerpo no válido: envía `{ accion, nota }`." }, { status: 400 });
    }

    if (accion === "publicar") {
        // Sin nota no se publica: un commit sin asunto es un commit que dentro de
        // un mes nadie sabrá por qué existe.
        if (nota.trim().length < 8) {
            return Response.json(
                { error: "Escribe en una línea qué estás publicando (mínimo 8 caracteres)." },
                { status: 400 },
            );
        }
        const salida = await lanzarPublicacion(nota.trim());
        if (!salida.ok) return Response.json({ error: salida.error }, { status: 409 });
        const diario = await leerDiario();
        return Response.json({ lanzado: true, diario }, { headers: { "Cache-Control": "no-store" } });
    }

    try {
        const manifiesto = await prepararPublicacion(nota);
        return Response.json(manifiesto, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "No se pudo preparar la publicación." }, { status: 500 });
    }
}