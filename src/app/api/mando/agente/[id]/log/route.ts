/**
 * GET /api/mando/agente/[id]/log (Ola 344 · MD2b)
 * Solo local; nunca expone rutas absolutas del disco ni claves.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { guardianMando } from "@/lib/mando/guardian";
import { idSeguro, recortarDesde, ultimasLineas } from "@/lib/mando/cola-de-log";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const { id } = await params;
    if (!idSeguro(id)) return Response.json({ error: "Id no válido" }, { status: 404 });

    const raiz = raizDelProyecto();
    const rutaLog = path.join(raiz, "starseed_memory_root", "olas", "logs", `${id}.log`);
    let contenido: string;
    try {
        contenido = await readFile(rutaLog, "utf-8");
    } catch {
        return Response.json({ error: "Log no encontrado" }, { status: 404 });
    }

    const url = new URL(peticion.url);
    const desde = Number(url.searchParams.get("desde") ?? "0");
    const desdeBytes = Number.isFinite(desde) && desde > 0 ? desde : 0;

    const recorte = recortarDesde(contenido, desdeBytes);
    const textoRespuesta = recorte.nuevo.length > 4000 ? ultimasLineas(recorte.nuevo, 200) : recorte.nuevo;
    const bytes = Buffer.byteLength(textoRespuesta, "utf8");

    // Terminado: la tarea ya no está en_curso ni escribiendo en progreso.json
    let terminado = false;
    try {
        const progreso = JSON.parse(await readFile(path.join(raiz, "starseed_memory_root", "olas", "progreso.json"), "utf-8")) as Record<string, unknown>;
        const estado = typeof progreso[id] === "object" && progreso[id] !== null ? (progreso[id] as Record<string, unknown>).estado : undefined;
        terminado = typeof estado === "string" ? !["en_curso", "escribiendo"].includes(estado) : false;
    } catch {
        terminado = false;
    }

    return Response.json({ id, desde: desdeBytes, hasta: bytes, texto: textoRespuesta, terminado, bytes }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
    });
}
