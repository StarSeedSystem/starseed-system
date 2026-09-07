/**
 * Publicaciones del Puente de Mando (Ola 274 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista los commits sin publicar del OS y de Astraura (agrupados por ola, con
 * diffstat y base remota) y ejecuta publicaciones —producción (push a main),
 * vista previa (rama `vista-previa/mando`) o paquete (`git bundle`)— SOLO desde
 * la Mac de Alex (modo ligero, `STARSEED_LOCAL=1`) y siempre con confirmación
 * escrita. Nunca es automático: `git push` dispara el despliegue de Vercel, así
 * que solo lo firma el humano. Jamás se hace `fetch`, `pull`, `reset` ni `rebase`.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { raizDelProyecto } from "@/lib/mando/raiz";

export type RepoPublicable = "os" | "astraura";

export type CommitPendiente = {
    sha: string;
    corto: string;
    fecha: string; // ISO
    autor: string;
    asunto: string;
    ola: number | null;
    tarea: string | null;
    titulo: string;
    archivos: number;
    mas: number;
    menos: number;
};

export type PorOla = { ola: number | null; etiqueta: string; commits: number; ultimo: string };

export type EstadoRepoPublicable = {
    repo: RepoPublicable;
    nombre: string;
    ruta: string; // con ~
    rama: string;
    remoto: string | null;
    base: { sha: string; corto: string; fecha: string } | null;
    delante: number;
    detras: number | null;
    remotoMovido: boolean;
    arbolLimpio: boolean;
    enjambreEscribiendo: boolean;
    aviso: string | null;
    commits: CommitPendiente[];
    porOla: PorOla[];
    enlaces: { github: string | null; comparar: string | null; vercel: string | null };
};

/** Trabajo desacoplado de una publicación: se responde al instante y el resultado madura solo. */
export type TrabajoPublicacion = {
    id: string;
    repo: RepoPublicable;
    modo: ModoPublicacion;
    hasta: string;
    desde: string;
    estado: "en_curso" | "publicado" | "fallo";
    inicio: string;
    fin: string | null;
    salida: string; // últimas 40 líneas
    enlaces: { github: string | null; comparar: string | null; vercel: string | null };
};

export type ModoPublicacion = "produccion" | "vista-previa" | "paquete";

export type RespuestaPublicacion = { ok: boolean; id?: string; error?: string };

const execFileAsync = promisify(execFile);

// La expresión de los asuntos de tarea: «Ola 265 · Forja fase 3 · H1: Cadena…».
// La parte central puede llevar dos puntos («Forja fase 3: efectos…»): se toma
// lo más ancha posible y la tarea es el último « · XX: » antes del título.
const RE_ASUNTO = /^Ola (\d{2,4})(?: · .*)? · ([A-Z][A-Z0-9]{0,8}): (.*)$/;

// Carpeta de trabajos y bitácora: `starseed_memory_root/publicaciones/`.
const CARPETA = path.join("starseed_memory_root", "publicaciones");

/** Solo se acepta el sha completo, nunca texto libre: todo argumento de git validado. */
const RE_SHA = /^[0-9a-f]{40}$/i;

/** Rutas de los dos repositorios publicables (sin rutas absolutas literales en el código). */
function rutaRepo(repo: RepoPublicable): string {
    if (repo === "astraura") return process.env.ASTRAURA_158_DIR ?? path.join(homedir(), "Documents", "IA 1.58 bit");
    return raizDelProyecto();
}

const NOMBRE_REPO: Record<RepoPublicable, string> = { os: "StarSeed OS", astraura: "Astraura 1.58" };

/**
 * Traducción de la ruta absoluta a una forma corta con `~` para no revelar el disco
 * en la API (las rutas del Mando jamás devuelven rutas reales completas).
 */
function rutaBonita(ruta: string): string {
    const casa = homedir();
    return ruta.startsWith(casa) ? `~${ruta.slice(casa.length)}` : ruta;
}

/**
 * Función pura de análisis del `git log --format=… --shortstat @{u}..HEAD`:
 * una línea de cabecera por commit (`sha\th\tfecha\tautor\tasunto`) seguida de
 * una línea `--shortstat` opcional (« 3 files changed, 120 insertions(+), 4 deletions(-)»).
 * Los commits sin cambios (merge limpio) no tienen línea shortstat y cuentan 0/0/0.
 */
