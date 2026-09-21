import { guardianMando } from "@/lib/mando/guardian";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    const raiz = process.env.STARSEED_ROOT ?? "/Users/alex/Documents/starseed-os-main";
    const ruta = join(raiz, "starseed_memory_root", "mando", "acciones-de-alex.json");

    if (!existsSync(ruta)) {
        return Response.json({ generado: new Date().toISOString(), acciones: [] });
    }

    try {
        const contenido = readFileSync(ruta, "utf-8");
        const datos = JSON.parse(contenido);
        return Response.json(datos);
    } catch {
        return Response.json({ generado: new Date().toISOString(), acciones: [] });
    }
}