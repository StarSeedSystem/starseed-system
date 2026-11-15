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
import { sanearInforme } from "@/lib/banco-llamadas/informe";

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
    const [orden, calma, app] = await Promise.all([leerJson(path.join(dir, "orden.json")), leerJson(path.join(dir, "calma.json")), leerJson(path.join(dir, "app.json"))]);
    return Response.json({ disponible: true, orden, calma, app }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
    if (!mandoHabilitado(req) || !esPeticionDeEstaMaquina(req)) return Response.json({ ok: false }, { status: 404, headers: { "cache-control": "no-store" } });
    let cuerpo: unknown = null;
    try {
        const t = await req.text();
        cuerpo = t.length > 4_000 ? null : JSON.parse(t);
    } catch {
        cuerpo = null;
    }
    const informe = sanearInforme(cuerpo, Date.now());
    if (!informe) return Response.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
    const base = process.env.STARSEED_PRODUCCION_DIR || path.join(os.homedir(), ".starseed", "produccion");
    const dir = path.join(base, "banco-llamadas");
    try {
        await fs.mkdir(dir, { recursive: true });
        const tmp = path.join(dir, `app.json.tmp-${process.pid}`);
        await fs.writeFile(tmp, JSON.stringify(informe), "utf8");
        await fs.rename(tmp, path.join(dir, "app.json"));
    } catch {
        return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
