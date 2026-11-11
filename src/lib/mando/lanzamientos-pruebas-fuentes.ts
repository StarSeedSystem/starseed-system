/**
 * Fuentes de las versiones de prueba (VER1111F · contrato centro-versiones-1105.md §10) · SOLO SERVIDOR.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reúne los hechos y deja decidir a `lanzamientos-pruebas.ts` (puro):
 *  - GitHub con `gh`, igual que el director de lanzamientos (`gh run list/view --json …`): nunca imprime ni
 *    devuelve el token (gh lo guarda en su llavero);
 *  - el registro del lanzador del supervisor (`~/.starseed/opus1031/lanzar-prueba<N>.log`), solo lectura;
 *  - los manifiestos públicos de la prerelease `canal-pruebas` (directa → API, `leerJsonConRutas`);
 *  - git del repo (`git log`, `git rev-parse HEAD`);
 *  - `~/.starseed/produccion/pruebas-comprobaciones.json` y `lanzamientos-estado.json` /
 *    `autopublicar-estado.json` (solo lectura de estos dos).
 * `STARSEED_PRODUCCION_DIR` y `STARSEED_LANZADOR_DIR` cambian las carpetas (pruebas con carpetas temporales).
 * Todo se calcula una vez por minuto y se comparte (`compartirCalculo`).
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { leerJsonConRutas } from "@/lib/actualizaciones/rutas-github";
import { URL_MANIFIESTO_PRUEBAS, URL_MANIFIESTO_PRUEBAS_ANDROID } from "@/lib/actualizaciones/canal-pruebas";
import { compartirCalculo } from "@/lib/mando/calculo-compartido";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { NATIVE_VERSION } from "@/lib/version/os-release";

import type { ArchivoComprobaciones, CommitPrueba, RespuestaPruebas } from "./lanzamientos-pruebas-tipos";
import {
    aprobacionesDelDirector,
    construirVersiones,
    esRunDePruebas,
    leerLanzador,
    leerLogGit,
    normalizarComprobaciones,
    numeroDePrueba,
    resumenPruebas,
    versionDeManifiesto,
    type JobGh,
    type LanzadorLeido,
    type RunGh,
} from "./lanzamientos-pruebas";

const ejecutar = promisify(execFile);
const REPO = "StarSeedSystem/starseed-system";

export function carpetaProduccion(): string {
    return process.env.STARSEED_PRODUCCION_DIR || path.join(os.homedir(), ".starseed", "produccion");
}
export function rutaComprobaciones(): string {
    return path.join(carpetaProduccion(), "pruebas-comprobaciones.json");
}
export function rutaPeticionLanzamientos(): string {
    return path.join(carpetaProduccion(), "lanzamientos-peticion.json");
}
function carpetaLanzador(): string {
    return process.env.STARSEED_LANZADOR_DIR || path.join(os.homedir(), ".starseed", "opus1031");
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

export async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}

export async function leerComprobaciones(): Promise<ArchivoComprobaciones> {
    return normalizarComprobaciones(await leerJson(rutaComprobaciones()));
}

export async function escribirComprobaciones(a: ArchivoComprobaciones): Promise<void> {
    await escribirAtomico(rutaComprobaciones(), a);
}

export function hayPeticionPendiente(): boolean {
    return existsSync(rutaPeticionLanzamientos());
}

// ── gh y git ───────────────────────────────────────────────────────────────────────────────────────

/** launchd no trae el PATH de Homebrew: se prueba la ruta absoluta antes que «gh». */
const GH = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"];

async function ghJson(args: string[], timeout = 25_000): Promise<unknown> {
    for (const bin of GH) {
        if (bin.startsWith("/") && !existsSync(bin)) continue;
        try {
            const { stdout } = await ejecutar(bin, [...args, "--repo", REPO], { timeout, maxBuffer: 8 * 1024 * 1024 });
            return JSON.parse(stdout) as unknown;
        } catch {
            return null; // gh existe pero falló (red, sesión): no se prueba otro binario
        }
    }
    return null;
}

