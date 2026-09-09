/**
 * Autocuración de colas huérfanas (Ola 298 · LT2 · 2026-09-08 · solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * LT1 dejó `latido-orquestador.ts` detectando colas «huérfanas» (tareas pendientes
 * cuyo orquestador ya no late). Aquí se les vuelve a dar vida: revivir una cola
 * lanza otra vez `starseed-enjambre.py` —reusando `lanzarAqui` de `colas.ts`, tal
 * cual, sin inventar otra forma de arrancar el proceso desacoplado— y una
 * «autocuración» opcional lo hace sola, sin que nadie toque un botón.
 *
 * ⚠️ Nada de esto arranca solo desde el módulo: quien dispara el barrido es la
 * interfaz (LT3) o una tarea programada; este archivo solo expone las funciones.
 * Seguridad: solo desde rutas `/api/mando/*` (404 en producción). Nunca se
 * devuelven claves ni rutas absolutas del disco.
 */

import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

import { lanzarAqui } from "@/lib/mando/colas";
import { saludDeLasColas, type SaludCola } from "@/lib/mando/latido-orquestador";
import { leerColas, leerProgreso } from "@/lib/mando/lector-local";
import { raizDelProyecto } from "@/lib/mando/raiz";

const execFileAsync = promisify(execFile);

const RAÍZ = raizDelProyecto();
/** Carpeta base de los worktrees: env `STARSEED_WT` o `<repo>/../starseed-wt`. */
const WT_BASE = resolverBaseWorktrees();

function resolverBaseWorktrees(): string {
    const env = process.env.STARSEED_WT;
    if (typeof env === "string" && env.length > 0) return env;
    return path.join(path.dirname(RAÍZ), "starseed-wt");
}

/** Estado del interruptor de autocuración, tal y como vive en disco. */
export interface EstadoAutocuracion {
    activa: boolean;
    actualizado: string | null;
}

/** Registro de una cola revivida por el barrido (una línea del .jsonl). */
interface RegistroAutocuracion {
    fecha: string;
    cola: string;
    motivo: string;
}

/** Resultado de revivir una cola: qué se hizo y por qué. */
export interface ResultadoRevivir {
    ok: boolean;
    lanzada: boolean;
    pid: number | null;
    detalle: string;
}

/** Resumen del barrido: lo que resucitó en una pasada. */
export interface ResultadoBarrido {
    ok: boolean;
    revividas: string[];
    omitidas: string[];
    detalle: string;
}

const CARPETA_MANDO = path.join(RAÍZ, "starseed_memory_root", "mando");
const ARCHIVO_AUTOCURACION = path.join(CARPETA_MANDO, "autocuracion.json");
const ARCHIVO_REGISTRO = path.join(CARPETA_MANDO, "autocuracion-registro.jsonl");

/** Mínimo de intentos por pasada de autocuración para no saturar la máquina. */
const MAXIMO_POR_PASADA = 2;

/**
 * ¿Está esa cola de verdad huérfana? Busca entre las saludes reales del disco:
 * si está «viva» no se lanza nada (dos orquestadores sobre la misma cola se pisan).
 */
async function saludDe(cola: string): Promise<SaludCola | null> {
    const saludes = await saludDeLasColas();
    return saludes.find((s) => s.cola === cola) ?? null;
}

/**
 * Worktrees limpios que no tocan nada de la cola: los que existen en `WT_BASE`
 * pero (a) su tarea no figura entre los «pendientes» de NINGUNA cola viva del
 * enjambre —son restos de tareas ya cerradas o de colas antiguas— y (b) no
 * tienen commits propios ni cambios sin confirmar (porcelain vacío). Poda solo
 * lo que es seguro perder; devuelve la lista de ids.
 */
async function worktreesLimpiables(idsPendientes: Set<string>): Promise<string[]> {
    let entradas: string[] = [];
    try {
        entradas = await readdir(WT_BASE);
    } catch {
        return []; // sin carpeta de worktrees no hay nada que limpiar
    }
    const limpiables: string[] = [];
    for (const nombre of entradas) {
        // Un worktree de una tarea con trabajo en marcha (de esta u otra cola
        // viva) no se toca, aunque parezca abandonado: lo suyo es esperar.
        if (idsPendientes.has(nombre)) continue;
        if (!(await worktreeSinCommitsPropios(nombre))) continue;
        if (await worktreeConCambios(nombre)) continue;
        limpiables.push(nombre);
    }
    return limpiables;
}

