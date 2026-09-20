/**
 * GET/PUT /api/mando/ajustes/astraura (Ola 347)
 * ─────────────────────────────────────────────────────────────────────────
 * Lee y guarda los ajustes del motor BitNet (`~/.starseed/astraura-ajustes.json`).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { guardianMando } from "@/lib/mando/guardian";
import { AJUSTES_BITNET_DEFECTO, validar, type AjustesBitnet } from "@/lib/mando/bitnet-ajustes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ETIQUETA_ARCHIVO = "~/.starseed/astraura-ajustes.json";

function rutaArchivo(): string {
    return path.join(os.homedir(), ".starseed", "astraura-ajustes.json");
}

async function leerAjustesAstraura(): Promise<AjustesBitnet> {
    try {
        const contenido = await readFile(rutaArchivo(), "utf-8");
        return validar(JSON.parse(contenido));
    } catch {
        return validar(AJUSTES_BITNET_DEFECTO);
    }
}

export async function GET(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    const config = await leerAjustesAstraura();
    return Response.json(
        {
            archivo: ETIQUETA_ARCHIVO,
            porDefecto: AJUSTES_BITNET_DEFECTO,
            config,
            actualizadoEn: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function PUT(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await req.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }

    const saneada = validar(cuerpo);
    const ruta = rutaArchivo();
    try {
        await mkdir(path.dirname(ruta), { recursive: true });
        await writeFile(ruta, `${JSON.stringify(saneada, null, 2)}\n`, "utf-8");
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido.";
        return Response.json({ error: `No se pudo guardar: ${msg}` }, { status: 500 });
    }

    return Response.json(
        {
            ok: true,
            config: saneada,
            actualizadoEn: new Date().toISOString(),
            mensaje: "El backend de Astraura toma los ajustes al reiniciar (launchctl kickstart -k gui/$UID/com.starseed.astraura).",
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
