/**
 * GET /api/mando/entornos (Ola 239 · mando completo en la nube)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET devuelve los entornos vivos del proyecto (desarrollo, producción,
 * backend, bases de datos y agentes) con su salud medida en vivo y sus
 * enlaces, SIN claves ni rutas absolutas del disco.
 *
 * POST /api/mando/entornos (Ola 1020 · ENT1020A) gestiona los ENTORNOS DE
 * PERFEL —escritorios, dock, widgets, apariencia… más volúmenes por
 * referencia— a través del módulo puro del núcleo, cableado en
 * `entornos-api.ts`: capturar, revisar, duplicar, diferencia, listar y
 * exportar. Nada se guarda sin revisión instalable; la aplicación definitiva
 * la hace el cliente con `aplicar` del módulo puro (el medio es suyo).
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve claves, tokens, contraseñas ni cadenas de conexión: solo
 * NOMBRES de variables de entorno y URLs públicas o locales.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerEntornos } from "@/lib/mando/entornos";
import {
    capturarYGuardar,
    diferenciaGuardados,
    duplicarGuardado,
    listarEntornos,
    leerEntorno,
    paqueteDe,
    revisarEntornoDeCrudo,
    textoDe,
    valoresCrudosDe,
    volumenesDe,
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

function objeto(v: unknown): Record<string, unknown> | null {
    return v !== null && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const fallo = (error: string) => Response.json({ error }, { status: 400 });

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return fallo("el cuerpo no es un JSON válido");
    }
    const base = objeto(cuerpo);
    if (!base || typeof base.accion !== "string") return fallo("falta la acción (POST {accion, datos})");
    const datos = objeto(base.datos) ?? {};

    try {
        switch (base.accion) {
            case "capturar": {
                const paquete = paqueteDe(datos.paquete);
                const volumenes = volumenesDe(datos.volumenes ?? []);
                if (!paquete || !volumenes) return fallo("paquete o volúmenes inválidos");
                const altas = await capturarYGuardar(
                    paquete,
                    valoresCrudosDe(datos.valoresCrudos ?? {}),
                    volumenes,
                );
                if (!altas.guardado) return fallo(`no instalable: ${altas.motivos.join("; ")}`);
                return Response.json({ id: altas.id }, { headers: { "Cache-Control": "no-store" } });
            }
            case "revisar": {
                const revision = revisarEntornoDeCrudo(datos.entorno);
                if (!revision) return fallo("entorno inválido");
                return Response.json({ revision }, { headers: { "Cache-Control": "no-store" } });
            }
            case "duplicar": {
                const id = textoDe(datos.id);
                const nombre = textoDe(datos.nombre);
                if (!id || !nombre) return fallo("falta el id o el nombre nuevo");
                const alta = await duplicarGuardado(id, nombre);
                if (!alta.guardado) return fallo(alta.motivos.join("; "));
                return Response.json({ id: alta.id }, { headers: { "Cache-Control": "no-store" } });
            }
            case "diferencia": {
                const idA = textoDe(datos.idA);
                const idB = textoDe(datos.idB);
                const cambio = idA && idB ? await diferenciaGuardados(idA, idB) : null;
                if (!cambio) return fallo("no hay entornos guardados con esos ids");
                return Response.json({ diferencia: cambio }, { headers: { "Cache-Control": "no-store" } });
            }
            case "listar":
                return Response.json(
                    { entornos: await listarEntornos() },
                    { headers: { "Cache-Control": "no-store" } },
                );
            case "exportar": {
                const id = textoDe(datos.id);
                const entorno = id ? await leerEntorno(id) : null;
                if (!entorno || !id) return fallo("no hay entorno guardado con ese id");
                return new Response(JSON.stringify(entorno, null, 2), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Disposition": `attachment; filename="entorno-${id}.json"`,
                        "Cache-Control": "no-store",
                    },
                });
            }
            default:
                return fallo(`acción no soportada: ${base.accion}`);
        }
    } catch (error) {
        return fallo(`no se pudo procesar la acción: ${error instanceof Error ? error.message : String(error)}`);
    }
}