export function interpretarLog(salida: string): CommitPendiente[] {
    const commits: CommitPendiente[] = [];
    for (const cruda of salida.split("\n")) {
        const linea = cruda.replace(/\s+$/, "");
        if (!linea) continue;
        if (linea.includes("\t")) {
            const [sha = "", corto = "", fecha = "", autor = "", asunto = ""] = linea.split("\t");
            const m = RE_ASUNTO.exec(asunto);
            commits.push({
                sha,
                corto,
                fecha,
                autor,
                asunto,
                ola: m ? Number.parseInt(m[1] ?? "", 10) : null,
                tarea: m ? m[2] ?? null : null,
                titulo: m ? m[3] ?? asunto : asunto,
                archivos: 0,
                mas: 0,
                menos: 0,
            });
            continue;
        }
        const stat = /(\d+)\s+files? changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/.exec(linea);
        const ultimo = commits[commits.length - 1];
        if (stat && ultimo) {
            ultimo.archivos = Number.parseInt(stat[1] ?? "0", 10);
            ultimo.mas = stat[2] ? Number.parseInt(stat[2], 10) : 0;
            ultimo.menos = stat[3] ? Number.parseInt(stat[3], 10) : 0;
        }
    }
    return commits;
}

/** Agrupa commits por ola (de llegada: el log va de nuevo a viejo, y el grupo hereda ese orden). */
function agruparPorOla(commits: CommitPendiente[]): PorOla[] {
    const grupos: PorOla[] = [];
    const indice = new Map<string, PorOla>();
    for (const c of commits) {
        const clave = c.ola === null ? "sin-ola" : String(c.ola);
        let grupo = indice.get(clave);
        if (!grupo) {
            grupo = { ola: c.ola, etiqueta: c.ola === null ? "Sin ola" : `Ola ${c.ola}`, commits: 0, ultimo: c.corto };
            indice.set(clave, grupo);
            grupos.push(grupo);
        }
        grupo.commits += 1;
        grupo.ultimo = c.corto; // «último» = el más antiguo del grupo (base de la ola)
    }
    return grupos;
}

/** Ejecuta git en un repo con tope de tiempo; devuelve stdout o lanza con stderr recortado. */
async function git(cwd: string, args: string[], topeMs = 10000): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: topeMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
}

/** Cierto si el enjambre está escribiendo (un solo agente toca el working tree a la vez). */
async function enjambreVivo(): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync("pgrep", ["-f", "starseed-enjambre.py"], { timeout: 5000, windowsHide: true });
        return stdout.trim().length > 0;
    } catch {
        return false; // pgrep devuelve 1 cuando no hay coincidencias
    }
}

