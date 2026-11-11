/**
 * Versiones de prueba en el panel «Versiones» · lógica PURA (VER1111F · contrato centro-versiones-1105.md §10)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin `node:*`: lo importan el panel (cliente) y la ruta. Las fuentes (gh, git, el registro del lanzador,
 * los manifiestos y el archivo de comprobaciones) las reúne `lanzamientos-pruebas-fuentes.ts` (solo servidor).
 *
 * De dónde sale cada dato:
 *  - versión, commit, fecha y build por plataforma → los runs de `native-build.yml` (workflow_dispatch en main
 *    con el job «canal de pruebas · versión y prerelease»): N = número de ejecución, `headSha`, jobs;
 *  - «esperando a main» → el registro del lanzador `lanzar-prueba<N>.log` (aún sin run);
 *  - qué sirve hoy el canal → `latest-prueba.json` y `latest-prueba-android.json` de la prerelease `canal-pruebas`;
 *  - lo que trae → `git log <sha de la prueba anterior>..<sha>`, agrupado por id de tarea;
 *  - comprobaciones y aprobación → `pruebas-comprobaciones.json` (el comando `comprobaciones_prueba.py` y el panel).
 */

import type {
    AprobacionDirector,
    ArchivoComprobaciones,
    BuildPlataforma,
    Comprobacion,
    CommitPrueba,
    EstadoBuild,
    EstadoComprobacion,
    GrupoCommits,
    MainMovido,
    PlanAprobacion,
    PlataformaPrueba,
    PruebaEnArchivo,
    ResumenComprobaciones,
    VersionPrueba,
} from "./lanzamientos-pruebas-tipos";

export const ESTADOS_COMPROBACION: readonly EstadoComprobacion[] = ["pendiente", "bien", "falla"];
export const TITULO_PLATAFORMA: Record<PlataformaPrueba, string> = {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux",
    android: "Android",
};
const ORDEN_PLATAFORMAS: PlataformaPrueba[] = ["macos", "windows", "linux", "android"];
const JOB_PLAN = "canal de pruebas · versión y prerelease";
const JOB_PUBLICAR = "canal de pruebas · latest-prueba.json";
const SHA40 = /^[0-9a-f]{40}$/;

const texto = (v: unknown, max = 400): string => (typeof v === "string" ? v.slice(0, max) : "");
const objeto = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

// ── Números y nombres ──────────────────────────────────────────────────────────────────────────────

/** «0.5.1-prueba.36» | «prueba36» | «prueba.36» | «36» → 36 (null si no es una prueba). Igual que el comando. */
export function numeroDePrueba(v: unknown): number | null {
    const m = String(v ?? "").trim().toLowerCase().match(/^(?:v?\d+\.\d+\.\d+-)?(?:prueba\.?)?(\d{1,5})$/);
    return m ? Number(m[1]) : null;
}

/** «0.5.1-prueba.36» → «0.5.1». */
export function oficialDePrueba(version: string | null): string | null {
    const m = String(version ?? "").match(/^v?(\d+\.\d+\.\d+)-prueba\.\d+$/);
    return m ? m[1] : null;
}

/** La base de las pruebas a partir de la versión nativa oficial: 0.5.0 → 0.5.1 (lo que sella el CI). */
export function basePruebas(nativa: string): string | null {
    const m = String(nativa ?? "").match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : null;
}

// ── Lo que trae cada prueba ────────────────────────────────────────────────────────────────────────

const ID_TAREA = /(?:^|\s)([A-Z]{1,7}\d{3,5}[A-Za-z0-9-]*):\s/;

/** Id de tarea de un asunto («LLA1111A: …» o «<ola> · LLA1111A: …»), o null. */
export function tareaDeAsunto(asunto: string): string | null {
    const m = String(asunto ?? "").match(ID_TAREA);
    return m ? m[1] : null;
}

