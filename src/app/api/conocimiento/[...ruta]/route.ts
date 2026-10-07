/**
 * /api/conocimiento/[...ruta] — API de conocimiento de Genesis (FLU1005E · ola 1005F).
 *
 * Réplica del subconjunto de Dify que usamos (architecture/puente-propio-flujos.md §4):
 *   GET  /api/conocimiento/datasets
 *   POST /api/conocimiento/datasets                          { name, description? }
 *   POST /api/conocimiento/datasets/{id}/document/create-by-text   { name, text }
 *   GET  /api/conocimiento/datasets/{id}/documents
 *   POST /api/conocimiento/datasets/{id}/retrieve            { query, top_k? }
 * Campos respetados: ver `src/lib/mando/conocimiento.ts`.
 *
 * ACCESO: solo local (como `/api/mando/*`, vía `guardianMando`) o con la clave propia
 * `CONOCIMIENTO_CLAVE` por cabecera `Authorization: Bearer …`. Nunca se devuelve la clave
 * ni rutas del disco.
 *
 * CÓMO LEE Y ESCRIBE: las LECTURAS (listar bases y documentos) leen el índice JSON en
 * disco directamente — es lo más ligero: no arrancan Python y los metadatos ya están
 * calculados. Las ESCRITURAS y la RECUPERACIÓN llaman a `scripts/puente/conocimiento.py`
 * como proceso corto (`execFile` python3, <=20 s): trocear e indexar BM25 ya viven ahí y
 * duplicar el BM25 en TS sería dos verdades que mantener.
 */
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
    claveAceptada, idBaseValido,
    validarCrearBase, validarCrearDocumento, validarRecuperar,
    type BaseConocimiento, type DocumentoConocimiento,
    type ResultadoRecuperacion,
} from "@/lib/mando/conocimiento";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function llamarPython(args: string[], entrada?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const hijo = spawn("python3", [SCRIPT(), ...args], { cwd: raizDelProyecto() });
        let salida = "";
        let fallo = "";
        const cronometro = setTimeout(() => {
            hijo.kill("SIGKILL");
            reject(new Error("El proceso de conocimiento excedió el tope."));
        }, 20_000);
        hijo.stdout.setEncoding("utf8");
        hijo.stderr.setEncoding("utf8");
        hijo.stdout.on("data", (t: string) => { salida += t; if (salida.length > 8_000_000) hijo.kill("SIGKILL"); });
        hijo.stderr.on("data", (t: string) => { fallo += t; });
        hijo.on("error", (e: Error) => { clearTimeout(cronometro); reject(e); });
        hijo.on("close", (codigo: number | null) => {
            clearTimeout(cronometro);
            if (codigo !== 0) {
                const msg = (() => {
                    try {
                        const d = JSON.parse(salida) as { error?: string };
                        return d.error ?? fallo;
                    } catch { return fallo || `Código ${String(codigo)}`; }
                })();
                reject(new Error(msg));
                return;
            }
            try {
                resolve(JSON.parse(salida || "{}") as unknown);
            } catch {
                reject(new Error("Salida no JSON del proceso de conocimiento."));
            }
        });
        if (typeof entrada === "string") {
            hijo.stdin.write(entrada);
        }
        hijo.stdin.end();
    });
}

const DIR_CONOCIMIENTO = (): string =>
    path.join(raizDelProyecto(), "starseed_memory_root", "conocimiento");
const SCRIPT = (): string => path.join(raizDelProyecto(), "scripts", "puente", "conocimiento.py");

function badRequest(error: string): Response {
    return Response.json({ error }, { status: 400 });
}
function notFound(): Response {
    return Response.json({ error: "No encontrado." }, { status: 404 });
}

async function listarBasesDisco(): Promise<BaseConocimiento[]> {
    const bases: BaseConocimiento[] = [];
    let nombres: string[] = [];
    try {
        nombres = await readdir(DIR_CONOCIMIENTO());
    } catch {
        return bases;
    }
    for (const nombre of nombres.sort()) {
        try {
            const datos: unknown = JSON.parse(
                await readFile(path.join(DIR_CONOCIMIENTO(), nombre, "base.json"), "utf8"));
            if (datos !== null && typeof datos === "object") bases.push(datos as BaseConocimiento);
        } catch { /* base parcial o ilegible: fuera de la lista */ }
    }
    return bases;
}

