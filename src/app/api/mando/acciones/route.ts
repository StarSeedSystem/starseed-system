import { guardianMando } from "@/lib/mando/guardian";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";

const ejecutarArchivo = promisify(execFile);

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

export async function POST(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    const cuerpo: unknown = await req.json().catch(() => null);
    const entrada = cuerpo as { accion?: unknown; id?: unknown } | null;

    if (entrada?.accion !== "verificar" || typeof entrada.id !== "string" || !entrada.id.trim()) {
        return Response.json({ error: "Acción o identificador no válidos" }, { status: 400 });
    }

    const raiz = process.env.STARSEED_ROOT ?? "/Users/alex/Documents/starseed-os-main";
    const guion = join(raiz, "scripts", "puente", "acciones-de-alex.py");

    try {
        // El guion vuelve a medir la realidad; duplicar aquí esa lógica recrearía el desfase.
        const { stdout } = await ejecutarArchivo(
            "python3",
            [guion, "--verificar", entrada.id],
            { cwd: raiz, encoding: "utf8", timeout: 30_000 },
        );
        return new Response(stdout, { headers: { "content-type": "application/json; charset=utf-8" } });
    } catch {
        return Response.json({ error: "No se pudo verificar la acción" }, { status: 500 });
    }
}