/** `git@github.com:X/Y.git` → `https://github.com/X/Y` (y https tal cual, sin .git). */
export function urlGithub(remotoUrl: string): string | null {
    const limpia = remotoUrl.trim().replace(/\.git$/, "");
    const ssh = /^git@([^:]+):(.+)$/.exec(limpia);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    if (/^https?:\/\//.test(limpia)) return limpia;
    return null;
}

/** Proyecto de Vercel enlazado en `.vercel/project.json` (si el repo lo tiene). */
async function proyectoVercel(cwd: string): Promise<string | null> {
    try {
        const bruto = await readFile(path.join(cwd, ".vercel", "project.json"), "utf8");
        const datos = JSON.parse(bruto) as Record<string, unknown>;
        const nombre = datos.projectName;
        return typeof nombre === "string" && nombre ? `https://vercel.com/starseeds-projects/${nombre}` : null;
    } catch {
        return null;
    }
}

/**
 * Estado de publicaciones de un repo: commits pendientes sobre la rama remota
 * registrada (`@{u}`). Sin remoto configurado no hay nada que listar: devuelve
 * la entrada con `remoto: null` y un aviso. Jamás hace fetch ni pull: para saber
 * si el remoto se movió se pregunta con `git ls-remote` (solo lectura, 6 s).
 */
export async function leerPendientes(repo: RepoPublicable): Promise<EstadoRepoPublicable> {
    const cwd = rutaRepo(repo);
    const base: EstadoRepoPublicable = {
        repo,
        nombre: NOMBRE_REPO[repo],
        ruta: rutaBonita(cwd),
        rama: "",
        remoto: null,
        base: null,
        delante: 0,
        detras: null,
        remotoMovido: false,
        arbolLimpio: true,
        enjambreEscribiendo: false,
        aviso: null,
        commits: [],
        porOla: [],
        enlaces: { github: null, comparar: null, vercel: null },
    };

    let rama = "";
    try {
        rama = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    } catch {
        base.aviso = "No se pudo leer este repositorio (¿existe en esta máquina?).";
        return base;
    }
    base.rama = rama;
    base.enjambreEscribiendo = await enjambreVivo();

    let remotoRef: string;
    try {
        remotoRef = (await git(cwd, ["rev-parse", "--abbrev-ref", "@{u}"])).trim();
    } catch {
        base.aviso = "Esta rama no tiene rama remota configurada: no hay pendientes que medir.";
        return base;
    }
    base.remoto = remotoRef;

    const [baseSha, baseFecha, conteos, log, estado, remotoUrl] = await Promise.all([
        git(cwd, ["rev-parse", "@{u}"]),
        git(cwd, ["show", "-s", "--format=%aI", "@{u}"]),
        git(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]),
        git(cwd, ["log", "--format=%H%x09%h%x09%aI%x09%an%x09%s", "--shortstat", "@{u}..HEAD"]),
        git(cwd, ["status", "--porcelain", "-uall"]),
        git(cwd, ["remote", "get-url", "origin"]).catch(() => ""),
    ]);

    const shaBase = baseSha.trim();
    base.base = { sha: shaBase, corto: shaBase.slice(0, 7), fecha: baseFecha.trim() };
    const [detras = "0", delante = "0"] = conteos.trim().split(/\s+/);
    base.detras = Number.parseInt(detras, 10);
    base.delante = Number.parseInt(delante, 10);
    base.arbolLimpio = estado.trim().length === 0;
    base.commits = interpretarLog(log);
    base.porOla = agruparPorOla(base.commits);

    // Si el remoto se movió desde que esta máquina lo vio por última vez, publicar
    // a ciegas sería un desastre: se compara el sha anunciado por el remoto con el
    // del registro local (`@{u}`) sin tocar nada (ls-remote es de solo lectura).
    try {
        const anuncio = await git(cwd, ["ls-remote", "--heads", "origin", rama], 6000);
        const shaRemoto = anuncio.trim().split(/\s+/)[0] ?? "";
        base.remotoMovido = shaRemoto.length >= 40 && shaRemoto !== shaBase;
    } catch {
        // Sin red no se puede saber: se deja en falso y el push ya dirá.
    }

    const github = remotoUrl ? urlGithub(remotoUrl) : null;
    const vercel = await proyectoVercel(cwd);
    const headCorto = base.commits[0]?.corto ?? "";
    base.enlaces = {
        github,
        comparar: github && headCorto ? `${github}/compare/${shaBase.slice(0, 7)}...${headCorto}` : null,
        vercel,
    };
    return base;
}

/** Línea de la bitácora de publicaciones (`bitacora.jsonl`). */
export type LineaBitacora = {
    t: string;
    id: string;
    repo: RepoPublicable;
    modo: ModoPublicacion;
    desde: string;
    hasta: string;
    commits: number;
    estado: "publicado" | "fallo";
    quien: string;
    medio: "mando";
};

async function leerBitacora(): Promise<LineaBitacora[]> {
    try {
        const crudo = await readFile(path.join(raizDelProyecto(), CARPETA, "bitacora.jsonl"), "utf8");
        const lineas: LineaBitacora[] = [];
        for (const l of crudo.split("\n")) {
            if (!l.trim()) continue;
            try {
                const d = JSON.parse(l) as LineaBitacora;
                if (typeof d.id === "string" && typeof d.t === "string") lineas.push(d);
            } catch { /* línea dañada: se salta */ }
        }
        return lineas.slice(-10);
    } catch {
        return [];
    }
}

export type ResumenPublicaciones = {
    t: string;
    repos: EstadoRepoPublicable[];
    bitacora: LineaBitacora[];
};