/** ¿Tiene la rama `ola/<id>` commits propios (no alcanzados por main)? */
async function worktreeSinCommitsPropios(id: string): Promise<boolean> {
    const wt = path.join(WT_BASE, id);
    try {
        const { stdout } = await execFileAsync("git", ["log", "--oneline", "main..ola/" + id], { cwd: wt, timeout: 30_000, windowsHide: true });
        return stdout.trim().length === 0;
    } catch {
        // sin rama o sin git: conservador, no se considera podable
        return false;
    }
}

/** Poda un worktree y su rama `ola/<id>` cuando no tiene commits propios. */
async function podarWorktree(id: string): Promise<void> {
    const wt = path.join(WT_BASE, id);
    try {
        await stat(wt);
    } catch {
        return; // no existe: nada que podar
    }
    await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: RAÍZ, timeout: 120_000, windowsHide: true }).catch(() => undefined);
    await execFileAsync("git", ["worktree", "prune"], { cwd: RAÍZ, timeout: 60_000, windowsHide: true }).catch(() => undefined);
    await execFileAsync("git", ["branch", "-D", `ola/${id}`], { cwd: RAÍZ, timeout: 30_000, windowsHide: true }).catch(() => undefined);
}

/** ¿Conserva ese worktree cambios (porcelain no vacío)? True si merece `--reanudar`. */
async function worktreeConCambios(id: string): Promise<boolean> {
    const wt = path.join(WT_BASE, id);
    try {
        const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: wt, timeout: 30_000, windowsHide: true });
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

/** Nombres de cola válidos, como los valida el Diseñador (p. ej. `298-mando`). */
const PATRON_NOMBRE = /^[0-9]{2,4}(-[a-z0-9]+){0,6}$/;

/**
 * Revive una cola huérfana: lanza otra vez su orquestador. Antes comprueba con
 * `saludDeLasColas()` que está de verdad huérfana (si está «viva» devuelve el motivo
 * sin lanzar: dos orquestadores se pisarían), poda los worktrees limpios de `WT_BASE`
 * con ramas `ola/*` sin commits propios y, si algún worktree de la cola conserva
 * cambios, relanza con `--reanudar` para no perder el trabajo ya escrito.
 */
export async function revivir(cola: string, trabajadores?: number): Promise<ResultadoRevivir> {
    const nombre = cola.trim().toLowerCase();
    if (!PATRON_NOMBRE.test(nombre)) {
        return { ok: false, lanzada: false, pid: null, detalle: "Nombre de cola no válido: usa «298-lo-que-sea» (número y palabras en minúscula)." };
    }

    // 1) ¿De verdad está huérfana? Nunca lanzar sobre una cola viva.
    const salud = await saludDe(nombre);
    if (!salud) return { ok: false, lanzada: false, pid: null, detalle: "No encuentro esa cola en el disco." };
    if (salud.estado === "viva") {
        return { ok: false, lanzada: false, pid: null, detalle: `Cola ${nombre} viva (${salud.motivo}): no la relanzo — dos orquestadores se pisarían.` };
    }
    if (salud.estado === "terminada") {
        return { ok: false, lanzada: false, pid: null, detalle: `Cola ${nombre} terminada: no hay nada que revivir.` };
    }

    // 2) Ids pendientes de la cola que se revivifica…
    const idsPendientes = new Set(await leerTareasPendientes(nombre));
    if (idsPendientes.size === 0) {
        return { ok: false, lanzada: false, pid: null, detalle: `Cola ${nombre} sin tareas pendientes: no hay nada que revivir.` };
    }
    // …y de TODAS las colas vivas del enjambre: sus worktrees están en uso y
    // no deben podarse aunque pertenezcan a otra cola.
    const pendientesDeVivas = new Set<string>();
    for (const s of await saludDeLasColas()) {
        if (s.estado !== "viva") continue;
        for (const id of await leerTareasPendientes(s.cola)) pendientesDeVivas.add(id);
    }

    // 3) Poda los worktrees limpios: restos de tareas ya cerradas, sin commits
    //    propios y sin cambios, que no pertenezcan a ninguna cola viva.
    const podables = await worktreesLimpiables(pendientesDeVivas);
    for (const id of podables) await podarWorktree(id);
    const podados = podables.length;

    // 4) ¿Algún worktree de ESTA cola conserva cambios? → `--reanudar` para no
    //    repetir lo ya escrito (el flag es global a la cola: basta con uno).
    let reanudadas = 0;
    for (const id of idsPendientes) {
        if (await worktreeConCambios(id)) reanudadas += 1;
    }
    const extra = reanudadas > 0 ? ["--reanudar"] : [];

    const n = typeof trabajadores === "number" && Number.isFinite(trabajadores) ? trabajadores : 2;
    const resultado = await lanzarAqui(nombre, n, extra);
    if (!resultado.ok) return { ok: false, lanzada: false, pid: null, detalle: resultado.error ?? "No se pudo lanzar." };

    const detalle = reanudadas > 0
        ? `Cola ${nombre} relanzada con ${Math.max(1, Math.round(n))} trabajadores y --reanudar (${reanudadas} worktree con cambios${podados > 0 ? `; ${podados} limpios podados` : ""}).`
        : `Cola ${nombre} relanzada con ${Math.max(1, Math.round(n))} trabajadores${podados > 0 ? ` y ${podados} worktree(s) limpio(s) podado(s)` : ""}.`;
    return { ok: true, lanzada: true, pid: resultado.pid ?? null, detalle };
}

