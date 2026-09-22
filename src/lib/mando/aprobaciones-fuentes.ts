import "server-only";
/** Fuentes reales del panel de aprobaciones (Ola 320 · p320Bc): lee progreso,
 *  colas de disco y `git show` para rellenar las fichas de visto bueno.
 *  Solo servidor (fs + git). */
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { construirFicha, type ArchivoTocado, type FichaAprobacion } from "@/lib/mando/aprobaciones";

const execFileAsync = promisify(execFile);

async function intentar<T>(f: () => Promise<T>, porDefecto: T): Promise<T> {
    try { return await f(); } catch { return porDefecto; }
}

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function texto(v: unknown): string | undefined {
    return typeof v === "string" && v.trim() ? v : undefined;
}

function arr(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

const leerJsonOpcional = (ruta: string): Promise<unknown> =>
    intentar(async () => JSON.parse(await readFile(ruta, "utf-8")) as unknown, null);

interface TareaCola { titulo?: string; prompt?: string }

async function leerTareasDeColas(raiz: string): Promise<Map<string, TareaCola>> {
    const dir = path.join(raiz, "starseed_memory_root", "olas");
    const nombres = await intentar(
        async () => (await readdir(dir)).filter((n) => n.startsWith("cola-") && n.endsWith(".json")),
        [] as string[]
    );
    const tareas = new Map<string, TareaCola>();
    for (const nombre of nombres) {
        if (nombre.startsWith("cola-auto-")) continue;
        const crudo = await leerJsonOpcional(path.join(dir, nombre));
        const lista: unknown[] = Array.isArray(crudo)
            ? crudo
            : Array.isArray(objeto(crudo).tareas)
            ? (objeto(crudo).tareas as unknown[])
            : [];
        for (const t of lista) {
            const d = objeto(t);
            const id = texto(d.id);
            if (id && !tareas.has(id)) {
                tareas.set(id, { titulo: texto(d.titulo), prompt: texto(d.prompt) });
            }
        }
    }
    return tareas;
}

export function descripcionDe(prompt: string): string {
    const limpio = prompt.trim().replace(/\s+/g, " ");
    if (!limpio) return "";
    const partes = limpio.split(". ");
    let resultado = partes.length > 1 ? `${partes[0]}. ${partes[1]}` : partes[0];
    if (partes.length > 2 && !resultado.endsWith(".")) {
        resultado += ".";
    }
    if (resultado.length > 320) {
        const sub = resultado.slice(0, 320);
        const ultimoEspacio = sub.lastIndexOf(" ");
        resultado = (ultimoEspacio > 0 ? sub.slice(0, ultimoEspacio) : sub).trimEnd();
    }
    return resultado;
}

export function ramaYShaDe(nota: string | undefined, id: string): { rama: string; sha: string } {
    const m = nota?.match(/rama (ola\/[\w.\-/]+) \(([0-9a-f]{7,40})\)/);
    return m ? { rama: m[1], sha: m[2] } : { rama: `ola/${id}`, sha: "" };
}

export function parseNumstat(salida: string): ArchivoTocado[] {
    const archivos: ArchivoTocado[] = [];
    for (const linea of salida.split("\n")) {
        if (!linea.trim()) continue;
        const [mas, menos, ruta] = linea.split("\t");
        if (!ruta) continue;
        const parseNum = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
        archivos.push({ ruta, mas: parseNum(mas), menos: parseNum(menos) });
    }
    return archivos;
}

async function archivosDeRama(raiz: string, rama: string): Promise<ArchivoTocado[]> {
    return intentar(async () => {
        const { stdout } = await execFileAsync("git", ["show", "--numstat", "--format=", rama], {
            cwd: raiz,
            timeout: 10000,
            maxBuffer: 4 * 1024 * 1024,
        });
        return parseNumstat(stdout);
    }, [] as ArchivoTocado[]);
}

export async function leerAprobaciones(raiz: string = raizDelProyecto(), ahora: number = Date.now()): Promise<FichaAprobacion[]> {
    const progreso = objeto(await leerJsonOpcional(path.join(raiz, "starseed_memory_root", "olas", "progreso.json")));
    const enPuerta: Array<[string, Record<string, unknown>]> = [];
    for (const [id, v] of Object.entries(progreso)) {
        const d = objeto(v);
        if (texto(d.estado) === "esperando_aprobacion") enPuerta.push([id, d]);
    }
    if (enPuerta.length === 0) return [];

    const tareas = await leerTareasDeColas(raiz);
    const fichas: FichaAprobacion[] = [];
    for (const [id, d] of enPuerta) {
        const deCola = tareas.get(id);
        const { rama, sha } = ramaYShaDe(texto(d.nota), id);
        const dependientes = Object.entries(progreso)
            .filter(([otroId, o]) => otroId !== id && arr(objeto(o).depende_de).includes(id))
            .map(([otroId]) => otroId);
        fichas.push(
            construirFicha(
                {
                    id,
                    titulo: deCola?.titulo,
                    descripcion: deCola?.prompt ? descripcionDe(deCola.prompt) : undefined,
                    rama,
                    sha,
                    archivos: await archivosDeRama(raiz, rama),
                    entrada: d,
                    dependientes,
                    t: texto(d.t),
                },
                ahora
            )
        );
    }
    return fichas;
}
