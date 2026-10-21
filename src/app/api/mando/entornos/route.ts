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
import {
  capturarEntorno,
  revisarEntorno,
  duplicarEntorno,
  aplicar,
  diferencia,
  leerEntornoLocal,
  escribirEntornoLocal,
} from "@/lib/mando/entornos-api";

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

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    try {
        const cuerpo = await peticion.json();
        const { accion, datos } = cuerpo;

        switch (accion) {
            case "capturar":
                const entornoCompleto = capturarEntorno(
                    leerEntornoLocal,
                    datos.paquete,
                    datos.volumenes
                );
                return Response.json({ entornoCompleto }, { status: 200 });

            case "revisar":
                const resultadoRevision = await revisarEntornoCompleto(datos.id);
                return Response.json({ resultadoRevision }, { status: 200 });

            case "duplicar":
                const entornoDuplicado = await duplicarEntornoCompleto(datos.id, datos.nuevoNombre);
                return Response.json({ entornoDuplicado }, { status: 200 });

            case "diferencia":
                const entornoA = await leerEntornoCompleto(datos.idA);
                const entornoB = await leerEntornoCompleto(datos.idB);
                const diferencias = diferencia(entornoA, entornoB);
                return Response.json({ diferencias }, { status: 200 });

            case "aplicar":
                const entorno = await leerEntornoCompleto(datos.id);
                const { deshacer, cambios } = aplicar(entorno, {
                    leer: leerEntornoLocal,
                    escribir: async (clave: string, valor: unknown) => {
                        await escribirEntornoLocal(clave, valor);
                    },
                });
                return Response.json({
                    deshacer,
                    cambios,
                }, { status: 200 });

            case "exportar":
                const contenidoExportado = await exportarEntorno(datos.id);
                return new Response(contenidoExportado, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Disposition": `attachment; filename="entorno-${datos.id}.json"`,
                    },
                });

            case "listar":
                const entornos = await listarEntornosCompletos();
                return Response.json({ entornos }, { status: 200 });

            default:
                return Response.json(
                    { error: `Acción no soportada: ${accion}` },
                    { status: 400 },
                );
        }
    } catch (error) {
        return Response.json(
            { error: `Error procesando solicitud: ${error}` },
            { status: 400 },
        );
    }
}