/** Ids de las tareas de una cola que siguen pendientes (no cerradas), leyendo disco. */
async function leerTareasPendientes(cola: string): Promise<string[]> {
    const TERMINADAS = new Set(["commit", "bloqueante", "sin_cambios", "sustituida", "reasignada", "rechazada"]);
    const tareas = await leerColas();
    const progreso = await leerProgreso();
    return tareas
        .filter((t) => (t.cola || t.ola) === cola)
        .map((t) => t.id)
        .filter((id) => {
            const bruto = progreso[id];
            const estado = typeof bruto === "object" && bruto !== null && "estado" in bruto && typeof (bruto as { estado: unknown }).estado === "string"
                ? (bruto as { estado: string }).estado
                : "";
            return !TERMINADAS.has(estado);
        });
}

/** Lee el interruptor de autocuración del disco (por defecto `activa: false`). */
export async function estadoAutocuracion(): Promise<EstadoAutocuracion> {
    try {
        const crudo = JSON.parse(await readFile(ARCHIVO_AUTOCURACION, "utf-8")) as unknown;
        const datos = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
        return {
            activa: datos.activa === true,
            actualizado: typeof datos.actualizado === "string" ? datos.actualizado : null,
        };
    } catch {
        // Sin archivo = desactivada por defecto: la autocuración se enciende a propósito.
        return { activa: false, actualizado: null };
    }
}

/** Guarda el interruptor de autocuración con escritura atómica (tmp + rename). */
export async function guardarAutocuracion(activa: boolean): Promise<EstadoAutocuracion> {
    await mkdir(CARPETA_MANDO, { recursive: true });
    const temporal = `${ARCHIVO_AUTOCURACION}.tmp`;
    const actualizado = new Date().toISOString();
    const contenido = JSON.stringify({ activa, actualizado }, null, 2) + "\n";
    await writeFile(temporal, contenido, "utf-8");
    await rename(temporal, ARCHIVO_AUTOCURACION);
    return { activa, actualizado };
}

/** Añade una línea al registro de autocuración (rastro de quién resucitó qué). */
async function anotarRevivida(cola: string, motivo: string): Promise<void> {
    await mkdir(CARPETA_MANDO, { recursive: true });
    const linea: RegistroAutocuracion = { fecha: new Date().toISOString(), cola, motivo };
    await appendFile(ARCHIVO_REGISTRO, JSON.stringify(linea) + "\n", "utf-8");
}

/**
 * Recorre las colas huérfanas y relanza hasta `MAXIMO_POR_PASADA` (2) por pasada,
 * para no saturar la máquina. Solo actúa si la autocuración está encendida. Anota
 * cada revivida en `autocuracion-registro.jsonl` para dejar rastro.
 */
export async function barridoAutocuracion(): Promise<ResultadoBarrido> {
    const estado = await estadoAutocuracion();
    if (!estado.activa) {
        return { ok: true, revividas: [], omitidas: [], detalle: "La autocuración está apagada: no se revivió nada." };
    }

    const saludes = await saludDeLasColas();
    const huerfanas = saludes.filter((s) => s.estado === "huerfana");
    const revividas: string[] = [];
    const omitidas: string[] = [];

    for (const salud of huerfanas) {
        if (revividas.length >= MAXIMO_POR_PASADA) { omitidas.push(salud.cola); continue; }
        const resultado = await revivir(salud.cola);
        if (resultado.lanzada) {
            revividas.push(salud.cola);
            await anotarRevivida(salud.cola, salud.motivo);
        } else {
            omitidas.push(salud.cola);
        }
    }

    const detalle = revividas.length > 0
        ? `Autocuración: ${revividas.length} cola${revividas.length === 1 ? "" : "s"} revivida${revividas.length === 1 ? "" : "s"} (${revividas.join(", ")}).`
        : `Autocuración activa pero sin colas huérfanas que revivir${omitidas.length ? ` (${omitidas.length} no lanzaron)` : ""}.`;
    return { ok: true, revividas, omitidas, detalle };
}