async function listarDocumentosDisco(baseId: string): Promise<DocumentoConocimiento[] | null> {
    try {
        await readFile(path.join(DIR_CONOCIMIENTO(), baseId, "base.json"), "utf8");
    } catch {
        return null;
    }
    const docs: DocumentoConocimiento[] = [];
    const dirDocs = path.join(DIR_CONOCIMIENTO(), baseId, "documentos");
    let nombres: string[] = [];
    try {
        nombres = await readdir(dirDocs);
    } catch {
        return docs;
    }
    for (const nombre of nombres.sort()) {
        try {
            const datos = JSON.parse(await readFile(path.join(dirDocs, nombre), "utf8")) as Record<string, unknown>;
            delete datos["trozos"];
            docs.push(datos as unknown as DocumentoConocimiento);
        } catch { /* documento parcial: fuera */ }
    }
    return docs;
}

async function accesoPermitido(req: Request): Promise<boolean> {
    if (!claveAceptada(req.headers.get("authorization"), process.env.CONOCIMIENTO_CLAVE)) {
        const veto = await guardianMando(req);
        if (veto !== null) return !veto.ok ? false : true;
    }
    return true;
}

type Param = { params: Promise<{ ruta: string[] }> };

async function resolverRuta(ctx: Param): Promise<string[]> {
    const { ruta } = await ctx.params;
    return ruta;
}

export async function GET(req: Request, ctx: Param): Promise<Response> {
    if (!(await accesoPermitido(req))) return notFound();
    const ruta = await resolverRuta(ctx);
    if (ruta.length === 1 && ruta[0] === "datasets") {
        const data = await listarBasesDisco();
        return Response.json({ data, total: data.length });
    }
    if (ruta.length === 2 && ruta[0] === "datasets" && idBaseValido(ruta[1])) {
        const data = await listarDocumentosDisco(ruta[1]);
        return data === null ? notFound() : Response.json({ data, total: data.length });
    }
    if (ruta.length === 3 && ruta[0] === "datasets" && ruta[2] === "documents") {
        if (!idBaseValido(ruta[1])) return notFound();
        const data = await listarDocumentosDisco(ruta[1]);
        if (data === null) return notFound();
        return Response.json({ data, total: data.length });
    }
    return notFound();
}

export async function POST(req: Request, ctx: Param): Promise<Response> {
    if (!(await accesoPermitido(req))) return notFound();
    const ruta = await resolverRuta(ctx);
    let cuerpo: unknown = null;
    try {
        cuerpo = await req.json();
    } catch {
        return badRequest("JSON inválido.");
    }
    try {
        if (ruta.length === 1 && ruta[0] === "datasets") {
            const error = validarCrearBase(cuerpo);
            if (error) return badRequest(error);
            const { name, description } = cuerpo as { name: string; description?: string };
            const base = await llamarPython(["crear", "--nombre", name.trim(), "--descripcion", description ?? ""]);
            return Response.json(base, { status: 201 });
        }
        if (ruta.length === 3 && ruta[0] === "datasets" && ruta[2] === "document") {
            return notFound();
        }
        if (ruta.length === 3 && ruta[0] === "datasets" && ruta[2] === "retrieve") {
            if (!idBaseValido(ruta[1])) return notFound();
            const error = validarRecuperar(cuerpo);
            if (error) return badRequest(error);
            const { query, top_k } = cuerpo as { query: string; top_k?: number };
            const resultado = await llamarPython(
                ["recuperar", "--base", ruta[1], "--consulta", query, "--top", String(top_k ?? 5)]);
            return Response.json(resultado as ResultadoRecuperacion);
        }
        if (ruta.length === 4 && ruta[0] === "datasets" && ruta[2] === "document" && ruta[3] === "create-by-text") {
            if (!idBaseValido(ruta[1])) return notFound();
            const error = validarCrearDocumento(cuerpo);
            if (error) return badRequest(error);
            const { name, text } = cuerpo as { name: string; text: string };
            const doc = await llamarPython(
                ["agregar-texto", "--base", ruta[1], "--nombre", name.trim(), "--texto", "-"], text);
            const data = await listarDocumentosDisco(ruta[1]);
            return Response.json({ document: doc, batch: doc === null ? null : (data ?? []).length }, { status: 201 });
        }
    } catch (e) {
        const mensaje = e instanceof Error ? e.message : "";
        if (mensaje.startsWith("Base no encontrada")) return notFound();
        return Response.json({ error: "No se pudo completar la operación." }, { status: 500 });
    }
    return notFound();
}
