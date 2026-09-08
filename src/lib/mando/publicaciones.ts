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

import { execFile, spawn } from "node:child_process";
import { closeSync as fsClose, openSync as fsOpen } from "node:fs";
import { mkdir, readdir, readFile, appendFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { limpiarRegenerables, medirDisco, medirRegenerables } from "@/lib/mando/almacenamiento";
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

/** Enlaces de una publicación: GitHub, comparar, Vercel y la ruta del paquete. */
export type EnlacesPublicacion = {
    github: string | null;
    comparar: string | null;
    vercel: string | null;
    /** Ruta relativa del `.bundle` creado (solo modo «paquete»); nunca en vercel. */
    paquete: string | null;
};

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
    enlaces: EnlacesPublicacion;
};

/** Trabajo desacoplado de una publicación: se responde al instante y el resultado madura solo. */
export type TrabajoPublicacion = {
    id: string;
    repo: RepoPublicable;
    modo: ModoPublicacion;
    hasta: string;
    hastaCorto: string;
    desde: string;
    desdeCorto: string;
    commits: number;
    estado: "en_curso" | "publicado" | "fallo";
    inicio: string;
    fin: string | null;
    salida: string; // últimas 40 líneas
    enlaces: EnlacesPublicacion;
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

/** Argumentos de git de una publicación y, si el paquete necesita ref temporal, su nombre. */
export type ArgumentosPublicacion = {
    args: string[];
    refTemporal: string | null;
};

/**
 * Función pura que decide la orden de git de una publicación. «esHead» indica que
 * el corte `hasta` es exactamente HEAD. El modo paquete (2026-09-07 · Ola 274 · C3)
 * NO puede empaquetar `<desde>..<sha>` porque `git bundle` exige que el extremo sea
 * una ref: si el corte es HEAD se usa `<desde>..<rama>`; si no, se pide una ref
 * temporal `refs/publicar/<id>` que quien la llama crea y borra alrededor del bundle.
 */
export function argumentosPublicacion(opts: {
    modo: ModoPublicacion;
    desde: string;
    hasta: string;
    rama: string;
    id: string;
    esHead: boolean;
}): ArgumentosPublicacion {
    const { modo, desde, hasta, rama, id, esHead } = opts;
    if (modo === "produccion") {
        // Push a la rama remota registrada; jamás --force ni otra rama.
        return { args: ["push", "origin", `${hasta}:refs/heads/${rama}`], refTemporal: null };
    }
    if (modo === "vista-previa") {
        // Rama propia del Mando, con --force-with-lease (nunca --force a secas).
        return { args: ["push", "--force-with-lease", "origin", `${hasta}:refs/heads/vista-previa/mando`], refTemporal: null };
    }
    // Paquete: el extremo superior debe ser una ref, no un sha suelto.
    const fichero = path.join(".transfer", `mando-${id}.bundle`);
    if (esHead) {
        return { args: ["bundle", "create", fichero, `${desde}..${rama}`], refTemporal: null };
    }
    const ref = `refs/publicar/${id}`;
    return { args: ["bundle", "create", fichero, `${desde}..${ref}`], refTemporal: ref };
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
        enlaces: { github: null, comparar: null, vercel: null, paquete: null },
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
        paquete: null,
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

/** Vista previa local del OS (modo ligero en :9002). buildCommit/buildT salen
 *  de `starseed_memory_root/publicaciones/build-local.json`, escrito en cada
 *  reconstrucción; `head` es HEAD del repo OS; `sirviendo` comprueba el HTTP. */
export type VistaPreviaLocal = {
    url: string;
    buildCommit: string | null;
    buildT: string | null;
    head: string | null;
    atrasado: boolean;
    sirviendo: boolean;
};

export type ResumenPublicaciones = {
    t: string;
    repos: EstadoRepoPublicable[];
    bitacora: LineaBitacora[];
    vistaPrevia: VistaPreviaLocal;
};

/** Todo de golpe: los dos repos en paralelo, la bitácora y la vista previa local
 *  (un repo ausente no tumba a los demás; la vista previa tampoco). */
export async function leerTodo(): Promise<ResumenPublicaciones> {
    const [os, astraura, bitacora, vistaPrevia] = await Promise.all([
        leerPendientes("os").catch(() => null),
        leerPendientes("astraura").catch(() => null),
        leerBitacora(),
        leerVistaPrevia().catch(() => null),
    ]);
    const repos = [os, astraura].filter((r): r is EstadoRepoPublicable => r !== null);
    return {
        t: new Date().toISOString(),
        repos,
        bitacora,
        vistaPrevia: vistaPrevia ?? { url: "http://localhost:9002", buildCommit: null, buildT: null, head: null, atrasado: true, sirviendo: false },
    };
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
async function ejecutarTrabajo(
    trabajo: TrabajoPublicacion,
    cwd: string,
    args: string[],
    quien: string,
    carpetaAbs: string,
    commits: number,
    refTemporal: string | null,
): Promise<void> {
    let estado: "publicado" | "fallo" = "publicado";
    let salida = "";
    // Si el paquete pide ref temporal (corte parcial), se crea antes del bundle
    // y se borra al terminar —también si el bundle falla— para no dejar refs sueltas.
    if (refTemporal) {
        try {
            await execFileAsync("git", ["update-ref", refTemporal, trabajo.hasta], { cwd, timeout: 8000, windowsHide: true });
        } catch (e) {
            estado = "fallo";
            const err = e as { stderr?: string; message?: string };
            salida = `no se pudo crear la ref temporal ${refTemporal}: ${err.stderr ?? err.message ?? "error"}`;
        }
    }
    if (estado === "publicado") {
        try {
            const { stdout, stderr } = await execFileAsync("git", args, { cwd, timeout: 55000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
            salida = `${stdout}\n${stderr}`.trim();
        } catch (e) {
            estado = "fallo";
            const err = e as { stdout?: string; stderr?: string; message?: string };
            salida = `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? "error"}`.trim();
        }
    }
    if (refTemporal) {
        try {
            await execFileAsync("git", ["update-ref", "-d", refTemporal], { cwd, timeout: 8000, windowsHide: true });
        } catch { /* la ref temporal queda en el repo para que el humano la borre a mano */ }
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
    const headSha = (await git(cwd, ["rev-parse", "HEAD"])).trim();
    let hasta = "";
    let esHead = true;
    if (p.hasta !== undefined && p.hasta !== "") {
        if (!RE_SHA.test(p.hasta)) return { ok: false, error: "«hasta» debe ser un sha completo de 40 caracteres." };
        const esDeHead = await execFileAsync("git", ["merge-base", "--is-ancestor", p.hasta, "HEAD"], { cwd, timeout: 8000, windowsHide: true }).then(() => true).catch(() => false);
        if (!esDeHead) return { ok: false, error: "Ese commit no es ancestro de HEAD." };
        const yaPublicado = await execFileAsync("git", ["merge-base", "--is-ancestor", p.hasta, "@{u}"], { cwd, timeout: 8000, windowsHide: true }).then(() => true).catch(() => false);
        if (yaPublicado)         return { ok: false, error: "Ese commit ya está publicado en el remoto." };
        hasta = p.hasta;
        esHead = p.hasta === headSha;
    } else {
        hasta = headSha;
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

    // La orden de git la decide la función pura; el paquete puede pedir una ref temporal.
    const { args, refTemporal } = argumentosPublicacion({
        modo: p.modo, desde, hasta, rama: estado.rama, id, esHead,
    });
    let enlaces: EnlacesPublicacion = estado.enlaces;
    if (p.modo === "vista-previa") {
        enlaces = {
            github: estado.enlaces.github,
            comparar: estado.enlaces.github ? `${estado.enlaces.github}/compare/${desde.slice(0, 7)}...vista-previa/mando` : null,
            vercel: estado.enlaces.vercel,
            paquete: null,
        };
    } else if (p.modo === "paquete") {
        await mkdir(path.join(cwd, ".transfer"), { recursive: true });
        enlaces = { github: null, comparar: null, vercel: null, paquete: path.join(".transfer", `mando-${id}.bundle`) };
    }

    const trabajo: TrabajoPublicacion = {
        id, repo: p.repo, modo: p.modo, hasta, hastaCorto: hasta.slice(0, 7), desde, desdeCorto: desde.slice(0, 7),
        commits: seleccionados,
        estado: "en_curso", inicio: ahora.toISOString(), fin: null, salida: "", enlaces,
    };
    await writeFile(path.join(carpetaAbs, `${id}.json`), JSON.stringify(trabajo, null, 2), "utf8");
    void ejecutarTrabajo(trabajo, cwd, args, p.quien, carpetaAbs, seleccionados, refTemporal).catch(() => undefined);
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

/**
 * Función pura de la vista previa local (2026-09-07 · Ola 280 · C4): si no hay
 * build registrado o no se pudo leer HEAD, el OS va por detrás (atrasado). El
 * caso `null → atrasado true` es intencional: sin commit del build no se puede
 * afirmar que esté al día, y lo seguro es ofrecer reconstruir.
 */
export function interpretarVistaPrevia({ buildCommit, head }: { buildCommit: string | null; head: string | null }): boolean {
    if (buildCommit === null || head === null) return true;
    return buildCommit !== head;
}

/** Trabajo de reconstrucción local (vista previa en :9002). Espejo de un trabajo
 *  de publicación: se responde al instante y el build madura solo en segundo plano. */
export type TrabajoReconstruccion = {
    id: string;
    estado: "en_curso" | "publicado" | "fallo";
    inicio: string;
    fin: string | null;
    salida: string; // últimas 40 líneas del build
    commit: string | null;
    quien: string;
};

export type RespuestaReconstruccion = { ok: boolean; id?: string; error?: string };

/** Umbral (MB) por debajo del cual se limpian los regenerables antes de compilar. */
const UMBRAL_LIMPIEZA_MB = 6144;

/** Umbral (MB) por debajo del cual, además, se compila con `--limpiar`. */
const UMBRAL_CONSTRUIR_LIMPIO_MB = 3072;

/**
 * Función pura que decide si toca limpiar lo regenerable antes de reconstruir
 * (2026-09-08 · Ola 288 · M2). El build del modo ligero crece `.next` hasta ~2,7 GB
 * y, si nadie mira el disco, aborta con ENOSPC: por debajo de 6144 MB libres se
 * limpian los regenerables; por debajo de 3072 MB se compila además con `--limpiar`
 * (que ya borra la caché de build). `motivo` es una frase en español con las cifras.
 */
export function decidirLimpieza(libreMb: number, regenerablesMb: number): { limpiar: boolean; construirLimpio: boolean; motivo: string } {
    const gb = (mb: number): string => `${(mb / 1024).toFixed(1).replace(/\.0$/, "")} GB`;
    if (libreMb > UMBRAL_LIMPIEZA_MB) {
        return {
            limpiar: false,
            construirLimpio: false,
            motivo: `quedan ${gb(libreMb)} libres: no hace falta limpiar antes de compilar`,
        };
    }
    if (libreMb <= UMBRAL_CONSTRUIR_LIMPIO_MB) {
        return {
            limpiar: true,
            construirLimpio: true,
            motivo: `quedan ${gb(libreMb)} libres y los regenerables suman ${gb(regenerablesMb)}: se limpian y se compila con --limpiar`,
        };
    }
    return {
        limpiar: true,
        construirLimpio: false,
        motivo: `quedan ${gb(libreMb)} libres y los regenerables suman ${gb(regenerablesMb)}: se limpian antes de compilar`,
    };
}

/**
 * Estado de la vista previa local: qué commit sirve el build de :9002, si está
 * al día respecto de HEAD y si el servidor responde. `buildCommit`/`buildT`
 * vienen de `build-local.json` (escrito al reconstruir), `head` de `git rev-parse`.
 * Es pura lectura: nunca toca el build ni el servidor.
 */
export async function leerVistaPrevia(): Promise<VistaPreviaLocal> {
    const url = "http://localhost:9002";
    const carpetaAbs = path.join(raizDelProyecto(), CARPETA);
    let buildCommit: string | null = null;
    let buildT: string | null = null;
    try {
        const bruto = await readFile(path.join(carpetaAbs, "build-local.json"), "utf8");
        const datos = JSON.parse(bruto) as { commit?: unknown; t?: unknown };
        buildCommit = typeof datos.commit === "string" && datos.commit ? datos.commit : null;
        buildT = typeof datos.t === "string" && datos.t ? datos.t : null;
    } catch {
        // Sin build registrado: aún no se ha reconstruido nunca (atrasado).
    }
    let head: string | null = null;
    try {
        head = (await git(raizDelProyecto(), ["rev-parse", "HEAD"])).trim() || null;
    } catch {
        // Repo no legible en esta máquina: atrasado.
    }
    let sirviendo = false;
    try {
        const control = new AbortController();
        const t = setTimeout(() => control.abort(), 3000);
        try {
            const r = await fetch(`${url}/`, { signal: control.signal });
            sirviendo = r.ok || r.status === 307;
        } finally {
            clearTimeout(t);
        }
    } catch {
        // Sin servidor ligero en :9002: no se sirve nada.
    }
    return { url, buildCommit, buildT, head, atrasado: interpretarVistaPrevia({ buildCommit, head }), sirviendo };
}

/**
 * Reconstruye y sirve el OS local (vista previa): `parar && construir && arrancar`.
 * Solo en la Mac (modo ligero). Rechaza si ya hay una reconstrucción en curso o
 * un `next build` vivo; antes de lanzar escribe `build-local.json` con el HEAD
 * que va a servir, para que la vista previa no quede «sin build» mientras compila.
 */
export async function reconstruirLocal({ quien }: { quien: string }): Promise<RespuestaReconstruccion> {
    if (process.env.STARSEED_LOCAL !== "1") {
        return { ok: false, error: "Reconstruir solo se permite desde la Mac de Alex (modo ligero)." };
    }
    // No arrancar una segunda reconstrucción a la vez que otra: la compilación
    // pica la CPU/RAM al completo y dos builds a la par se pisan la caché.
    try {
        await execFileAsync("pgrep", ["-f", "next build"], { timeout: 3000 });
        return { ok: false, error: "Ya hay una compilación de Next en marcha: espera a que termine." };
    } catch {
        // pgrep no encontró nada (código 1): se puede reconstruir.
    }
    const carpetaAbs = path.join(raizDelProyecto(), CARPETA);
    try {
        const entradas = await readdir(carpetaAbs);
        for (const nombre of entradas) {
            if (!/^rebuild-\d{8}-\d{6}\.json$/.test(nombre)) continue;
            const bruto = await readFile(path.join(carpetaAbs, nombre), "utf8");
            const d = JSON.parse(bruto) as { estado?: string };
            if (d.estado === "en_curso") return { ok: false, error: "Ya hay una reconstrucción local en curso." };
        }
    } catch {
        // Carpeta vacía o sin crear: nada que comprobar.
    }

    await mkdir(carpetaAbs, { recursive: true });
    const ahora = new Date();
    const sello = ahora.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    const id = `rebuild-${sello}`;
    const commit = await git(raizDelProyecto(), ["rev-parse", "HEAD"]).then((s) => s.trim()).catch(() => null);
    // build-local.json se escribe ANTES de compilar: la vista previa sabe a qué
    // commit va a servir el build aunque este aún no haya terminado.
    await writeFile(path.join(carpetaAbs, "build-local.json"), JSON.stringify({ commit, t: ahora.toISOString() }, null, 2), "utf8");
    const trabajo: TrabajoReconstruccion = { id, estado: "en_curso", inicio: ahora.toISOString(), fin: null, salida: "", commit, quien };
    await writeFile(path.join(carpetaAbs, `${id}.json`), JSON.stringify(trabajo, null, 2), "utf8");
    void ejecutarReconstruccion(trabajo, carpetaAbs);
    return { ok: true, id };
}

/**
 * Función pura que interpreta el log de una reconstrucción (2026-09-08 · Ola 274 · C6).
 * La cadena `parar && construir && arrancar` deja —en su propio log, sin depender de que
 * el servidor Next siga vivo— un marcador final `STARSEED_RECONSTRUCCION_FIN codigo=N fecha`.
 * De ese marcador se deriva el estado: `N=0` → publicado; `N≠0` → fallo, con `fin` = fecha.
 * Sin marcador y con el log parado más de 30 min (diferencia entre el `mtime` y `ahoraMs`)
 * es un fallo con el motivo «sin señales de vida»; si aún no han pasado esos 30 min,
 * sigue en curso. `salida` son siempre las últimas 40 líneas del log.
 */
export function interpretarLogReconstruccion(
    log: string,
    mtimeMs: number,
    ahoraMs: number,
): { estado: "en_curso" | "publicado" | "fallo"; fin: string | null; salida: string } {
    const salida = log.split("\n").slice(-40).join("\n");
    const marcador = /STARSEED_RECONSTRUCCION_FIN codigo=(\d+)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(log);
    if (marcador) {
        const codigo = Number.parseInt(marcador[1] ?? "-1", 10);
        const fin = new Date(marcador[2] ?? "").toISOString();
        return codigo === 0 ? { estado: "publicado", fin, salida } : { estado: "fallo", fin, salida };
    }
    const sinCambioMs = ahoraMs - mtimeMs;
    if (sinCambioMs > 30 * 60 * 1000) {
        // Más de 30 min sin que el log cambie y sin marcador final: el proceso murió
        // a la mitad (p. ej. lo mató el propio «parar») y nadie escribió el cierre.
        return { estado: "fallo", fin: null, salida: `${salida}\n[sin señales de vida]`.trim() };
    }
    return { estado: "en_curso", fin: null, salida };
}

/**
 * Lanza la cadena `parar && construir && arrancar` desacoplada, escribiendo su salida
 * a `<carpeta>/<id>.log` (fichero abierto en el padre y heredado por el hijo). La clave
 * (2026-09-08 · Ola 274 · C6): ANTES el progreso viajaba por tuberías que este mismo
 * proceso Next leía cada 5 s, pero `parar` mata exactamente a ese Next, las tuberías se
 * cierran y `arrancar` moría por SIGPIPE sin dejar estado final. Ahora el fichero del
 * log es independiente del proceso que lo lanzó, la propia cadena escribe en él su
 * marcador `STARSEED_RECONSTRUCCION_FIN` y el estado se lee después desde disco.
 */
async function ejecutarReconstruccion(trabajo: TrabajoReconstruccion, carpetaAbs: string): Promise<void> {
    const logRuta = path.join(carpetaAbs, `${trabajo.id}.log`);
    // fd abierto en modo «añadir»: survive a la muerte del Next que lo lanzó.
    const fd = fsOpen(logRuta, "a");
    const escribirLog = async (texto: string) => {
        try {
            // Se escribe por la ruta (appendFile) ANTES de arrancar la cadena: el fd
            // se hereda luego por el hijo, pero aquí aún no hay riesgo de SIGPIPE.
            await appendFile(logRuta, `${texto}\n`, "utf8");
        } catch {
            // Si no se puede escribir el log, no bloqueamos la reconstrucción.
        }
    };

    // 2026-09-08 · Ola 288 · M2: antes de compilar se mide el disco; si queda poco,
    // se limpian los regenerables (y se compila con --limpiar) para no morir por ENOSPC.
    let construirLimpio = false;
    try {
        const disco = await medirDisco();
        const regenerables = await medirRegenerables(raizDelProyecto());
        if (disco) {
            const regenerablesMb = regenerables.reduce((suma, r) => suma + r.mb, 0);
            const decision = decidirLimpieza(disco.libreMb, regenerablesMb);
            construirLimpio = decision.construirLimpio;
            await escribirLog(`[limpieza] ${decision.motivo}`);
            if (decision.limpiar) {
                const ids = regenerables.filter((r) => r.seguro).map((r) => r.id);
                const resultado = await limpiarRegenerables(ids).catch(() => ({ ok: false, limpiados: [] as string[], detalle: "no se pudo limpiar" }));
                await escribirLog(`[limpieza] ${resultado.detalle}`);
            }
        }
    } catch {
        // Medir falló (p. ej. `df` sin permisos): no bloqueamos la reconstrucción.
        await escribirLog("[limpieza] no se pudo medir el disco: se compila igual");
    }

    const orden =
        "bash scripts/starseed-ligero.sh parar && " +
        `bash scripts/starseed-ligero.sh construir${construirLimpio ? " --limpiar" : ""} && ` +
        "bash scripts/starseed-ligero.sh arrancar; " +
        'codigo=$?; echo "STARSEED_RECONSTRUCCION_FIN codigo=$codigo $(date -u +%Y-%m-%dT%H:%M:%SZ)"; ' +
        "exit $codigo";
    const hijo = spawn("bash", ["-lc", orden], { cwd: raizDelProyecto(), detached: true, stdio: ["ignore", fd, fd] });
    hijo.unref();
    fsClose(fd);
}

/** Lee el estado de una reconstrucción local por su id (contra suplantación de ruta).
 *  El JSON inicial solo guarda los metadatos (id, inicio, commit, quien); el estado real
 *  (estado/fin/salida) se deriva del log en disco con `interpretarLogReconstruccion`. */
export async function leerReconstruccion(id: string): Promise<TrabajoReconstruccion | null> {
    if (!/^rebuild-\d{8}-\d{6}$/.test(id)) return null;
    try {
        const bruto = await readFile(path.join(raizDelProyecto(), CARPETA, `${id}.json`), "utf8");
        const meta = JSON.parse(bruto) as TrabajoReconstruccion;
        const logRuta = path.join(raizDelProyecto(), CARPETA, `${id}.log`);
        let log = "";
        let mtimeMs = Date.now();
        try {
            const [contenido, info] = await Promise.all([readFile(logRuta, "utf8"), stat(logRuta)]);
            log = contenido;
            mtimeMs = info.mtimeMs;
        } catch {
            // Sin log todavía: se interpreta como recién arrancado (mtime «ahora»).
        }
        const derivado = interpretarLogReconstruccion(log, mtimeMs, Date.now());
        return { ...meta, estado: derivado.estado, fin: derivado.fin, salida: derivado.salida };
    } catch {
        return null;
    }
}
