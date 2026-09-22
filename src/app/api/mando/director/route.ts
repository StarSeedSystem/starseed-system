/**
 * GET /api/mando/director — el modelo real del Director del Puente de Mando:
 * agentes vivos/colgados por latido, tareas pendientes de las colas fuente,
 * salud de proveedores contra el catálogo de modelos, servicios launchd y el
 * canal común (Ola 318 · p318B). Nunca devuelve claves ni rutas del disco.
 */
import { NextResponse } from "next/server";
import path from "node:path";
import os from "node:os";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    leerLatidos, leerProgreso, leerColasFuente, leerSalud, leerModelos,
    leerServicios, leerCanal, leerAsuntosMain, leerAsuntosDeHoy, leerJsonOpcional,
    leerAprobaciones,
} from "@/lib/mando/director-fuentes";
import { resumenAgentes, resumenPendientes, resumenProveedores, resumenDirectores, listaAgentes } from "@/lib/mando/director-datos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numeroDe(v: unknown): number {
    return typeof v === "object" && v !== null && !Array.isArray(v)
        ? Number((v as Record<string, unknown>).gastoHoy) || 0
        : 0;
}
function objetoDe(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const raiz = raizDelProyecto();
    const home = os.homedir();
    const ahora = Math.floor(Date.now() / 1000);

    const [latidos, progreso, colasFuente, salud, modelos, servicios, canal, asuntosMain, asuntosHoy, escaladaCruda, configCruda, aprobaciones] =
        await Promise.all([
            leerLatidos(raiz), leerProgreso(raiz), leerColasFuente(raiz), leerSalud(home), leerModelos(raiz),
            leerServicios(), leerCanal(raiz), leerAsuntosMain(raiz), leerAsuntosDeHoy(raiz),
            leerJsonOpcional(path.join(raiz, "starseed_memory_root", "olas", "escalada-gasto.json")),
            leerJsonOpcional(path.join(raiz, "starseed_memory_root", "mando", "director-config.json")),
            leerAprobaciones(raiz),
        ]);

    // `resumenDirectores` (director-datos.ts) espera el texto crudo de `launchctl list`;
    // se reconstruye desde los servicios ya parseados por `leerServicios`.
    const textoServicios = servicios
        .map((s) => `${s.pid ?? "-"}\t${s.ultimaSalida ?? "-"}\tcom.starseed.${s.etiqueta}`)
        .join("\n");

    return NextResponse.json(
        {
            agentes: { ...resumenAgentes(latidos, ahora), lista: listaAgentes(latidos, ahora) },
            pendientes: resumenPendientes(colasFuente, progreso, asuntosMain, asuntosHoy),
            proveedores: resumenProveedores(salud, modelos),
            directores: resumenDirectores(textoServicios, canal, ahora),
            escalada: { gastoHoy: numeroDe(escaladaCruda) },
            config: objetoDe(configCruda),
            aprobaciones,
            generadoEn: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
