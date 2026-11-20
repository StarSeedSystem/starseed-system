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
    const entrada = cuerpo as { accion?: unknown; id?: unknown; motivo?: unknown } | null;
    const accion = typeof entrada?.accion === "string" ? entrada.accion : "";
    const id = typeof entrada?.id === "string" ? entrada.id.trim() : "";

    if (!id || !["verificar", "aprobar", "rechazar"].includes(accion)) {
        return Response.json({ error: "Acción o identificador no válidos" }, { status: 400 });
    }

    const raiz = process.env.STARSEED_ROOT ?? "/Users/alex/Documents/starseed-os-main";
    const guion = join(raiz, "scripts", "puente", "acciones-de-alex.py");
    const args =
        accion === "aprobar"
            ? [guion, "--aprobar", id]
            : accion === "rechazar"
              ? [
                    guion,
                    "--rechazar",
                    id,
                    ...(typeof entrada?.motivo === "string" && entrada.motivo.trim()
                        ? ["--motivo", entrada.motivo.trim().slice(0, 240)]
                        : []),
                ]
              : [guion, "--verificar", id];

    try {
        // El guion vuelve a medir o resolver la realidad; duplicar aquí esa lógica recrearía el desfase.
        const { stdout } = await ejecutarArchivo("python3", args, {
            cwd: raiz,
            encoding: "utf8",
            timeout: 30_000,
        });
        return new Response(stdout, { headers: { "content-type": "application/json; charset=utf-8" } });
    } catch {
        return Response.json({ error: "No se pudo procesar la acción" }, { status: 500 });
    }
}
