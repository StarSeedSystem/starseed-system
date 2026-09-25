/**
 * /api/mando/medidores — lo que hay detrás de cada medidor, y las acciones.
 *
 * GET  ?clave=bloqueadas  → el detalle (filas, porqués y acciones legales).
 * POST { clave, accion, id?, texto? } → ejecuta una acción sobre progreso.json.
 *
 * Las REGLAS viven en `@/lib/mando/medidores` (puro). Aquí solo se lee el disco y
 * se escribe con cuidado. Tres guardias que no se saltan:
 *   1. Nunca se toca una tarea en `commit` o `hecho`: 409 y se dice por qué.
 *   2. `reintentar` sin texto → 400. Un reintento sin cambio descrito es el mismo
 *      intento y va a fallar exactamente igual.
 *   3. Se escribe a un `.tmp` y se renombra: el orquestador escribe ese mismo
 *      archivo a la vez y un volcado a medias lo dejaría ilegible.
 */
import { execFile, spawn } from "node:child_process";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { lanzarPublicacion, leerDiario } from "@/lib/mando/publicador";
import {
    colaInteligente,
    enjambreEnMarcha,
    leerColas,
    leerCommitsDeOlas,
    leerLatidos,
    leerLatidosDelBus,
    leerProgreso,
    tareasDeCola,
} from "@/lib/mando/lector-local";
import {
    TERMINALES,
    cambioAutomatico,
    tituloDeRunNube,
    veredictoDeAgente,
    dependenciasMuertas,
    detalleDeMedidor,
    ejecutablesDeColas,
    olasDeLaMac,
    tituloDeOla,
    type OlaActiva,
    type ClaveMedidor,
    type DatosMedidores,
} from "@/lib/mando/medidores";
import {
    parsearCommits,
    tareasIntegradasEnMain,
    ubicarDefiniciones,
    type Definicion,
} from "@/lib/mando/integradas";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const RAÍZ = raizDelProyecto();
const PROGRESO = path.join(RAÍZ, "starseed_memory_root", "olas", "progreso.json");

type Entrada = { estado?: string; nota?: string; t?: string; modelo?: string; [k: string]: unknown };

async function git(args: string[]): Promise<string> {
    try {
        const { stdout } = await correr("git", args, { cwd: RAÍZ, timeout: 20_000, maxBuffer: 4_000_000 });
        return stdout;
    } catch {
        return "";
    }
}

/**
 * Qué está tocando AHORA cada tarea viva, leído de su worktree.
 *
 * (2026-09-22, pedido por Alex) Es el dato que faltaba para que la ficha de un agente diga
 * algo de verdad: en qué rama trabaja y qué archivos lleva tocados. Vale `git status
 * --short` en `~/Documents/starseed-wt/<id>`, que es donde el orquestador pone a cada
 * agente. Si el worktree no existe todavía, no pasa nada: la ficha lo dirá.
 */
async function leerObras(ids: string[]): Promise<Record<string, { rama?: string; archivos?: string[]; ruta?: string }>> {
    const raizWt = process.env.STARSEED_WT || path.join(os.homedir(), "Documents", "starseed-wt");
    const salida: Record<string, { rama?: string; archivos?: string[]; ruta?: string }> = {};
    await Promise.all(
        ids.slice(0, 12).map(async (id) => {
            const dir = path.join(raizWt, id);
            try {
                const [estado, rama] = await Promise.all([
                    correr("git", ["-C", dir, "status", "--short"], { timeout: 8_000, maxBuffer: 400_000 })
                        .then((r) => r.stdout)
                        .catch(() => ""),
                    correr("git", ["-C", dir, "branch", "--show-current"], { timeout: 8_000 })
                        .then((r) => r.stdout.trim())
                        .catch(() => ""),
                ]);
                const archivos = estado
                    .split(/\r?\n/)
                    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ""))
                    .filter(Boolean);
                if (archivos.length || rama) {
                    // La ruta se enseña con ~ para no publicar el disco de Alex.
                    salida[id] = { rama: rama || undefined, archivos, ruta: dir.replace(os.homedir(), "~") };
                }
            } catch {
                /* sin worktree: la ficha lo dice, no hace falta avisar aquí */
            }
        }),
    );
    return salida;
}

/** El historial de acciones de una tarea: lo que los directores le han ido diciendo. */
async function leerHistoriales(ids: string[]): Promise<Record<string, { t: string; de: string; texto: string }[]>> {
    const dir = path.join(RAÍZ, "starseed_memory_root", "olas", "mensajes");
    const salida: Record<string, { t: string; de: string; texto: string }[]> = {};
    await Promise.all(
        ids.slice(0, 12).map(async (id) => {
            try {
                const crudo = await readFile(path.join(dir, `${id}.jsonl`), "utf8");
                const lineas = crudo.split(/\r?\n/).filter(Boolean).slice(-6).reverse();
                const sucesos = lineas
                    .map((l) => {
                        try {
                            const o = JSON.parse(l) as Record<string, unknown>;
                            return {
                                t: String(o.t ?? ""),
                                de: String(o.de ?? "?"),
                                texto: String(o.texto ?? "").slice(0, 400),
                            };
                        } catch {
                            return null;
                        }
                    })
                    .filter((x): x is { t: string; de: string; texto: string } => x !== null);
                if (sucesos.length) salida[id] = sucesos;
            } catch {
                /* sin historial todavía */
            }
        }),
    );
    return salida;
}

