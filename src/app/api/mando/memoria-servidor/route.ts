/**
 * GET /api/mando/memoria-servidor (Ola 0411 · SUP0411H · 2026-11-04)
 * ─────────────────────────────────────────────────────────────────────────────
 * Dice en qué se le va la memoria al servidor de Genesis: lo que ocupa el proceso
 * (RSS), lo que ocupa el montón de V8, el techo de ese montón y qué espacios se lo
 * comen. Todo en MB y con un veredicto («holgado», «justo», «al límite»).
 *
 * ⚠️ BARATA a propósito: solo tres lecturas en memoria de Node. Ni archivos, ni
 * procesos, ni la reunión de los medidores, y NUNCA `v8.writeHeapSnapshot()`: copiar
 * el montón duplicaría la memoria y tiraría el servidor.
 * Puerta única `guardianMando`: 404 fuera de local (salvo STARSEED_MANDO); nunca
 * devuelve claves ni rutas del disco.
 */

import { getHeapSpaceStatistics, getHeapStatistics } from "node:v8";

import { guardianMando } from "@/lib/mando/guardian";
import { resumenMemoria } from "@/lib/mando/memoria-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_ALMACEN = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const ahoraMs = Date.now();
    // `process.uptime()` son los segundos que lleva vivo el proceso: el arranque del servidor.
    const arranqueMs = ahoraMs - Math.round(process.uptime() * 1000);

    const resumen = resumenMemoria({
        uso: process.memoryUsage(),
        montón: getHeapStatistics(),
        espacios: getHeapSpaceStatistics(),
        arranqueMs,
        ahoraMs,
    });

    return Response.json(resumen, { headers: SIN_ALMACEN });
}