export async function git(args: string[], timeout = 20_000): Promise<{ ok: boolean; salida: string }> {
    try {
        const { stdout } = await ejecutar("git", ["-C", raizDelProyecto(), ...args], { timeout, maxBuffer: 4 * 1024 * 1024 });
        return { ok: true, salida: stdout.trim() };
    } catch {
        return { ok: false, salida: "" };
    }
}

export async function cabezaDeMain(): Promise<string | null> {
    const r = await git(["rev-parse", "HEAD"]);
    return r.ok && /^[0-9a-f]{40}$/.test(r.salida) ? r.salida : null;
}

/** Los jobs de un run terminado no cambian: se guardan para no volver a pedirlos. */
const jobsTerminados = new Map<number, JobGh[]>();

async function runsDePruebas(avisos: string[]): Promise<{ run: RunGh; jobs: JobGh[] | null }[]> {
    const lista = (await ghJson([
        "run", "list", "--workflow", "native-build.yml", "--limit", "15",
        "--json", "databaseId,number,headSha,status,conclusion,event,headBranch,createdAt,url",
    ])) as RunGh[] | null;
    if (!Array.isArray(lista)) {
        avisos.push("No pude leer los runs de GitHub (gh no respondió): el build por plataforma es desconocido.");
        return [];
    }
    const candidatos = lista.filter((r) => r.event === "workflow_dispatch" && r.headBranch === "main").slice(0, 8);
    const fuera = await Promise.all(
        candidatos.map(async (run) => {
            const guardado = jobsTerminados.get(run.databaseId);
            if (guardado) return { run, jobs: guardado };
            const datos = (await ghJson(["run", "view", String(run.databaseId), "--json", "jobs"])) as { jobs?: JobGh[] } | null;
            const jobs = Array.isArray(datos?.jobs) ? datos.jobs : null;
            if (jobs && run.status === "completed") jobsTerminados.set(run.databaseId, jobs);
            return { run, jobs };
        }),
    );
    const sinJobs = fuera.filter((r) => !r.jobs).map((r) => r.run.number);
    if (sinJobs.length) avisos.push(`No pude leer los jobs de ${sinJobs.length === 1 ? "la ejecución" : "las ejecuciones"} ${sinJobs.join(", ")}: no sé si ${sinJobs.length === 1 ? "es" : "son"} de pruebas ni su build.`);
    return fuera;
}

async function lanzadores(ahora: number): Promise<LanzadorLeido[]> {
    const dir = carpetaLanzador();
    let nombres: string[] = [];
    try {
        nombres = await readdir(dir);
    } catch {
        return [];
    }
    const fuera: LanzadorLeido[] = [];
    for (const n of nombres) {
        const m = n.match(/^lanzar-(prueba\d{1,5})\.log$/);
        if (!m) continue;
        try {
            const ruta = path.join(dir, n);
            const s = await stat(ruta);
            const contenido = (await readFile(ruta, "utf-8")).slice(0, 8_000);
            const l = leerLanzador(m[1], contenido, s.mtimeMs, ahora);
            if (l) fuera.push(l);
        } catch {
            /* un registro ilegible no tumba el resto */
        }
    }
    return fuera;
}

async function manifiestos(avisos: string[]): Promise<{ escritorio: string | null; android: string | null }> {
    const sin = { esperar: async () => {}, maxIntentos: 2 };
    const [e, a] = await Promise.all([
        leerJsonConRutas(URL_MANIFIESTO_PRUEBAS, sin),
        leerJsonConRutas(URL_MANIFIESTO_PRUEBAS_ANDROID, sin),
    ]);
    if (!e.ok && !e.noExiste) avisos.push(`No pude leer latest-prueba.json (${e.motivo}).`);
    if (!a.ok && !a.noExiste) avisos.push(`No pude leer latest-prueba-android.json (${a.motivo}).`);
    return { escritorio: e.ok ? versionDeManifiesto(e.valor) : null, android: a.ok ? versionDeManifiesto(a.valor) : null };
}