/**
 * La flota de pasarelas, de `~/.starseed/salud-proveedores.json`.
 *
 * (2026-09-22) Este dato NO viajaba y por eso el medidor «Proveedores» abría vacío —
 * «0 vivos · 0 sin cupo o caídos»— mientras la pastilla de al lado decía «6 disponibles».
 * Alex lo vio por el otro lado: «Te toca a ti» le pedía renovar una clave de un proveedor
 * que no aparecía en la lista, así que no tenía forma de saber si el aviso era real.
 *
 * El archivo mezcla proveedores con dos claves de servicio (`claves`, `ultimo_revisor_ok`)
 * que no son pasarelas; se distinguen porque un proveedor trae `estado`.
 */
async function leerProveedores(): Promise<{ id: string; estado: string; motivo?: string }[]> {
    const filas = new Map<string, { id: string; estado: string; motivo?: string }>();

    // 1. Lo que el enjambre OBEDECE cuando se come un 429.
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "salud-proveedores.json"), "utf8");
        const d = JSON.parse(crudo) as Record<string, unknown>;
        for (const [id, v] of Object.entries(d)) {
            if (!v || typeof v !== "object") continue;
            const entrada = v as { estado?: unknown; motivo?: unknown; sin_cupo_hasta?: unknown };
            if (typeof entrada.estado !== "string") continue;
            const sinCupo = typeof entrada.sin_cupo_hasta === "string" ? entrada.sin_cupo_hasta : "";
            filas.set(id, {
                id,
                estado: sinCupo ? "sin cupo" : entrada.estado,
                motivo: sinCupo
                    ? `sin cupo hasta ${sinCupo}`
                    : typeof entrada.motivo === "string"
                      ? entrada.motivo
                      : undefined,
            });
        }
    } catch {
        /* sin archivo de salud: se sigue con el informe del renovador */
    }

    // 2. Y las que sondea el renovador, que son las que alimentan «Te toca a ti».
    //
    // (2026-09-22) Alex: «aparece en Te toca a ti lo de renovar la clave de freellmapi
    // pero no aparece en el medidor de proveedores agotados». Exacto: eran DOS listas de
    // dos archivos distintos. `salud-proveedores.json` solo tiene las pasarelas que el
    // orquestador ha usado; `pasarelas-informe.json` tiene todas las que se sondean,
    // freellmapi incluida. Que el Puente te pida arreglar algo que no figura en ninguna
    // lista es lo que hace imposible saber si el aviso es real. Ahora salen de las dos, y
    // el informe manda sobre la salud porque es la medida más reciente.
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "pasarelas-informe.json"), "utf8");
        const d = JSON.parse(crudo) as { pasarelas?: unknown };
        for (const p of Array.isArray(d.pasarelas) ? d.pasarelas : []) {
            if (!p || typeof p !== "object") continue;
            const e = p as { clave?: unknown; estado?: unknown; http?: unknown; modelo?: unknown };
            const id = typeof e.clave === "string" ? e.clave : "";
            if (!id) continue;
            const estado = typeof e.estado === "string" ? e.estado : "?";
            filas.set(id, {
                id,
                // `escribe` es el estado bueno del renovador; en el pulso se llama «vivo».
                estado: estado === "escribe" ? "vivo" : estado.replace(/_/g, " "),
                motivo: `sondeada hace un momento · http ${String(e.http ?? "?")} · modelo ${String(e.modelo ?? "?")}`,
            });
        }
    } catch {
        /* sin informe: queda lo que dijera la salud */
    }

    return [...filas.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * El inventario de contenedores de nube que escribe `contenedores_nube.py`.
 *
 * Se LEE del archivo y no se sondea aquí: el sondeo tarda ~40 s (habla con GitHub, Hugging
 * Face y gcloud) y esta ruta la piden los medidores cada pocos segundos. Lo refrescan el
 * director de la nube en cada pasada y el botón «Buscar contenedores ahora».
 */
async function leerTokens(): Promise<DatosMedidores["tokens"]> {
    try {
        const crudo = await readFile(
            path.join(RAÍZ, "starseed_memory_root", "mando", "tokens-por-segundo.json"),
            "utf8",
        );
        // `muestras` es el anillo del servicio: no viaja al navegador, solo lo resumido.
        const { muestras: _muestras, ...resto } = JSON.parse(crudo) as Record<string, unknown>;
        return resto as NonNullable<DatosMedidores["tokens"]>;
    } catch {
        return null;
    }
}

async function leerContenedores(): Promise<DatosMedidores["contenedores"]> {
    try {
        const crudo = await readFile(
            path.join(RAÍZ, "starseed_memory_root", "mando", "contenedores.json"),
            "utf8",
        );
        const d = JSON.parse(crudo) as NonNullable<DatosMedidores["contenedores"]>;
        return Array.isArray(d?.contenedores) ? d : null;
    } catch {
        return null;
    }
}

/**
 * Los agentes que trabajan en la NUBE, para que el medidor los cuente.
 *
 * (2026-09-22, Alex: «aún no veo que suba el número de agentes con las capacidades de los
 * contenedores en la nube»). No era descuido: el bus de medios es un archivo del disco de
 * la Mac y un runner de GitHub no puede escribir en él, así que la Mac veía 3 agentes
 * mientras había 3 + 6 trabajando. `scripts/puente/agentes_nube.py` cruza los runs vivos
 * con los trabajadores que anotó `nube-gh.py` al lanzarlos y deja el resultado en disco;
 * aquí solo se lee, sin viajes a la red en la petición del panel.
 */
async function leerAgentesDeLaNube(): Promise<
    { tarea: string; fase: string; modelo: string; minutos: number; donde: string; cola?: string }[]
> {
    try {
        const crudo = await readFile(
            path.join(RAÍZ, "starseed_memory_root", "mando", "agentes-nube.json"),
            "utf8",
        );
        const d = JSON.parse(crudo) as {
            runs?: { run?: unknown; agentes?: unknown; cola?: unknown; minutos?: unknown }[];
        };
        const fuera: {
            tarea: string;
            fase: string;
            modelo: string;
            minutos: number;
            donde: string;
            cola?: string;
        }[] = [];
        for (const r of d.runs ?? []) {
            const n = Number(r.agentes);
            if (!Number.isFinite(n) || n <= 0) continue;
            const cola = typeof r.cola === "string" ? r.cola.split("/").pop() : undefined;
            for (let i = 0; i < Math.min(n, 32); i += 1) {
                // No sabemos QUÉ tarea lleva cada trabajador de la nube —sus latidos
                // mueren con el runner— así que se dice el run y no se inventa una tarea.
                fuera.push({
                    tarea: `nube/${r.run}`,
                    fase: "escribiendo",
                    modelo: "nube-gh/trabajador",
                    minutos: Number.isFinite(Number(r.minutos)) ? Number(r.minutos) : 0,
                    donde: "nube-gh",
                    cola,
                });
            }
        }
        return fuera;
    } catch {
        return [];
    }
}

/**
 * (2026-09-23) Las olas que la nube ejecuta ahora: los runs vivos de `agentes-nube.json` y,
 * de cada uno, la cola que se llevó. Esa cola vive en `enjambre/colas/`, fuera del
 * directorio que lee `leerColas`, y por eso el Puente no sabía ni el título de lo que
 * hacían sus cuatro agentes: la fila decía «nube/35799864769» y nada más. Se lee con
 * `tareasDeCola`, el mismo lector que las colas de la Mac.
 */
async function leerOlasDeLaNube(): Promise<OlaActiva[]> {
    try {
        const d = JSON.parse(
            await readFile(path.join(RAÍZ, "starseed_memory_root", "mando", "agentes-nube.json"), "utf8"),
        ) as {
            medio?: unknown;
            runs?: { run?: unknown; agentes?: unknown; cola?: unknown; minutos?: unknown; enlace?: unknown }[];
        };
        const fuera: OlaActiva[] = [];
        for (const r of d.runs ?? []) {
            const n = Number(r.agentes);
            if (!Number.isFinite(n) || n <= 0) continue;
            const ruta = typeof r.cola === "string" ? r.cola : "";
            let tareas: ReturnType<typeof tareasDeCola> = [];
            // Solo rutas dentro del repo: nada de `..` ni absolutas en un archivo que
            // escribe otro proceso.
            if (ruta && !ruta.includes("..") && !path.isAbsolute(ruta)) {
                try {
                    tareas = tareasDeCola(JSON.parse(await readFile(path.join(RAÍZ, ruta), "utf8")), ruta);
                } catch {
                    /* la cola ya no está en disco: se enseña el run, sin tareas inventadas */
                }
            }
            const nombreCola = (ruta.split("/").pop() ?? "").replace(/\.json$/, "") || `run ${String(r.run)}`;
            fuera.push({
                titulo: tituloDeOla(tareas[0]?.ola ?? nombreCola),
                cola: nombreCola,
                medio: typeof d.medio === "string" ? d.medio : "nube-gh",
                agentes: n,
                minutos: Number.isFinite(Number(r.minutos)) ? Number(r.minutos) : undefined,
                run: r.run !== undefined ? String(r.run) : undefined,
                enlace: typeof r.enlace === "string" ? r.enlace : undefined,
                asignacionConocida: false,
                tareas: tareas.map((t) => ({
                    id: t.id,
                    titulo: t.titulo,
                    descripcion: t.descripcion,
                    archivos: t.archivos,
                })),
            });
        }
        return fuera;
    } catch {
        return [];
    }
}

/**
 * (2026-09-23) Las integradas, desde `main`. Se guarda por HEAD: mientras `main` no se mueva,
 * abrir el medidor no vuelve a llamar a git.
 */
let cacheIntegradas: { head: string; datos: NonNullable<DatosMedidores["integradas"]> } | null = null;
const MAX_INTEGRADAS = 30;

async function leerIntegradas(conocidas: Set<string>): Promise<DatosMedidores["integradas"]> {
    const head = (await git(["rev-parse", "HEAD"])).trim();
    if (!head) return null;
    if (cacheIntegradas && cacheIntegradas.head === head) return cacheIntegradas.datos;
    const { stdout: lineas } = await correr("git", ["log", "main", "-n", "5000", "--format=%H%x1f%cI%x1f%s"], {
        cwd: RAÍZ,
        timeout: 20_000,
        maxBuffer: 16_000_000,
    });
    const tareas = tareasIntegradasEnMain(lineas, conocidas);
    const recientes = tareas.slice(0, MAX_INTEGRADAS);
    const shas = [...new Set(recientes.flatMap((t) => t.commits.map((c) => c.sha)))];
    let crudo = "";
    if (shas.length) {
        crudo = (
            await correr(
                "git",
                [
                    "show",
                    "--numstat",
                    "-U0",
                    "--no-color",
                    "--format=%x1e%H%x1f%cI%x1f%s",
                    ...shas,
                    "--",
                    ".",
                    ":!starseed_memory_root",
                    ":!enjambre/colas",
                ],
                { cwd: RAÍZ, timeout: 30_000, maxBuffer: 64_000_000 },
            )
        ).stdout;
    }
    const porSha = new Map(parsearCommits(crudo).map((c) => [c.sha, c]));

    // Lo que implementaron, buscado en los archivos TAL Y COMO ESTÁN HOY en el disco (main).
    const definicionesDe = (t: (typeof recientes)[number]): Definicion[] => {
        const vistas = new Set<string>();
        const fuera: Definicion[] = [];
        for (const c of t.commits) {
            for (const d of porSha.get(c.sha)?.definiciones ?? []) {
                const k = `${d.ruta}\u0000${d.nombre}`;
                if (vistas.has(k)) continue;
                vistas.add(k);
                fuera.push(d);
            }
        }
        return fuera;
    };
    const rutas = [...new Set(recientes.flatMap((t) => definicionesDe(t).map((d) => d.ruta)))];
    const contenidos = new Map<string, string | null>();
    await Promise.all(
        rutas.map(async (ruta) => {
            // Solo dentro del repo: la ruta sale de un diff, no se le da permiso para salir.
            if (ruta.includes("..") || path.isAbsolute(ruta)) return contenidos.set(ruta, null);
            contenidos.set(ruta, await readFile(path.join(RAÍZ, ruta), "utf8").catch(() => null));
        }),
    );

    const datos: NonNullable<DatosMedidores["integradas"]> = {
        total: tareas.length,
        lista: recientes.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            ola: t.ola,
            fecha: t.fecha,
            commits: t.commits.map((c) => {
                const x = porSha.get(c.sha);
                return {
                    sha: c.sha,
                    fecha: x?.fecha ?? t.fecha,
                    asunto: x?.asunto ?? "",
                    clase: c.salvavidas ? ("trabajo del agente" as const) : ("integración" as const),
                    archivos: x?.archivos ?? [],
                };
            }),
            ubicaciones: ubicarDefiniciones(definicionesDe(t), (r) => contenidos.get(r) ?? null),
        })),
    };
    cacheIntegradas = { head, datos };
    return datos;
}

