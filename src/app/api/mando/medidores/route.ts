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
import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import {
    colaInteligente,
    enjambreEnMarcha,
    leerColas,
    leerCommitsDeOlas,
    leerLatidos,
    leerLatidosDelBus,
    leerProgreso,
} from "@/lib/mando/lector-local";
import {
    TERMINALES,
    detalleDeMedidor,
    ejecutablesDeColas,
    type ClaveMedidor,
    type DatosMedidores,
} from "@/lib/mando/medidores";
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

async function leerEntradas(): Promise<Record<string, Entrada>> {
    const crudo = await leerProgreso();
    const salida: Record<string, Entrada> = {};
    for (const [k, v] of Object.entries(crudo)) {
        if (v && typeof v === "object") salida[k] = v as Entrada;
    }
    return salida;
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
            donde: "mac",
            proveedor: undefined as string | undefined,
            quietoSegundos: l.quietoSegundos,
            bytesLog: l.bytesLog,
            cola: l.cola,
            medio: l.medio,
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
    for (const t of colas) {
        const id = String((t as { id?: unknown }).id ?? "");
        const archivos = (t as { archivos?: unknown }).archivos;
        if (id && Array.isArray(archivos) && !declarados[id]) {
            declarados[id] = archivos.map((a) => String(a));
        }
    }
    const [obras, historiales] = await Promise.all([
        leerObras(idsVivas).catch(() => ({})),
        leerHistoriales(idsVivas).catch(() => ({})),
    ]);

    return {
        progreso,
        titulos,
        latidos: latidosDeAqui,
        commitsSinPublicar,
        ejecutables,
        enjambreVivo: vivo,
        enjambrePausado: pausado,
        fila,
        obras,
        historiales,
        declarados,
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
    const datos = await reunir().catch(() => ({}));
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

    if (accion === "publicar") {
        return Response.json(
            {
                error:
                    "Publicar pasa por la pestaña Publicar, que corre tsc, vitest y las pruebas del puente antes de empujar.",
            },
            { status: 409 },
        );
    }

    if (accion === "reintentar" && !texto.trim()) {
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
        if (accion === "descartar" || accion === "descartar-todas") {
            e.estado = "rechazada";
            e.nota = `descartada desde el medidor «${clave}» el ${ahora}`;
        } else if (accion === "reintentar") {
            e.estado = "pendiente";
            e.nota = `reintento pedido desde el Mando: ${texto.trim().slice(0, 400)}`;
            e.cambio_pedido = texto.trim().slice(0, 2000);
            // La rotación empieza de cero: si no, arrastra los modelos que fallaron con el
            // prompt VIEJO, que es justo el que se acaba de cambiar.
            delete e.modelos_fallidos;
            delete e.escalada;
        } else {
            return Response.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
        }
        e.reconciliado = ahora;
        hechas.push(t);
    }

    await guardar(entradas);
    return Response.json({ ok: true, tareas: hechas, accion }, { headers: { "Cache-Control": "no-store" } });
}