/** Todo de golpe: los dos repos en paralelo y la bitácora; un repo ausente no tumba al otro. */
export async function leerTodo(): Promise<ResumenPublicaciones> {
    const [os, astraura, bitacora] = await Promise.all([
        leerPendientes("os").catch(() => null),
        leerPendientes("astraura").catch(() => null),
        leerBitacora(),
    ]);
    const repos = [os, astraura].filter((r): r is EstadoRepoPublicable => r !== null);
    return { t: new Date().toISOString(), repos, bitacora };
}

/** Aviso en el bus (`relevo_eventos`) de la publicación: datos, nunca salidas largas. */
async function eventoBus(tipo: "publicado" | "publicacion_fallida", trabajo: TrabajoPublicacion, quien: string): Promise<void> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return;
    try {
        await fetch(`${url}/rest/v1/relevo_eventos`, {
            method: "POST",
            headers: { apikey: clave, Authorization: `Bearer ${clave}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({
                quien: "mando",
                tipo,
                tarea: "",
                texto: `${tipo === "publicado" ? "publicado" : "publicación fallida"} · ${trabajo.repo} · ${trabajo.modo} · hasta ${trabajo.hasta.slice(0, 7)}`,
                datos: { id: trabajo.id, repo: trabajo.repo, modo: trabajo.modo, desde: trabajo.desde, hasta: trabajo.hasta, quien, categoria: "publicacion" },
            }),
        });
    } catch { /* el bus es un extra: nunca tumba la publicación */ }
}

/** Ejecuta la orden de git del trabajo y deja el resultado en su archivo JSON. */
async function ejecutarTrabajo(trabajo: TrabajoPublicacion, cwd: string, args: string[], quien: string, carpetaAbs: string, commits: number): Promise<void> {
    let estado: "publicado" | "fallo" = "publicado";
    let salida = "";
    try {
        const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout: 55000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
        salida = `${stdout}\n${stderr}`.trim();
    } catch (e) {
        estado = "fallo";
        const err = e as { stdout?: string; stderr?: string; message?: string };
        salida = `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? "error"}`.trim();
    }
    trabajo.estado = estado;
    trabajo.fin = new Date().toISOString();
    trabajo.salida = salida.split("\n").slice(-40).join("\n");
    await writeFile(path.join(carpetaAbs, `${trabajo.id}.json`), JSON.stringify(trabajo, null, 2), "utf8");
    const linea: LineaBitacora = {
        t: trabajo.fin, id: trabajo.id, repo: trabajo.repo, modo: trabajo.modo,
        desde: trabajo.desde, hasta: trabajo.hasta, commits, estado, quien, medio: "mando",
    };
    await appendFile(path.join(carpetaAbs, "bitacora.jsonl"), `${JSON.stringify(linea)}\n`, "utf8").catch(() => undefined);
    await eventoBus(estado === "publicado" ? "publicado" : "publicacion_fallida", trabajo, quien);
}

export type PeticionPublicar = {
    repo: RepoPublicable;
    modo: ModoPublicacion;
    hasta?: string;
    confirmacion: string;
    quien: string;
};

/**
 * Puertas de publicación (no toca git salvo lecturas):
 * solo la Mac (`STARSEED_LOCAL=1`), confirmación escrita exacta («PUBLICAR» en
 * producción; «OK» basta para vista previa y paquete), `hasta` válido (sha
 * completo, ancestro de HEAD y NO aún publicado en `@{u}`) y el remoto quieto.
 */
export async function publicar(p: PeticionPublicar): Promise<RespuestaPublicacion> {
    // Es la puerta de oro: publicar dispara Vercel; solo la máquina de Alex puede.
    if (process.env.STARSEED_LOCAL !== "1") {
        return { ok: false, error: "Publicar solo se permite desde la Mac de Alex (modo ligero)." };
    }
    if (p.modo !== "produccion" && p.modo !== "vista-previa" && p.modo !== "paquete") {
        return { ok: false, error: "Modo de publicación desconocido." };
    }
    const esperada = p.modo === "produccion" ? "PUBLICAR" : "OK";
    if (p.confirmacion !== esperada) {
        return { ok: false, error: `Confirmación incorrecta: escribe exactamente «${esperada}».` };
    }

    const cwd = rutaRepo(p.repo);
    let estado: EstadoRepoPublicable;
    try {
        estado = await leerPendientes(p.repo);
    } catch {
        return { ok: false, error: "No se pudo leer el repositorio." };
    }
    if (!estado.remoto || !estado.base) return { ok: false, error: estado.aviso ?? "Sin rama remota configurada." };
    if (estado.delante === 0) return { ok: false, error: "No hay commits pendientes que publicar." };
    if (estado.remotoMovido && p.modo === "produccion") {
        return { ok: false, error: "El remoto se movió: primero integra a mano." };
    }

    // Punto de corte: HEAD por defecto; si viene `hasta`, debe ser un sha completo,
    // ancestro de HEAD y que aún no esté publicado en la rama remota.
    let hasta = "";
    if (p.hasta !== undefined && p.hasta !== "") {
        if (!RE_SHA.test(p.hasta)) return { ok: false, error: "«hasta» debe ser un sha completo de 40 caracteres." };
        const esDeHead = await execFileAsync("git", ["merge-base", "--is-ancestor", p.hasta, "HEAD"], { cwd, timeout: 8000, windowsHide: true }).then(() => true).catch(() => false);
        if (!esDeHead) return { ok: false, error: "Ese commit no es ancestro de HEAD." };
        const yaPublicado = await execFileAsync("git", ["merge-base", "--is-ancestor", p.hasta, "@{u}"], { cwd, timeout: 8000, windowsHide: true }).then(() => true).catch(() => false);
        if (yaPublicado)         return { ok: false, error: "Ese commit ya está publicado en el remoto." };
        hasta = p.hasta;
    } else {
        hasta = (await git(cwd, ["rev-parse", "HEAD"])).trim();
    }
    // Cuántos commits publica esta orden: del más nuevo al `hasta`, ambos incluidos
    // (el log viene de nuevo a viejo; si `hasta` no está en la lista es HEAD y los cuenta todos).
    const idxHasta = estado.commits.findIndex((c) => c.sha === hasta);
    const seleccionados = idxHasta === -1 ? estado.delante : idxHasta + 1;
    const desde = estado.base.sha;

    // Trabajo desacoplado: se responde al instante y el push madura en segundo plano
    // (el `next start` de la Mac vive lo suficiente para dejarlo escrito).
    const ahora = new Date();
    const sello = ahora.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    const id = `pub-${sello}`;
    const carpetaAbs = path.join(raizDelProyecto(), CARPETA);
    await mkdir(carpetaAbs, { recursive: true });

    let args: string[];
    let enlaces = estado.enlaces;
    if (p.modo === "produccion") {
        args = ["push", "origin", `${hasta}:refs/heads/${estado.rama}`];
    } else if (p.modo === "vista-previa") {
        // Rama propia del Mando: nunca main, nunca --force a secas.
        args = ["push", "--force-with-lease", "origin", `${hasta}:refs/heads/vista-previa/mando`];
        enlaces = {
            github: estado.enlaces.github,
            comparar: estado.enlaces.github ? `${estado.enlaces.github}/compare/${desde.slice(0, 7)}...vista-previa/mando` : null,
            vercel: estado.enlaces.vercel,
        };
    } else {
        await mkdir(path.join(cwd, ".transfer"), { recursive: true });
        args = ["bundle", "create", path.join(".transfer", `mando-${id}.bundle`), `${desde}..${hasta}`];
        enlaces = { github: null, comparar: null, vercel: `.transfer/mando-${id}.bundle` };
    }

    const trabajo: TrabajoPublicacion = {
        id, repo: p.repo, modo: p.modo, hasta, desde,
        estado: "en_curso", inicio: ahora.toISOString(), fin: null, salida: "", enlaces,
    };
    await writeFile(path.join(carpetaAbs, `${id}.json`), JSON.stringify(trabajo, null, 2), "utf8");
    void ejecutarTrabajo(trabajo, cwd, args, p.quien, carpetaAbs, seleccionados).catch(() => undefined);
    return { ok: true, id };
}

/** Lee el estado de un trabajo de publicación por su id (contra suplantación de ruta). */
export async function leerTrabajo(id: string): Promise<TrabajoPublicacion | null> {
    if (!/^pub-\d{8}-\d{6}$/.test(id)) return null;
    try {
        const bruto = await readFile(path.join(raizDelProyecto(), CARPETA, `${id}.json`), "utf8");
        return JSON.parse(bruto) as TrabajoPublicacion;
    } catch {
        return null;
    }
}