/** Commits (los más nuevos primero) → grupos por tarea en orden de aparición; lo que no lleva id, al final. */
export function agruparCommits(commits: CommitPrueba[]): GrupoCommits[] {
    const grupos = new Map<string, GrupoCommits>();
    const sueltos: CommitPrueba[] = [];
    for (const c of commits) {
        const t = tareaDeAsunto(c.asunto);
        if (!t) {
            sueltos.push(c);
            continue;
        }
        const g = grupos.get(t) ?? { tarea: t, commits: [] };
        g.commits.push(c);
        grupos.set(t, g);
    }
    const fuera = [...grupos.values()];
    if (sueltos.length) fuera.push({ tarea: null, commits: sueltos });
    return fuera;
}

/** Salida de `git log --format=%H%x1f%s` → commits. */
export function leerLogGit(salida: string): CommitPrueba[] {
    return String(salida ?? "")
        .split("\n")
        .map((l) => l.split("\u001f"))
        .filter((p) => p.length >= 2 && /^[0-9a-f]{7,40}$/.test(p[0]))
        .map(([sha, ...resto]) => ({ sha, asunto: resto.join(" ").slice(0, 300) }));
}

// ── El lanzador (`~/.starseed/opus1031/lanzar-<etiqueta>.log`) ─────────────────────────────────────

export interface LanzadorLeido {
    numero: number;
    estado: "esperando" | "lanzado" | "expirado" | "mudo";
    sha: string | null;
    runId: number | null;
    /** ISO: modificación del registro (cuándo escribió por última vez). */
    t: string | null;
}

/** Espera máxima del lanzador (120 × 2 min) + margen: un registro vacío más viejo ya no está esperando. */
export const ESPERA_LANZADOR_MS = 4 * 3600_000 + 10 * 60_000;

/** Un registro del lanzador → lo que se sabe de él. */
export function leerLanzador(etiqueta: string, contenido: string, mtimeMs: number | null, ahora: number): LanzadorLeido | null {
    const numero = numeroDePrueba(etiqueta);
    if (numero === null) return null;
    const c = String(contenido ?? "");
    const t = mtimeMs ? new Date(mtimeMs).toISOString() : null;
    const espero = c.match(/espero ([0-9a-f]{7,40}) en origin\/main/);
    const lanzo = c.match(/([0-9a-f]{7,40}) ya está en origin\/main/);
    const json = c.match(/"databaseId":\s*(\d+)[^}]*"headSha":\s*"([0-9a-f]{40})"/);
    if (lanzo || json) {
        return { numero, estado: "lanzado", sha: json?.[2] ?? lanzo?.[1] ?? null, runId: json ? Number(json[1]) : null, t };
    }
    if (/se acabó la espera/.test(c)) return { numero, estado: "expirado", sha: espero?.[1] ?? null, runId: null, t };
    const viejo = mtimeMs !== null && ahora - mtimeMs > ESPERA_LANZADOR_MS;
    return { numero, estado: viejo ? "mudo" : "esperando", sha: espero?.[1] ?? null, runId: null, t };
}

// ── Build por plataforma (jobs del run) ────────────────────────────────────────────────────────────

export interface JobGh {
    name?: string;
    status?: string;
    conclusion?: string;
    startedAt?: string;
    completedAt?: string;
    url?: string;
}

export interface RunGh {
    databaseId: number;
    number: number;
    headSha: string;
    status: string;
    conclusion?: string | null;
    createdAt?: string;
    url?: string;
    event?: string;
    headBranch?: string;
}

/** Nombre de job → plataforma de una prueba (los del canal y del servidor local no son plataformas). */
export function plataformaDeJob(nombre: string | undefined): PlataformaPrueba | null {
    const n = String(nombre ?? "").toLowerCase();
    if (n.includes("canal de pruebas") || n.includes("servidor local") || n.includes("canales")) return null;
    if (n.includes("macos")) return "macos";
    if (n.includes("windows")) return "windows";
    if (n.includes("ubuntu") || n.includes("linux")) return "linux";
    if (n.includes("android")) return "android";
    return null;
}

/** ¿Este run es del canal de pruebas? (tiene el job del plan y no quedó omitido). */
export function esRunDePruebas(run: Pick<RunGh, "event" | "headBranch">, jobs: JobGh[] | null): boolean {
    if (run.event && run.event !== "workflow_dispatch") return false;
    if (run.headBranch && run.headBranch !== "main") return false;
    if (!jobs) return false;
    return jobs.some((j) => j.name === JOB_PLAN && j.conclusion !== "skipped");
}