async function leerEntradas(): Promise<Record<string, Entrada>> {
    const crudo = await leerProgreso();
    const salida: Record<string, Entrada> = {};
    for (const [k, v] of Object.entries(crudo)) {
        if (v && typeof v === "object") salida[k] = v as Entrada;
    }
    return salida;
}

/**
 * (2026-09-24) Cuántas veces se mandó cada tarea a la nube en los dos últimos días, contando
 * las `enjambre/colas/cola-nube-AAAAMMDD-HHMM*.json`. La misma cuenta que usa el reparto
 * para dejar de reenviar (`repartir_nube.envios_por_tarea`). Se guarda un minuto: `reunir`
 * se llama varias veces por segundo al abrir el Puente.
 */
let cacheEnvios: { t: number; cuenta: Record<string, number> } | null = null;
async function enviosALaNube(): Promise<Record<string, number>> {
    if (cacheEnvios && Date.now() - cacheEnvios.t < 60_000) return cacheEnvios.cuenta;
    const carpeta = path.join(RAÍZ, "enjambre", "colas");
    const limite = Date.now() - 2 * 86_400_000;
    const cuenta: Record<string, number> = {};
    for (const nombre of await readdir(carpeta).catch(() => [] as string[])) {
        const m = /^cola-nube-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2}).*\.json$/.exec(nombre);
        if (!m) continue;
        const cuando = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`).getTime();
        if (!(cuando >= limite)) continue;
        try {
            const d = JSON.parse(await readFile(path.join(carpeta, nombre), "utf8")) as unknown;
            const lista = Array.isArray(d) ? d : ((d as { tareas?: unknown[] })?.tareas ?? []);
            const ids = new Set(
                lista.map((t) => (t && typeof t === "object" ? String((t as { id?: unknown }).id ?? "") : "")).filter(Boolean),
            );
            for (const id of ids) cuenta[id] = (cuenta[id] ?? 0) + 1;
        } catch {
            /* una cola ilegible no cuenta */
        }
    }
    cacheEnvios = { t: Date.now(), cuenta };
    return cuenta;
}

async function reunir(): Promise<Partial<DatosMedidores>> {
    const [progreso, colas, bus, latidosMac, vivo, commitsGit] = await Promise.all([
        leerEntradas(),
        leerColas().catch(() => []),
        leerLatidosDelBus().catch(() => ({ latidos: [], enjambres: [] })),
        leerLatidos().catch(() => []),
        enjambreEnMarcha().catch(() => false),
        leerCommitsDeOlas().catch(() => new Map()),
    ]);
    // La pausa del Mando vive fuera de git, en la config del director.
    let pausado = false;
    try {
        const cfg = JSON.parse(
            await readFile(path.join(RAÍZ, "starseed_memory_root", "mando", "director-config.json"), "utf8"),
        ) as { pausado?: boolean };
        pausado = Boolean(cfg.pausado);
    } catch {
        pausado = false;
    }

    const titulos: Record<string, string> = {};
    for (const t of colas) titulos[t.id] = t.titulo;
    // (2026-09-25) Agentes externos (Claude en Cowork, subagentes, Hermes): su título viene
    // en el propio latido porque no salen de ninguna cola.
    for (const l of latidosMac) if (l.titulo && !titulos[l.tarea]) titulos[l.tarea] = l.titulo;

    // Commits que esta rama tiene y el remoto no.
    const salida = await git(["log", "@{upstream}..HEAD", "--format=%H%x1f%s%x1f%cI"]);
    const commitsSinPublicar = salida
        .split("\n")
        .filter(Boolean)
        .map((l) => {
            const [sha, asunto, fecha] = l.split("");
            return { sha: sha ?? "", asunto: asunto ?? "", fecha: fecha ?? "" };
        });

    // Ejecutables ahora: la regla vive en `medidores.ts` y es la MISMA que usa el
    // vigilante. Aquí solo se le da lo que hay en disco y los asuntos de `main`.
    // (2026-09-21) Aqui habia un `-n 1200` y por eso el medidor seguia ofreciendo tareas
    // YA HECHAS aun leyendo Git: el repo tiene 2.311 commits y el de X6 esta en la posicion
    // 1.311, justo fuera de la ventana. Y la ventana se llena rapido de ruido —356 commits
    // de `chore(memoria)`—, asi que recortarla equivale a olvidar meses de trabajo. Sin
    // tope: son 2.311 lineas, unos 150 KB, que git entrega en milisegundos. Una ventana
    // que solo ve lo reciente convierte trabajo terminado en trabajo pendiente.
    const asuntosDeMain = await git(["log", "main", "--format=%s"]);
    const ejecutables = ejecutablesDeColas(colas, progreso, asuntosDeMain);

    // Latidos: los de ESTA Mac mandan sobre los del bus para la misma tarea, y los de la
    // nube se añaden. Mirar solo el bus era lo que hacía que la cabecera dijera «1 agente»
    // y el panel, justo debajo, «ningún agente escribiendo» sobre la misma tarea: el
    // orquestador local escribe `olas/latidos-*.json` cada 20 s y solo publica en el bus
    // de vez en cuando, así que el bus siempre va por detrás o directamente vacío.
    const deAqui = new Set(latidosMac.map((l) => l.tarea));
    const latidosCompletos = [...latidosMac, ...bus.latidos.filter((l) => !deAqui.has(l.tarea))];
    const latidosDeAqui = [
        // (2026-09-21) Aqui se tiraban `quietoSegundos`, `bytesLog`, `cola` y `medio`, que
        // `leerLatidos` ya trae. Sin ellos el medidor de agentes no podia decir nada que el
        // de tareas no dijera, y los dos enseñaban lo mismo.
        ...latidosMac.map((l) => ({
            tarea: l.tarea,
            fase: l.fase,
            modelo: l.modelo,
            minutos: l.minutos,
            // (2026-09-25) Los externos dicen dónde corren (p. ej. «cowork»).
            donde: l.donde || "mac",
            proveedor: l.proveedor as string | undefined,
            quietoSegundos: l.quietoSegundos,
            bytesLog: l.bytesLog,
            cola: l.cola,
            medio: l.medio,
            titulo: l.titulo,
        })),
        ...bus.latidos
            .filter((l) => !deAqui.has(l.tarea))
            .map((l) => ({
                tarea: l.tarea,
                fase: l.fase,
                modelo: l.modelo,
                minutos: l.minutos,
                donde: l.donde,
                proveedor: l.proveedor,
            })),
    ];

    const fila = colaInteligente(colas, progreso, latidosCompletos, commitsGit, asuntosDeMain);

    // (2026-09-22) Los hechos de la ficha ampliada: qué toca cada tarea viva en su
    // worktree, qué archivos declaró su cola y qué le han ido diciendo los directores.
    // Solo de las tareas VIVAS y de las rancias: leer el disco de las 400 del historial
    // costaría segundos por cada refresco del panel y nadie mira eso.
    const idsVivas = [
        ...new Set([
            ...latidosDeAqui.map((l) => l.tarea),
            ...Object.entries(progreso)
                .filter(([, v]) => v?.estado === "en_curso")
                .map(([id]) => id),
        ]),
    ];
    const declarados: Record<string, string[]> = {};
    // `leerColas()` devuelve una lista plana de tareas, no pares (nombre, tareas).
    // (2026-09-23) Este bucle existía y NUNCA llenaba nada: `leerColas` no traía `archivos`,
    // así que la ficha «Alcance declarado» salía vacía con el alcance escrito en la cola.
    for (const t of colas) {
        if (t.id && t.archivos?.length && !declarados[t.id]) declarados[t.id] = t.archivos;
    }
    const envios = await enviosALaNube().catch(() => ({}) as Record<string, number>);
    const [obras, historiales, agentesNube, contenedores, proveedores, tokens, olasNube] = await Promise.all([
        leerObras(idsVivas).catch(() => ({})),
        leerHistoriales(idsVivas).catch(() => ({})),
        leerAgentesDeLaNube().catch(() => []),
        leerContenedores().catch(() => null),
        leerProveedores().catch(() => []),
        leerTokens().catch(() => null),
        leerOlasDeLaNube().catch(() => []),
    ]);

    // (2026-09-23) Las olas en marcha, de la Mac y de la nube, con sus tareas. Y el encargo
    // de cada tarea, que hasta hoy no salía de la cola: el Puente sabía el título y nada más.
    const olasActivas = [...olasDeLaMac(colas, latidosDeAqui), ...olasNube];
    const descripciones: Record<string, string> = {};
    for (const t of colas) if (t.descripcion) descripciones[t.id] = t.descripcion;
    for (const ola of olasNube) {
        for (const t of ola.tareas) {
            if (!titulos[t.id] && t.titulo) titulos[t.id] = t.titulo;
            if (!descripciones[t.id] && t.descripcion) descripciones[t.id] = t.descripcion;
            if (!declarados[t.id] && t.archivos?.length) declarados[t.id] = t.archivos;
        }
        // La fila de la nube en «En curso» y «Agentes» se llama `nube/<run>`: que diga QUÉ
        // ola es y qué tareas lleva, en vez del número del run a secas.
        if (ola.run) {
            // (2026-09-24) De qué OLA sale cada tarea (no la fecha del reparto) y cuáles se
            // están reenviando una y otra vez sin integrarse.
            const olaDe = new Map(
                colas.filter((t) => !/^(auto-|nube-)/.test(t.cola ?? "")).map((t) => [t.id, t.ola] as const),
            );
            titulos[`nube/${ola.run}`] = tituloDeRunNube(
                ola.titulo,
                ola.tareas.map((t) => ({ id: t.id, ola: olaDe.get(t.id) })),
                envios,
            );
        }
    }

    return {
        progreso,
        titulos,
        // Los de la nube se SUMAN a los de la Mac: el medidor de agentes tiene que contar
        // toda la capacidad viva, no solo la de esta máquina.
        latidos: [...latidosDeAqui, ...agentesNube],
        contenedores,
        proveedores,
        tokens,
        commitsSinPublicar,
        // (2026-09-23) Leer un JSON pequeño: el indicador de carga de «Sin publicar».
        publicacion: await leerDiario().catch(() => null),
        ejecutables,
        enjambreVivo: vivo,
        enjambrePausado: pausado,
        fila,
        obras,
        historiales,
        declarados,
        olasActivas,
        descripciones,
        // El repo publico, para poder enlazar ramas y commits desde la ficha.
        repoGitHub: "StarSeedSystem/starseed-system",
        // (2026-09-21) Esto FALTABA y por eso el medidor «listas» ofrecia 24 tareas ya
        // hechas mientras avisaba «no se pudieron leer los asuntos de Git». Los asuntos se
        // leen arriba (linea 101) y se usan aqui mismo, pero no viajaban en el objeto, asi
        // que `construirDetalle` recibia `undefined` y no podia filtrar nada. El filtro
        // estaba bien escrito; lo que faltaba era darle el dato.
        asuntosDeMain,
    };
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const clave = (new URL(peticion.url).searchParams.get("clave") ?? "ola-activa") as ClaveMedidor;
    // Un fallo leyendo git o el bus no puede tumbar el panel: se devuelve lo que sí haya.
    const datos: Partial<DatosMedidores> = await reunir().catch(() => ({}));
    if (clave === "integradas") {
        // Los ids que existen de verdad: sin este filtro, «mando: …» contaría como tarea.
        const conocidas = new Set([...Object.keys(datos.progreso ?? {}), ...Object.keys(datos.titulos ?? {})]);
        datos.integradas = await leerIntegradas(conocidas).catch(() => null);
    }
    return Response.json(
        { detalle: detalleDeMedidor(clave, datos), generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

async function guardar(entradas: Record<string, Entrada>): Promise<void> {
    const texto = JSON.stringify(entradas, null, 1);
    const temporal = `${PROGRESO}.tmp-${process.pid}`;
    await writeFile(temporal, texto, "utf8");
    await rename(temporal, PROGRESO);
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: { clave?: string; accion?: string; id?: string; texto?: string };
    try {
        cuerpo = (await peticion.json()) as typeof cuerpo;
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const { clave = "", accion = "", id = "", texto = "" } = cuerpo;

    // (2026-09-23) «¿Cabe más trabajo?» y «Asignar ya». La decisión entera vive en
    // `scripts/puente/asignar_huecos.py` (pura y probada): aquí solo se llama y se devuelve su
    // frase. Nunca lanza un orquestador: si no hay tanda, despierta al vigilante.
    if (accion === "asignar-huecos" || accion === "asignar-tarea" || accion === "comprobar-asignacion") {
        if (accion === "asignar-tarea" && !id) {
            return Response.json({ error: "Falta la tarea que asignar." }, { status: 400 });
        }
        // Una rancia («en curso» sin ningún agente que lata por ella) vuelve a pendiente antes
        // de asignarse; una que SÍ tiene agente no se toca: nada en marcha se interrumpe.
        if (accion === "asignar-tarea") {
            const datosVivos = await reunir().catch(() => ({}) as Partial<DatosMedidores>);
            const late = (datosVivos.latidos ?? []).some((l) => l.tarea === id);
            const entradas = JSON.parse(await readFile(PROGRESO, "utf8").catch(() => "{}")) as Record<string, Entrada>;
            if (entradas[id]?.estado === "en_curso") {
                if (late) {
                    return Response.json({ error: `${id} tiene un agente trabajando ahora: no se reasigna.` }, { status: 409 });
                }
                entradas[id].estado = "pendiente";
                entradas[id].nota = `rancia (en curso sin agente): reasignada desde el Mando el ${new Date()
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}`;
                await guardar(entradas);
            }
        }
        const orden = accion === "comprobar-asignacion" ? "comprobar" : "asignar";
        const args = ["scripts/puente/asignar_huecos.py", orden];
        if (id && accion !== "asignar-huecos") args.push("--tarea", id);
        try {
            const { stdout } = await correr("python3", args, { cwd: RAÍZ, timeout: 90_000, windowsHide: true });
            const r = JSON.parse((stdout || "").trim().split("\n").pop() || "{}") as {
                resumen?: string;
                hechas?: string[];
                puede?: boolean;
            };
            return Response.json({
                ok: true,
                resumen: r.resumen || "Comprobado.",
                puede: Boolean(r.puede),
                hechas: r.hechas ?? [],
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude comprobar la asignación: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    if (accion === "comprobar-agente") {
        const datosVivos = await reunir().catch(() => ({}) as Partial<DatosMedidores>);
        const latido = (datosVivos.latidos ?? []).find((l) => l.tarea === id);
        const libres = (datosVivos.proveedores ?? []).filter((p) => /^(vivo|ok|disponible|activo|libre|listo)$/i.test(p.estado)).length;
        return Response.json({ ok: true, resumen: veredictoDeAgente(latido, libres) });
    }

    // (2026-09-22) Los dos botones de contenedores. Van ANTES de leer progreso.json porque
    // no tocan tareas: hablan con los servicios de nube.
    if (accion === "sondear-contenedores") {
        try {
            // Sondeo completo: habla con GitHub, Hugging Face y gcloud. Tarda ~40 s, y por
            // eso se espera aquí en vez de dejarlo suelto: el botón tiene que poder decir
            // qué encontró, no «ya veremos».
            const { stdout } = await correr("python3", ["scripts/puente/contenedores_nube.py"], {
                cwd: RAÍZ,
                timeout: 180_000,
                windowsHide: true,
            });
            const primera = (stdout || "").trim().split("\n")[0] ?? "";
            return Response.json({ ok: true, resumen: primera || "sondeo hecho" });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude sondear los contenedores: ${msj}` }, { status: 500 });
        }
    }

    if (accion === "desplegar-nube") {
        const inv = await leerContenedores().catch(() => null);
        const destino =
            (id && inv?.contenedores.find((c) => c.id === id)) ||
            inv?.contenedores.find((c) => c.desplegable && c.agentes_libres > 0);
        if (!destino) {
            return Response.json(
                {
                    error: inv
                        ? "Ningún contenedor con sitio libre ahora mismo. Pulsa «Buscar contenedores ahora» para volver a medir."
                        : "Todavía no hay medida de contenedores: pulsa «Buscar contenedores ahora».",
                },
                { status: 409 },
            );
        }
        if (!destino.desplegable || destino.agentes_libres <= 0) {
            return Response.json(
                { error: `${destino.servicio} no tiene sitio libre: ${destino.falta || destino.detalle || "sin capacidad"}.` },
                { status: 409 },
            );
        }
        // ¿HAY TRABAJO QUE MANDAR? (2026-09-22) Sin esto el botón contestaba «desplegando
        // 4 agentes» y el lanzamiento moría por su cuenta con «el reparto no creó ninguna
        // cola (¿no hay atraso?)». Un botón que promete lo que no pasa es exactamente la
        // avería que llevamos toda la semana quitando, así que se mira ANTES de prometer.
        try {
            const { stdout } = await correr(
                "python3",
                ["scripts/puente/repartir-a-nube.py", "--tope", String(destino.agentes_por_job * 2), "--simular"],
                { cwd: RAÍZ, timeout: 60_000, windowsHide: true },
            );
            const m = /(\d+)\s+tareas?/.exec(stdout || "");
            if (m && Number(m[1]) === 0) {
                return Response.json(
                    {
                        error:
                            "No hay trabajo pendiente que la nube pueda coger: todo lo que queda espera a otra tarea o ya está en main. " +
                            "Desplegar agentes ahora sería pagar máquinas para que miren.",
                    },
                    { status: 409 },
                );
            }
        } catch {
            // Si la simulación no se puede hacer, se sigue: el lanzamiento dirá la verdad.
        }

        try {
            // Suelto y con su log: un lanzamiento tarda hasta un minuto (empuja la rama de
            // la cola y espera a que GitHub registre el run), más de lo que aguanta una
            // petición. El resultado se ve en el propio medidor, que cuenta los agentes.
            const hijo = spawn(
                "python3",
                [
                    "scripts/puente/nube-gh.py",
                    "lanzar",
                    "--tope",
                    String(Math.max(2, destino.agentes_por_job * 2)),
                    "--trabajadores",
                    String(destino.agentes_por_job),
                    "--minutos",
                    "45",
                ],
                { cwd: RAÍZ, detached: true, stdio: "ignore" },
            );
            hijo.unref();
            return Response.json({
                ok: true,
                resumen: `desplegando ${destino.agentes_por_job} agente(s) en ${destino.servicio}; el medidor los contará en cuanto GitHub arranque el job`,
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude desplegar en ${destino.servicio}: ${msj}` }, { status: 500 });
        }
    }

    if (accion === "publicar") {
        // (2026-09-22) Este botón existía SOLO para negarse: decía «Publicar en
        // origin/main», lo pulsabas y el servidor contestaba 409 mandándote a otra
        // pestaña. Un botón que no hace lo que su texto promete es peor que no tenerlo.
        // Alex: «el botón de publicar en la ventana de los commits sin publicar no
        // funciona». Ahora publica de verdad, por el mismo camino que la pestaña: commit,
        // tsc, vitest, pruebas de Python, build y solo entonces push. Si una puerta se
        // pone en rojo, para ahí; nunca se empuja para arreglarlo después.
        const salida = await lanzarPublicacion(
            texto.trim() || "publicado desde el medidor «commits sin publicar»",
        );
        if (!salida.ok) {
            return Response.json({ error: salida.error ?? "No se pudo lanzar la publicación." }, { status: 409 });
        }
        return Response.json({
            ok: true,
            hecho: true,
            mensaje:
                "Publicación lanzada: commit, tsc, vitest, pruebas de Python y build antes del push. " +
                "Su marcha se sigue en la pestaña «Publicar».",
        });
    }

    // (2026-09-23) «Reintentar con cambio automático» (Alex). El cambio NO se improvisa
    // aquí: se calcula con `cambioAutomatico`, la MISMA función que decide si el botón se
    // enseña, sobre la MISMA ficha que se ve en pantalla. Así lo que se manda es
    // exactamente lo que el botón prometía. Si de la ficha no sale nada concreto, esto se
    // niega y lo dice: reintentar sin cambio da el mismo resultado.
    let accionEfectiva = accion;
    let cambio = texto.trim();
    let explicacionAuto = "";
    let quitarAuto: string[] = [];
    if (accion === "reintentar-auto") {
        if (!id) {
            return Response.json({ error: "Falta la tarea a la que aplicarlo." }, { status: 400 });
        }
        const datosAuto = await reunir().catch(() => ({}));
        const filaAuto = detalleDeMedidor(clave as ClaveMedidor, datosAuto).filas.find((f) => f.id === id);
        const auto = filaAuto ? cambioAutomatico(filaAuto) : null;
        if (!auto) {
            return Response.json(
                {
                    error:
                        "No hay cambio que deducir: lo que espera esta tarea sigue vivo, así que reintentar daría " +
                        "exactamente lo mismo. Espera a que se integre, o usa «Reintentar con un cambio» y di qué cambiar.",
                },
                { status: 409 },
            );
        }
        accionEfectiva = "reintentar";
        cambio = auto;
        explicacionAuto = auto;
        // (2026-09-23) Y la dependencia muerta SALE de `depende`: el orquestador, el vigía y
        // el reparto a la nube lo aplican con `scripts/enjambre/cambio_pedido.py`. Sin esto
        // la tarea volvía a la cola… y se volvía a bloquear sola en la primera vuelta.
        quitarAuto = filaAuto ? dependenciasMuertas(filaAuto) : [];
    }

    if (accionEfectiva === "reintentar" && !cambio) {
        return Response.json(
            { error: "Describe qué hay que cambiar: reintentar sin cambio da exactamente el mismo resultado." },
            { status: 400 },
        );
    }

    const crudo = await readFile(PROGRESO, "utf8").catch(() => "{}");
    let entradas: Record<string, Entrada>;
    try {
        entradas = JSON.parse(crudo) as Record<string, Entrada>;
    } catch {
        return Response.json({ error: "progreso.json ilegible; no toco nada." }, { status: 500 });
    }

    const ahora = new Date().toISOString().slice(0, 16).replace("T", " ");
    const objetivo =
        accion === "descartar-todas"
            ? detalleDeMedidor(clave as ClaveMedidor, { progreso: entradas }).filas.map((f) => f.id)
            : id
              ? [id]
              : [];

    if (objetivo.length === 0) {
        return Response.json({ error: "No hay ninguna tarea a la que aplicar esto." }, { status: 400 });
    }

    const intocables = objetivo.filter((t) => TERMINALES.has(entradas[t]?.estado ?? ""));
    if (intocables.length > 0) {
        return Response.json(
            { error: `${intocables.join(", ")} ya está en main: eso no se toca desde un panel.` },
            { status: 409 },
        );
    }

    const hechas: string[] = [];
    for (const t of objetivo) {
        const e = entradas[t];
        if (!e) continue;
        if (accionEfectiva === "descartar" || accionEfectiva === "descartar-todas") {
            e.estado = "rechazada";
            e.nota = `descartada desde el medidor «${clave}» el ${ahora}`;
        } else if (accionEfectiva === "reintentar") {
            e.estado = "pendiente";
            e.nota = `reintento pedido desde el Mando: ${cambio.slice(0, 400)}`;
            e.cambio_pedido = cambio.slice(0, 2000);
            if (quitarAuto.length) e.quitar_dependencias = quitarAuto;
            // La rotación empieza de cero: si no, arrastra los modelos que fallaron con el
            // prompt VIEJO, que es justo el que se acaba de cambiar.
            delete e.modelos_fallidos;
            delete e.escalada;
        } else {
            return Response.json({ error: `Acción desconocida: ${accionEfectiva}` }, { status: 400 });
        }
        e.reconciliado = ahora;
        hechas.push(t);
    }

    await guardar(entradas);
    return Response.json(
        { ok: true, tareas: hechas, accion: accionEfectiva, cambio: explicacionAuto || undefined },
        { headers: { "Cache-Control": "no-store" } },
    );
}
