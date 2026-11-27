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
import { leerOrdenPruebaControl, type OrdenPruebaControl } from "@/lib/banco-llamadas/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BAN1115O: solo en macOS (la app de la Mac es quien recibe órdenes); en otro sistema la ruta responde «no disponible». */
function enMac(): boolean {
    return process.platform === "darwin" || process.env.STARSEED_BANCO_SIN_SO === "1"; // la variable solo la usan las pruebas
}

/** BAN1115O: la carpeta la crea el director de pruebas, nunca la app: si no existe, no se sirve ni se escribe nada. */
async function carpetaDelBanco(): Promise<string | null> {
    const base = process.env.STARSEED_PRODUCCION_DIR || path.join(os.homedir(), ".starseed", "produccion");
    const dir = path.join(base, "banco-llamadas");
    try {
        return (await fs.stat(dir)).isDirectory() ? dir : null;
    } catch {
        return null;
    }
}

/** BAN1115O: si la petición trae `Origin`, es el de la propia página (mismo host); una web ajena no escribe aquí. */
function origenPropio(req: Request): boolean {
    const o = req.headers.get("origin");
    if (!o) return true;
    try {
        return new URL(o).host === (req.headers.get("host") ?? new URL(req.url).host);
    } catch {
        return false;
    }
}

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
    const dir = enMac() ? await carpetaDelBanco() : null;
    if (!dir) return Response.json({ disponible: false }, { headers: { "cache-control": "no-store" } });
    const [ordenRaw, calma, app] = await Promise.all([leerJson(path.join(dir, "orden.json")), leerJson(path.join(dir, "calma.json")), leerJson(path.join(dir, "app.json"))]);
    // BAP1127J: validar orden prueba-control si es de ese tipo
    let orden: unknown = ordenRaw;
    if (ordenRaw && typeof ordenRaw === "object" && (ordenRaw as Record<string, unknown>).tipo === "prueba-control") {
        const validada = leerOrdenPruebaControl(ordenRaw);
        orden = validada; // null si inválida, la orden validada si ok
    }
    return Response.json({ disponible: true, orden, calma, app }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
    if (!mandoHabilitado(req) || !esPeticionDeEstaMaquina(req) || !enMac() || !origenPropio(req)) return Response.json({ ok: false }, { status: 404, headers: { "cache-control": "no-store" } });
    let cuerpo: unknown = null;
    try {
        const t = await req.text();
        cuerpo = t.length > 4_000 ? null : JSON.parse(t);
    } catch {
        cuerpo = null;
    }
    const informe = sanearInforme(cuerpo, Date.now());
    if (!informe) return Response.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
    const dir = await carpetaDelBanco();
    if (!dir) return Response.json({ ok: false, motivo: "sin-carpeta" }, { status: 404, headers: { "cache-control": "no-store" } });
    try {
        const tmp = path.join(dir, `app.json.tmp-${process.pid}`);
        await fs.writeFile(tmp, JSON.stringify(informe), "utf8");
        await fs.rename(tmp, path.join(dir, "app.json"));
    } catch {
        return Response.json({ ok: false }, { status: 500, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
