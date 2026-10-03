/**
 * POST /api/mando/reintentar (Ola 341 · Mando · Tarea RI2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reintento inteligente de tareas bloqueadas, rechazadas, fallidas o sin cambios.
 * Cuerpo { ids?: string[] }. Si sin ids, procesa todas las elegibles.
 * Lee progreso.json y revisiones.md, clasifica cada tarea y reencola las que sirvan.
 * Añade las reintentadas a la cola VIVA del orquestador o crea cola-reintentos-<fecha>.json.
 */

import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { orquestadoresVivos } from "@/lib/mando/procesos-orquestador";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    ejecutarReintentoInteligente,
    type TareaAnalizar,
} from "@/lib/mando/reintento-inteligente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


async function resolverRutaOlas(): Promise<string> {
    const raiz = raizDelProyecto();
    for (const sub of ["starseed_memory_root/olas", "olas"]) {
        try {
            await readdir(path.join(raiz, sub));
            return path.join(raiz, sub);
        } catch {}
    }
    return path.join(raiz, "starseed_memory_root", "olas");
}

async function leerTexto(ruta: string): Promise<string> {
    try {
        return await readFile(ruta, "utf-8");
    } catch {
        return "";
    }
}

async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
    const tmp = `${ruta}.tmp`;
    await writeFile(tmp, contenido, "utf-8");
    await rename(tmp, ruta);
}

export async function POST(peticion: Request): Promise<Response> {
    try {
        const veto = await guardianMando(peticion);
        if (veto) return veto;

        let ids: string[] | undefined;
        try {
            const cuerpo = (await peticion.json()) as { ids?: unknown };
            if (cuerpo && Array.isArray(cuerpo.ids)) {
                ids = cuerpo.ids.filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
            }
        } catch {
            // sin cuerpo JSON -> ids queda undefined
        }

        const dirOlas = await resolverRutaOlas();
        const progresoRaw = await leerTexto(path.join(dirOlas, "progreso.json"));
        const revisionesMd = await leerTexto(path.join(dirOlas, "revisiones.md"));

        let progreso: unknown = {};
        try {
            if (progresoRaw.trim()) progreso = JSON.parse(progresoRaw);
        } catch {}

        const archivosDir = await readdir(dirOlas).catch(() => []);
        const colasTareas: TareaAnalizar[] = [];
        for (const f of archivosDir) {
            if (f.startsWith("cola-") && f.endsWith(".json") && !f.endsWith(".tmp")) {
                const txt = await leerTexto(path.join(dirOlas, f));
                try {
                    const parsed = JSON.parse(txt) as unknown;
                    const list = Array.isArray(parsed) ? parsed : [];
                    for (const item of list) {
                        if (item && typeof item === "object" && item !== null && typeof (item as { id?: string }).id === "string") {
                            colasTareas.push(item as TareaAnalizar);
                        }
                    }
                } catch {}
            }
        }

        const resultado = ejecutarReintentoInteligente({ ids, progreso, revisionesMd, colasTareas });

        if (resultado.reencoladas.length > 0) {
            let rutaColaViva: string | null = null;
            // (2026-10-03) `ps`, no `pgrep -af`: en macOS pgrep solo imprime PIDs y esto
            // no encontraba nunca la cola viva. Ver src/lib/mando/procesos-orquestador.ts.
            const viva = (await orquestadoresVivos()).find((p) => p.cola);
            if (viva) rutaColaViva = path.join(dirOlas, viva.cola);

            if (rutaColaViva) {
                const actualRaw = await leerTexto(rutaColaViva);
                let actualList: unknown[] = [];
                try {
                    if (actualRaw.trim()) {
                        const parsed = JSON.parse(actualRaw) as unknown;
                        if (Array.isArray(parsed)) actualList = parsed;
                    }
                } catch {}
                const merged = [...actualList, ...resultado.reencoladas];
                await escribirAtomico(rutaColaViva, JSON.stringify(merged, null, 2) + "\n");
            } else {
                const fecha = new Date().toISOString().slice(0, 10);
                const rutaNueva = path.join(dirOlas, `cola-reintentos-${fecha}.json`);
                let existList: unknown[] = [];
                try {
                    const existRaw = await leerTexto(rutaNueva);
                    if (existRaw.trim()) {
                        const parsed = JSON.parse(existRaw) as unknown;
                        if (Array.isArray(parsed)) existList = parsed;
                    }
                } catch {}
                const merged = [...existList, ...resultado.reencoladas];
                await escribirAtomico(rutaNueva, JSON.stringify(merged, null, 2) + "\n");
            }
        }

        return Response.json(
            {
                reintentadas: resultado.reintentadas,
                descartadas: resultado.descartadas,
                esperando: resultado.esperando,
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch {
        return Response.json(
            { error: "No se pudo procesar la solicitud de reintento." },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
}
