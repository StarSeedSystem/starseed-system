/**
 * /api/flujos/gancho/[ruta] — entrada firmada de los Flujos del Mando.
 *
 * POST con cabecera `X-StarSeed-Firma: sha256=<hmac>` del cuerpo crudo, con la
 * clave de `PRODUCCION_WEBHOOK_SECRETO` (la misma que
 * `produccion_webhooks.verificar_firma`). Firma mala → 401 sin detalles.
 * Firma buena → el evento se deja en `starseed_memory_root/flujos/entrada/` y
 * se responde 202. Nunca se ejecuta Python desde aquí: el motor lo consume.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    CABECERA_FIRMA,
    construirEvento,
    nombreArchivoEntrada,
    sanitizarRuta,
    verificarFirma,
} from "@/lib/mando/gancho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Contexto {
    params: Promise<{ ruta: string }>;
}

export async function POST(req: Request, contexto: Contexto) {
    const { ruta: rutaCruda } = await contexto.params;
    const ruta = sanitizarRuta(rutaCruda ?? "");
    if (!ruta) return new NextResponse("Not Found", { status: 404 });

    const cuerpo = await req.text();
    const firma = req.headers.get(CABECERA_FIRMA);
    if (!verificarFirma(cuerpo, firma, process.env.PRODUCCION_WEBHOOK_SECRETO)) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    let datos: unknown = cuerpo;
    try {
        datos = cuerpo ? JSON.parse(cuerpo) : null;
    } catch {
        // cuerpo no JSON: se guarda tal cual, el motor decide
    }
    const ahora = new Date();
    const carpeta = path.join(
        raizDelProyecto(), "starseed_memory_root", "flujos", "entrada");
    await mkdir(carpeta, { recursive: true });
    await writeFile(
        path.join(carpeta, nombreArchivoEntrada(ruta, ahora.getTime())),
        JSON.stringify(construirEvento(ruta, datos, ahora), null, 2) + "\n",
        "utf8",
    );
    return NextResponse.json({ ok: true }, { status: 202 });
}