const terminado = (j: JobGh) => j.status === "completed";
const fallido = (j: JobGh) => terminado(j) && ["failure", "cancelled", "timed_out", "startup_failure"].includes(j.conclusion ?? "");

/** El estado de cada plataforma de un run de pruebas, a partir de sus jobs. Pura. */
export function buildsDeRun(run: RunGh, jobs: JobGh[] | null): BuildPlataforma[] {
    if (!jobs) return [];
    const publicar = jobs.find((j) => String(j.name ?? "").startsWith(JOB_PUBLICAR));
    const primerFallo = jobs.find(fallido);
    const runTerminado = run.status === "completed";
    const fuera: BuildPlataforma[] = [];
    for (const p of ORDEN_PLATAFORMAS) {
        const j = jobs.find((x) => plataformaDeJob(x.name) === p);
        if (!j) continue;
        const base = { plataforma: p, titulo: TITULO_PLATAFORMA[p], desde: j.startedAt ?? null, hasta: j.completedAt ?? null, job: j.name ?? null, url: j.url ?? run.url ?? null };
        if (j.conclusion === "skipped") {
            // Omitido: o no se pidió (no cuenta), o lo tumbó un job anterior (falló).
            if (runTerminado && run.conclusion !== "success" && primerFallo) {
                fuera.push({ ...base, estado: "fallo", job: primerFallo.name ?? null, url: primerFallo.url ?? base.url, detalle: `no se compiló: falló «${primerFallo.name}»` });
            }
            continue;
        }
        let estado: EstadoBuild;
        let detalle = "";
        if (!terminado(j)) {
            estado = j.status === "in_progress" ? "compilando" : "en-cola";
        } else if (fallido(j)) {
            estado = "fallo";
            detalle = `falló «${j.name}»`;
        } else if (p === "android") {
            estado = "publicada"; // build-android sube el APK y latest-prueba-android.json en el mismo job
        } else if (!publicar || !terminado(publicar)) {
            estado = runTerminado ? "fallo" : "publicando";
            detalle = runTerminado ? "compilado, pero nadie publicó latest-prueba.json" : "compilado: falta publicar latest-prueba.json";
        } else if (fallido(publicar)) {
            estado = "fallo";
            detalle = `falló «${publicar.name}»`;
            fuera.push({ ...base, estado, detalle, job: publicar.name ?? null, url: publicar.url ?? base.url });
            continue;
        } else if (publicar.conclusion === "success") {
            estado = "publicada";
        } else {
            // Omitido: el job que publica latest-prueba.json espera a TODO el escritorio; lo tumbó otro job.
            estado = "fallo";
            detalle = primerFallo
                ? `compilado, pero no se publicó: falló «${primerFallo.name}»`
                : `compilado, pero «${publicar.name}» no se ejecutó (${publicar.conclusion})`;
            fuera.push({ ...base, estado, detalle, job: primerFallo?.name ?? publicar.name ?? null, url: primerFallo?.url ?? base.url });
            continue;
        }
        fuera.push({ ...base, estado, detalle });
    }
    return fuera;
}

