import "server-only";
/**
 * GET /api/mando/aprobaciones (Ola 320 · p320Bc)
 * Fichas de visto bueno de las tareas en puerta (esperando_aprobacion).
 * Solo local: `guardianMando` devuelve 404 en producción.
 */
import { NextResponse } from "next/server";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { leerAprobaciones } from "@/lib/mando/aprobaciones-fuentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const raiz = raizDelProyecto();
    const aprobaciones = await leerAprobaciones(raiz);
    return NextResponse.json({ aprobaciones }, { headers: { "Cache-Control": "no-store" } });
}
