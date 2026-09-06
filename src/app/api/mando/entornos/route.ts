/**
 * GET /api/mando/entornos (Ola 239 · mando completo en la nube)
 * ─────────────────────────────────────────────────────────────────────────────
 * Devuelve los entornos vivos del proyecto (desarrollo, producción, backend,
 * bases de datos y agentes) con su salud medida en vivo y sus enlaces, SIN
 * claves ni rutas absolutas del disco.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve claves, tokens, contraseñas ni cadenas de conexión: solo
 * NOMBRES de variables de entorno y URLs públicas o locales.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerEntornos } from "@/lib/mando/entornos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const entornos = await leerEntornos();

    return Response.json(
        { entornos, generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}