async function logEntre(desde: string | null, hasta: string): Promise<CommitPrueba[] | null> {
    const rango = desde ? `${desde}..${hasta}` : hasta;
    const r = await git(["log", "--no-merges", "--format=%H%x1f%s", "-n", desde ? "300" : "30", rango]);
    return r.ok ? leerLogGit(r.salida) : null;
}

function ultimoPublicado(autopub: unknown): string | null {
    const a = (autopub ?? {}) as { fase?: string; sha?: string; historial?: { resultado?: string; sha?: string }[] };
    if (a.fase === "publicado" && a.sha) return a.sha;
    for (const h of [...(a.historial ?? [])].reverse()) if (h.resultado === "publicado" && h.sha) return h.sha;
    return null;
}

/** Reúne todo y monta la respuesta del panel. */
export async function reunirPruebas(ahora = Date.now()): Promise<RespuestaPruebas> {
    const avisos: string[] = [];
    const [runs, lz, archivo, man, estadoDirector, autopub, cabeza] = await Promise.all([
        runsDePruebas(avisos),
        lanzadores(ahora),
        leerComprobaciones(),
        manifiestos(avisos),
        leerJson(path.join(carpetaProduccion(), "lanzamientos-estado.json")),
        leerJson(path.join(carpetaProduccion(), "autopublicar-estado.json")),
        cabezaDeMain(),
    ]);
    if (!cabeza) avisos.push("No pude leer git del repo: no sé qué trae cada prueba ni si main avanzó.");

    // Commits de cada prueba, de la anterior a esta (las seis más nuevas con commit conocido).
    const shas = new Map<number, string>();
    for (const { run, jobs } of runs) if (esRunDePruebas(run, jobs)) shas.set(run.number, run.headSha);
    for (const l of lz) if (l.sha && !shas.has(l.numero)) shas.set(l.numero, l.sha);
    for (const [k, p] of Object.entries(archivo.pruebas)) if (p.sha && !shas.has(Number(k))) shas.set(Number(k), p.sha);
    const orden = [...shas.keys()].sort((a, b) => b - a);
    const contenido: Record<number, { desde: string | null; commits: CommitPrueba[] }> = {};
    const mainMovido: Record<number, { cabeza: string; commits: CommitPrueba[] }> = {};
    if (cabeza) {
        await Promise.all(
            orden.slice(0, 6).map(async (n, i) => {
                const desde = orden[i + 1] !== undefined ? shas.get(orden[i + 1]) ?? null : null;
                const commits = await logEntre(desde, shas.get(n) as string);
                if (commits) contenido[n] = { desde, commits };
            }),
        );
        // Main después del commit probado (solo las que se pueden aprobar: las tres más nuevas con run).
        await Promise.all(
            orden.slice(0, 3).map(async (n) => {
                const sha = shas.get(n) as string;
                if (!/^[0-9a-f]{40}$/.test(sha) || sha === cabeza) return;
                const dentro = await git(["merge-base", "--is-ancestor", sha, cabeza]);
                if (!dentro.ok) return;
                const commits = await logEntre(sha, cabeza);
                if (commits) mainMovido[n] = { cabeza, commits };
            }),
        );
    }

    const versiones = construirVersiones({
        ahora,
        nativa: NATIVE_VERSION,
        runs,
        lanzadores: lz,
        archivo,
        manifiestos: man,
        contenido,
        mainMovido,
        director: aprobacionesDelDirector(estadoDirector),
    });
    return {
        versiones,
        resumen: resumenPruebas(versiones, ahora),
        web: ultimoPublicado(autopub),
        avisos,
        generadoEn: new Date(ahora).toISOString(),
    };
}

/** Una vez por minuto para todos; nadie espera más de 8 s si ya hay una foto anterior. */
export const pruebasCompartidas = compartirCalculo(() => reunirPruebas(), 60_000, () => Date.now(), 8_000, 3 * 60_000);

export { numeroDePrueba };
