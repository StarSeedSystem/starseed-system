/**
 * GET /api/banco-llamadas · la orden en curso del banco de llamadas para la app de la Mac (ORD1114P ·
 * contrato ronda-automatica-llamadas §1.1 y §1.2).
 *
 * Python (`scripts/puente/banco_llamadas.py`) escribe `orden.json` y `calma.json` en
 * `~/.starseed/produccion/banco-llamadas/` (o `STARSEED_PRODUCCION_DIR`); esta ruta solo los LEE. Fuera
 * del servidor local de la Mac (web publicada, tableta, otra máquina) responde `{disponible:false}`.
 * En la app nativa, la guarda del servidor local exige además la cookie `starseed_pase` de su ventana.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mandoHabilitado } from "@/lib/mando/guardian";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function leerJson(ruta: string): Promise<unknown> {
    try {
        const t = await fs.readFile(ruta, "utf8");
        return t.length > 64_000 ? null : (JSON.parse(t) as unknown);
    } catch {
        return null;
    }
}

export async function GET(req: Request) {
    if (!mandoHabilitado(req) || !esPeticionDeEstaMaquina(req)) {
        return Response.json({ disponible: false }, { headers: { "cache-control": "no-store" } });
    }
    const base = process.env.STARSEED_PRODUCCION_DIR || path.join(os.homedir(), ".starseed", "produccion");
    const dir = path.join(base, "banco-llamadas");
    const [orden, calma] = await Promise.all([leerJson(path.join(dir, "orden.json")), leerJson(path.join(dir, "calma.json"))]);
    return Response.json({ disponible: true, orden, calma }, { headers: { "cache-control": "no-store" } });
}
