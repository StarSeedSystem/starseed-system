/** Fuentes reales del panel de aprobaciones (Ola 320 · p320Bb): lee progreso,
 *  colas de disco y `git show` para rellenar las fichas de visto bueno. Todo va
 *  envuelto en try/catch que devuelve vacío en vez de reventar: una ficha sin
 *  datos es mejor que un Mando caído. Solo servidor (fs + git), como
 *  `director-fuentes.ts`: el paquete `server-only` no está instalado en el
 *  repo, así que la garantía es la de siempre — solo se importa desde rutas
 *  `/api/mando/*`. */
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { construirFicha, type ArchivoTocado, type FichaAprobacion } from "@/lib/mando/aprobaciones";

const execFileAsync = promisify(execFile);

async function intentar<T>(f: () => Promise<T>, porDefecto: T): Promise<T> {
    try { return await f(); } catch { return porDefecto; }
}
function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function texto(v: unknown): string | undefined { return typeof v === "string" && v.trim() ? v : undefined; }
function arr(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }

const leerJsonOpcional = (ruta: string): Promise<unknown> =>
    intentar(async () => JSON.parse(await readFile(ruta, "utf-8")) as unknown, null);

interface TareaCola { titulo?: string; prompt?: string }

/** Lee los `cola-*.json` reales (los `cola-auto-*` son tandas rodantes sin fichas
 *  redactadas) y devuelve las tareas indexadas por id. */
async function leerTareasDeColas(raiz: string): Promise<Map<string, TareaCola>> {
    const dir = path.join(raiz, "starseed_memory_root", "olas");
    const nombres = await intentar(async () => (await readdir(dir)).filter((n) => n.startsWith("cola-") && n.endsWith(".json")), [] as string[]);
    const tareas = new Map<string, TareaCola>();
    for (const nombre of nombres) {
        if (nombre.startsWith("cola-auto-")) continue;
        const crudo = await leerJsonOpcional(path.join(dir, nombre));
        const lista: unknown[] = Array.isArray(crudo) ? crudo
            : Array.isArray(objeto(crudo).tareas) ? (objeto(crudo).tareas as unknown[]) : [];
        for (const t of lista) {
            const d = objeto(t);
            const id = texto(d.id);
                if (id && !tareas.has(id)) tareas.set(id, { titulo: texto(d.titulo), prompt: texto(d.prompt) });
        }
    }
    return tareas;
}

/** Descripción = las dos primeras frases del prompt, tope 320 caracteres y
 *  nunca una palabra partida: se recorta en el último espacio anterior. */
export function descripcionDe(prompt: string): string {
    const limpio = prompt.trim().replace(/\s+/g, " ");
    const frases = limpio.split(/(?<=\.)\s+/);
    let descripcion = frases.slice(0, 2).join(" ");
    if (descripcion.length > 320) {
        const corte = descripcion.slice(0, 320);
        const ultimoEspacio = corte.lastIndexOf(" ");
        descripcion = (ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte).trimEnd();
    }
    return descripcion;
}

/** La nota del orquestador lleva «rama ola/<id> (<sha>)»; si no encaja se cae
 *  al respaldo `ola/<id>` con sha vacía (y entonces `archivos` saldrá vacío). */
export function ramaYShaDe(nota: string | undefined, id: string): { rama: string; sha: string } {
    const m = nota?.match(/rama (ola\/[\w.\-/]+) \(([0-9a-f]{7,40})\)/);
    return m ? { rama: m[1], sha: m[2] } : { rama: `ola/${id}`, sha: "" };
}

/** Líneas «mas\tmenos\truta» del numstat; los binarios traen `-` y cuentan 0. */
export function parseNumstat(salida: string): ArchivoTocado[] {
    const archivos: ArchivoTocado[] = [];
    for (const linea of salida.split("\n")) {
        if (!linea.trim()) continue;
        const [mas, menos, ruta] = linea.split("\t");
        if (!ruta) continue;
        const n = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
        archivos.push({ ruta, mas: n(mas), menos: n(menos) });
    }
    return archivos;
}

/** `git show` con execFile (nunca `exec` con cadena: la rama viene de una nota
 *  escrita por terceros). Si falla, la ficha sale igualmente con archivos []. */
async function archivosDeRama(raiz: string, ramaOut: string): Promise<ArchivoTocado[]> {
    return intentar(async () => {
        const { stdout } = await execFileAsync("git", ["show", "--numstat", "--format=", ramaOut], { cwd: raiz, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
        return parseNumstat(stdout);
    }, [] as ArchivoTocado[]);
}

/**
 * Fichas de las tareas en la puerta (`estado === "esperando_aprobacion"`).
 * Los campos del veredicto (`revisor`, `motivo_vb`, `faltan`) viajan en la
 * entrada de progreso y los consume `construirFicha` sin tocar este módulo.
 */
export async function leerAprobaciones(raiz: string, ahora: number): Promise<FichaAprobacion[]> {
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
        fichas.push(construirFicha({
            id,
            titulo: deCola?.titulo,
            descripcion: deCola?.prompt ? descripcionDe(deCola.prompt) : undefined,
            rama,
            sha,
            archivos: await archivosDeRama(raiz, rama),
            entrada: d,
            dependientes,
            t: texto(d.t),
        }, ahora));
    }
    return fichas;
}