/** «compilando 12 min», «1 h 5 min». */
export function minutos(desdeIso: string | null, ahora: number, hastaIso?: string | null): string {
    const d = desdeIso ? Date.parse(desdeIso) : NaN;
    const h = hastaIso ? Date.parse(hastaIso) : ahora;
    if (!Number.isFinite(d) || !Number.isFinite(h)) return "";
    const m = Math.max(0, Math.round((h - d) / 60_000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ── El archivo de comprobaciones (mismo formato que comprobaciones_prueba.py) ──────────────────────

export function normalizarComprobaciones(crudo: unknown): ArchivoComprobaciones {
    const fuera: ArchivoComprobaciones = { formato: 1, pruebas: {} };
    for (const [clave, v] of Object.entries(objeto(objeto(crudo).pruebas))) {
        const n = numeroDePrueba(clave);
        const p = objeto(v);
        if (n === null || !Object.keys(p).length) continue;
        const lista: Comprobacion[] = [];
        for (const c of Array.isArray(p.comprobaciones) ? p.comprobaciones : []) {
            const o = objeto(c);
            const id = texto(o.id, 20).trim();
            const t = texto(o.texto).trim();
            if (!id || !t) continue;
            lista.push({
                id,
                texto: t,
                aparato: texto(o.aparato, 40),
                estado: ESTADOS_COMPROBACION.includes(o.estado as EstadoComprobacion) ? (o.estado as EstadoComprobacion) : "pendiente",
                nota: texto(o.nota),
                quien: texto(o.quien, 40),
                t: typeof o.t === "string" ? o.t : null,
            });
        }
        const a = objeto(p.aprobacion);
        fuera.pruebas[String(n)] = {
            version: texto(p.version, 80),
            sha: texto(p.sha, 40),
            comprobaciones: lista,
            aprobacion: Object.keys(a).length ? (a as unknown as PruebaEnArchivo["aprobacion"]) : null,
        };
    }
    return fuera;
}

export function resumenComprobaciones(lista: Comprobacion[]): ResumenComprobaciones {
    const r = { total: lista.length, bien: 0, falla: 0, pendiente: 0 };
    for (const c of lista) r[c.estado] += 1;
    return r;
}

/** Marca una comprobación (Alex, desde el panel). Lanza Error con el motivo si no existe. */
export function marcarComprobacion(
    archivo: ArchivoComprobaciones,
    numero: number,
    id: string,
    estado: EstadoComprobacion,
    quien: string,
    t: string,
    nota?: string,
): ArchivoComprobaciones {
    if (!ESTADOS_COMPROBACION.includes(estado)) throw new Error("Estado no válido (pendiente, bien o falla).");
    const copia = normalizarComprobaciones(JSON.parse(JSON.stringify(archivo)));
    const c = copia.pruebas[String(numero)]?.comprobaciones.find((x) => x.id === id);
    if (!c) throw new Error(`No existe la comprobación ${id} de la prueba.${numero}.`);
    c.estado = estado;
    c.quien = quien.slice(0, 40);
    c.t = t;
    if (typeof nota === "string") c.nota = nota.slice(0, 400);
    return copia;
}

// ── Peticiones del panel ───────────────────────────────────────────────────────────────────────────

export type PeticionPruebas =
    | { accion: "marcar"; numero: number; id: string; estado: EstadoComprobacion; nota?: string }
    | { accion: "aprobar"; numero: number; sha: string; lanzar_sha: string };

export function validarPeticionPruebas(body: unknown): PeticionPruebas | { error: string } {
    const o = objeto(body);
    const numero = numeroDePrueba(o.numero);
    if (numero === null) return { error: "Prueba no válida." };
    if (o.accion === "marcar") {
        const id = texto(o.id, 20).trim();
        const estado = o.estado as EstadoComprobacion;
        if (!/^c\d{1,4}$/.test(id)) return { error: "Comprobación no válida." };
        if (!ESTADOS_COMPROBACION.includes(estado)) return { error: "Estado no válido (pendiente, bien o falla)." };
        return { accion: "marcar", numero, id, estado, ...(typeof o.nota === "string" ? { nota: o.nota.slice(0, 400) } : {}) };
    }
    if (o.accion === "aprobar") {
        const sha = texto(o.sha, 40).toLowerCase();
        const lanzar = texto(o.lanzar_sha ?? o.sha, 40).toLowerCase();
        if (!SHA40.test(sha) || !SHA40.test(lanzar)) return { error: "Commit no válido (hacen falta los 40 caracteres)." };
        return { accion: "aprobar", numero, sha, lanzar_sha: lanzar };
    }
    return { error: "Acción inválida." };
}

// ── Aprobar ────────────────────────────────────────────────────────────────────────────────────────

/** Lo que lanza el director con una aprobación (§2 del contrato: el workflow oficial por etiqueta). */
export function queSeLanza(oficial: string, web: string | null, sha: string): string[] {
    return [
        `macOS: StarSeed OS, Nexus y Café ${oficial} (.dmg universal y paquete del actualizador)`,
        `Windows: .msi y -setup.exe de los tres`,
        `Linux: .AppImage, .deb y .rpm de los tres`,
        `Android: .apk firmado de los tres`,
        `iOS: sin app (sigue la web instalable)`,
        `Canales del actualizador: latest.json, latest-nexus.json y latest-cafe.json en ${oficial}`,
        web
            ? `Web: la publica la autopublicación desde main; hoy sirve ${web.slice(0, 10)}${web.startsWith(sha.slice(0, 10)) ? " (el commit probado)" : ""}`
            : "Web: la publica la autopublicación desde main (no sé qué commit sirve ahora)",
        "La prueba solo compiló StarSeed OS: Nexus y Café salen de ese mismo commit sin haberse probado en aparatos",
    ];
}

/** ¿Se puede aprobar y qué diría la confirmación? Pura. */
export function planDeAprobacion(v: VersionPrueba, web: string | null): PlanAprobacion {
    const oficial = oficialDePrueba(v.version) ?? "";
    const pendientes = v.comprobaciones.filter((c) => c.estado === "pendiente");
    const fallas = v.comprobaciones.filter((c) => c.estado === "falla");
    const base = {
        version: v.version ?? v.etiqueta,
        oficial,
        sha: v.sha ?? "",
        lanzarSha: v.mainMovido ? v.mainMovido.cabeza : v.sha ?? "",
        lanzar: oficial ? queSeLanza(oficial, web, v.sha ?? "") : [],
        pendientes,
        fallas,
        mainMovido: v.mainMovido,
    };
    const no = (motivo: string): PlanAprobacion => ({ ...base, puede: false, motivo });
    if (v.aprobacion) return no(`Ya aprobada el ${v.aprobacion.t.slice(0, 16).replace("T", " ")}.`);
    if (v.director?.estado === "en-curso") return no("El director ya lleva adelante esta aprobación.");
    if (!v.sha || !SHA40.test(v.sha)) return no("No sé el commit completo de esta prueba.");
    if (!oficial) return no("No sé la versión de esta prueba.");
    if (!v.plataformas.length) return no("No sé para qué plataformas se compiló.");
    if (!v.publicadaEnTodas) {
        const faltan = v.plataformas.filter((p) => p.estado !== "publicada").map((p) => p.titulo);
        return no(`Aún no está publicada en ${faltan.join(", ")}.`);
    }
    return { ...base, puede: true, motivo: "" };
}

// ── Montar la lista ────────────────────────────────────────────────────────────────────────────────

export interface FuentesPruebas {
    ahora: number;
    /** Versión nativa oficial del repo (os-release): de ella sale la base de las pruebas. */
    nativa: string;
    runs: { run: RunGh; jobs: JobGh[] | null }[];
    lanzadores: LanzadorLeido[];
    archivo: ArchivoComprobaciones;
    manifiestos: { escritorio: string | null; android: string | null };
    contenido: Record<number, { desde: string | null; commits: CommitPrueba[] } | undefined>;
    mainMovido: Record<number, { cabeza: string; commits: CommitPrueba[] } | undefined>;
    director: AprobacionDirector[];
    /** Cuántas publicadas se enseñan además de la que está en marcha. */
    cuantas?: number;
}

/** Las versiones de prueba: la que está en marcha (si hay) y las últimas publicadas o fallidas. Pura. */
export function construirVersiones(f: FuentesPruebas): VersionPrueba[] {
    const numeros = new Set<number>();
    for (const { run, jobs } of f.runs) if (esRunDePruebas(run, jobs)) numeros.add(run.number);
    for (const l of f.lanzadores) numeros.add(l.numero);
    for (const k of Object.keys(f.archivo.pruebas)) numeros.add(Number(k));
    const base = basePruebas(f.nativa);
    const versiones: VersionPrueba[] = [];
    for (const n of [...numeros].sort((a, b) => b - a)) {
        const r = f.runs.find((x) => x.run.number === n && esRunDePruebas(x.run, x.jobs));
        const l = f.lanzadores.find((x) => x.numero === n) ?? null;
        const enArchivo = f.archivo.pruebas[String(n)];
        if (!r && !l && !enArchivo) continue;
        const desconocido: string[] = [];
        let plataformas: BuildPlataforma[] = [];
        let fecha: string | null = null;
        let sha: string | null = r?.run.headSha ?? null;
        if (r) {
            plataformas = buildsDeRun(r.run, r.jobs);
            fecha = r.run.createdAt ?? null;
            if (!r.jobs) desconocido.push("los jobs del run (GitHub no respondió)");
        } else if (l && l.estado === "lanzado" && !recienPedida(l, f)) {
            fecha = l.t;
            desconocido.push("su run: el lanzador lo pidió, pero no está entre los runs que leo de GitHub");
        } else if (l && (l.estado === "esperando" || l.estado === "lanzado")) {
            const esperando: EstadoBuild = l.estado === "esperando" ? "esperando-main" : "en-cola";
            plataformas = ORDEN_PLATAFORMAS.map((p) => ({
                plataforma: p, titulo: TITULO_PLATAFORMA[p], estado: esperando, desde: l.t, hasta: null, job: null, url: null,
                detalle: l.estado === "esperando" ? "el lanzador espera a que origin/main tenga el commit" : "pedida a GitHub; aún no veo su run",
            }));
            fecha = l.t;
            if (l.estado === "esperando") desconocido.push("las plataformas: el lanzador pide escritorio y Android; se sabrán con el run");
        } else if (l?.estado === "expirado") {
            fecha = l.t;
            desconocido.push("el lanzador dejó de esperar: el commit no llegó a origin/main en 4 h");
        } else if (l?.estado === "mudo") {
            fecha = l.t;
            desconocido.push("el lanzador no escribió nada y su espera de 4 h ya pasó");
        }
        sha = sha ?? (l?.sha && SHA40.test(l.sha) ? l.sha : null) ?? (enArchivo?.sha || null) ?? l?.sha ?? null;
        if (!sha) desconocido.push("el commit (el lanzador aún no lo escribe en su registro)");
        const version = r && base ? `${base}-prueba.${n}` : enArchivo?.version || null;
        const vigente = {
            escritorio: !!version && f.manifiestos.escritorio === version,
            android: !!version && f.manifiestos.android === version,
        };
        const c = f.contenido[n];
        const movido = f.mainMovido[n];
        const publicadaEnTodas = plataformas.length > 0 && plataformas.every((p) => p.estado === "publicada");
        versiones.push({
            numero: n,
            version,
            etiqueta: `prueba.${n}`,
            sha,
            fecha,
            runUrl: r?.run.url ?? null,
            plataformas,
            publicadaEnTodas,
            vigente,
            contenido: c ? { desde: c.desde, total: c.commits.length, grupos: agruparCommits(c.commits) } : null,
            comprobaciones: enArchivo?.comprobaciones ?? [],
            aprobacion: enArchivo?.aprobacion ?? null,
            director: f.director.find((d) => numeroDePrueba(d.version) === n && (!sha || d.sha === sha)) ?? null,
            mainMovido: movido && movido.commits.length
                ? { cabeza: movido.cabeza, total: movido.commits.length, grupos: agruparCommits(movido.commits) }
                : null,
            desconocido,
        });
    }
    const enMarcha = versiones.filter(estaEnMarcha);
    const resto = versiones.filter((v) => !estaEnMarcha(v)).slice(0, f.cuantas ?? 4);
    return [...enMarcha, ...resto].sort((a, b) => b.numero - a.numero);
}

/** Un lanzamiento pedido hace menos de 15 min y más nuevo que todos los runs leídos: su run aún puede no salir. */
function recienPedida(l: LanzadorLeido, f: FuentesPruebas): boolean {
    const t = l.t ? Date.parse(l.t) : NaN;
    return Number.isFinite(t) && f.ahora - t < 15 * 60_000 && !f.runs.some((r) => r.run.number > l.numero);
}

/** ¿Está en marcha (esperando a main, en cola, compilando o publicando)? */
export function estaEnMarcha(v: VersionPrueba): boolean {
    return v.plataformas.some((p) => ["esperando-main", "en-cola", "compilando", "publicando"].includes(p.estado));
}

function lista(nombres: string[]): string {
    return nombres.length <= 1 ? nombres.join("") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** «prueba.36 · Android compilando 12 min · 3 de 8 comprobaciones». La que está en marcha o la última. Pura. */
export function resumenPruebas(versiones: VersionPrueba[], ahora: number): string {
    const v = versiones.find(estaEnMarcha) ?? versiones[0];
    if (!v) return "Sin versiones de prueba";
    const partes = [v.etiqueta];
    const por = (e: EstadoBuild) => v.plataformas.filter((p) => p.estado === e);
    const fallos = por("fallo");
    const compilando = por("compilando");
    if (por("esperando-main").length) partes.push("esperando a main");
    else if (compilando.length) {
        const mas = compilando.reduce((a, b) => (Date.parse(a.desde ?? "") <= Date.parse(b.desde ?? "") ? a : b));
        partes.push(`${lista(compilando.map((p) => p.titulo))} compilando ${minutos(mas.desde, ahora)}`.trim());
    } else if (por("en-cola").length) partes.push(`${lista(por("en-cola").map((p) => p.titulo))} en cola`);
    else if (por("publicando").length) partes.push("publicando");
    if (fallos.length) partes.push(`falló ${lista(fallos.map((p) => p.titulo))}`);
    if (!estaEnMarcha(v) && !fallos.length) {
        if (v.aprobacion) partes.push("aprobada");
        else if (v.publicadaEnTodas) partes.push("publicada");
        else if (!v.plataformas.length) partes.push("sin build");
    }
    const r = resumenComprobaciones(v.comprobaciones);
    if (r.total) partes.push(`${r.bien + r.falla} de ${r.total} comprobaciones${r.falla ? ` (${r.falla} falla${r.falla > 1 ? "n" : ""})` : ""}`);
    else partes.push("sin comprobaciones");
    return partes.join(" · ");
}

/** Las aprobaciones que cuenta el estado del director (`aprobacion`, `aprobaciones`, `aprobacion_ultima`). Pura. */
export function aprobacionesDelDirector(estado: unknown): AprobacionDirector[] {
    const e = objeto(estado);
    const todas = [e.aprobacion, e.aprobacion_ultima, ...(Array.isArray(e.aprobaciones) ? [...e.aprobaciones].reverse() : [])];
    const fuera: AprobacionDirector[] = [];
    for (const x of todas) {
        const o = objeto(x);
        if (!texto(o.version)) continue;
        fuera.push({ version: texto(o.version, 80), sha: texto(o.sha, 40), estado: texto(o.estado, 30), detalle: texto(o.detalle) });
    }
    return fuera;
}

/** La versión publicada que sirve un manifiesto del canal (`version` saneada) o null. */
export function versionDeManifiesto(m: unknown): string | null {
    const v = texto(objeto(m).version, 80).replace(/^v/i, "");
    return /^\d+\.\d+\.\d+-prueba\.\d+$/.test(v) ? v : null;
}

export type { MainMovido };

/** Lo último del archivo de comprobaciones encima de una foto cacheada (marcar se ve al instante). Pura. */
export function aplicarArchivo(versiones: VersionPrueba[], archivo: ArchivoComprobaciones): VersionPrueba[] {
    return versiones.map((v) => {
        const p = archivo.pruebas[String(v.numero)];
        return p ? { ...v, comprobaciones: p.comprobaciones, aprobacion: p.aprobacion } : v;
    });
}

/** El registro de una aprobación (cuándo, versión, commit y estado de las comprobaciones en ese momento). Pura. */
export function registroDeAprobacion(v: VersionPrueba, lanzarSha: string, t: string): NonNullable<VersionPrueba["aprobacion"]> {
    return {
        t,
        version: v.version ?? v.etiqueta,
        sha: v.sha ?? "",
        lanzar_sha: lanzarSha,
        quien: "alex · Genesis local",
        comprobaciones: {
            ...resumenComprobaciones(v.comprobaciones),
            lista: v.comprobaciones.map((c) => ({ id: c.id, texto: c.texto, estado: c.estado })),
        },
    };
}
