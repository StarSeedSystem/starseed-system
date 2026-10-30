/**
 * /api/mando/recursos-red — «Recursos de la red» de Genesis (apps-en-la-malla §12) — SOLO local.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET: ofertas visibles por medio, préstamos vivos y volúmenes con réplicas por
 * debajo de `replicasDeseadas`. Lee la instantánea local
 * `~/.starseed/recursos-red.json` (ofertas, prestamos, volumenes) y, si no trae
 * ofertas, las fichas reales `~/.starseed/capacidades-nodos.json`. Todo lo
 * resume `src/lib/mando/recursos-red.ts` (puro). Puerta: `guardianMando`
 * (404 fuera de local). Nunca devuelve claves, IPs ni rutas absolutas.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { resumirRecursosRed } from "@/lib/mando/recursos-red";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

function parte(crudo: unknown, clave: string): unknown {
    return esObjeto(crudo) ? crudo[clave] : null;
}

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const hogar = homedir();
    const [instantanea, fichas] = await Promise.all([
        leerJson(path.join(hogar, ".starseed", "recursos-red.json")),
        leerJson(path.join(hogar, ".starseed", "capacidades-nodos.json")),
    ]);

    const anunciadas = parte(instantanea, "ofertas");
    const ofertas = Array.isArray(anunciadas) && anunciadas.length > 0 ? anunciadas : fichas;
    const resumen = resumirRecursosRed({
        ofertas,
        prestamos: parte(instantanea, "prestamos"),
        volumenes: parte(instantanea, "volumenes"),
        ahora: Date.now(),
    });

    return Response.json(
        { ...resumen, servidoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}
