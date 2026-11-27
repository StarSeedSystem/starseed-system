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
import { leerRondaArchivo, pruebaParaEnMarcha } from "@/lib/mando/pruebas-vivas-fuentes"; // PRB1111V
import { rondaParaEnviar } from "@/lib/mando/ronda-aparatos"; // RON1112C
import { lanzarPublicacion, leerDiario } from "@/lib/mando/publicador";
import { POST as reintentarTareas } from "@/app/api/mando/reintentar/route";
import { leerCreditosPago } from "@/lib/mando/creditos-pago";
import { detalleAntigravity, resumirAntigravity, type ResumenAntigravity } from "@/lib/mando/creditos-antigravity";
import { agentesDeClaudeNube } from "@/lib/mando/agentes-claude-nube";
// MED1111E
import { agentesDeCarrilClaude } from "@/lib/mando/carril-claude";
import { type EnMarcha, publicacionParaEnviar } from "@/lib/mando/en-marcha";
import { leerCarrilDeDisco, leerPuertaDeDisco } from "@/lib/mando/en-marcha-disco";
// MED1113A · los procesos de la dirección (agentes de Claude en sus árboles), medidos y sin relevo
import { agentesDeDireccion } from "@/lib/mando/procesos-direccion";
import { leerProcesosDireccion } from "@/lib/mando/procesos-direccion-disco";
import { agentesDeCloudroom } from "@/lib/mando/agentes-cloudroom";
import { agentesDelA1, colaDelA1, DONDE_ORACLE } from "@/lib/mando/agentes-oracle";
import {
    colaInteligente,
    enjambreEnMarcha,
    leerColas,
    leerCommitsDeOlas,
    leerLatidos,
    leerEscritores,
    leerLatidosDelBus,
    leerProgreso,
    tareasDeCola,
} from "@/lib/mando/lector-local";
import {
    TERMINALES,
    agentesDeRunsNube,
    tituloDeRunNube,
    veredictoDeAgente,
    detalleDeMedidor,
    leerNodosAlmacenamiento,
    ejecutablesDeColas,
    olasDeLaMac,
    tituloDeOla,
    type OlaActiva,
    type AgenteDeLaNube,
    type ClaveMedidor,
    type DatosMedidores,
    type DetalleMedidor,
    type RunDeLaNube,
} from "@/lib/mando/medidores";
import { elegirFuente, faltaLocal, leerPuerta, resumenDePuerta } from "@/lib/mando/medidores-remotos";
import {
    contarIntegradasEnAsuntos,
    parsearCommits,
    tareasIntegradasEnMain,
    ubicarDefiniciones,
    type Definicion,
} from "@/lib/mando/integradas";
import { parsearClavesLote } from "@/lib/mando/medidores-lote";
import { fundirTitulosArchivados, parsearIndice } from "@/lib/mando/indice-colas";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { medirDisco } from "@/lib/mando/almacenamiento";
import { discoParaMedidor, medirMemoriaMedidor } from "@/lib/mando/memoria-medidor";
import { leerPendientes } from "@/lib/mando/publicaciones";
import { crearReunionCompartida } from "@/lib/mando/reunion-compartida";
import { esOpcionAlex, idDeTareaValido, type EstadoRevisorBloqueadas } from "@/lib/mando/bloqueadas";
import { leerAjustes, leerPropuestas, leerPropuestasConFiltro } from "@/lib/mando/imaginacion-servidor";
import { leerAmbito, type AmbitoPropuesta } from "@/lib/mando/imaginacion-tipos";

async function leerBuscarCapacidadEstado(): Promise<DatosMedidores["buscarCapacidad"]> {
    try {
        const estado = path.join(os.homedir(), ".starseed", "buscar-capacidad.json");
        const crudo = await readFile(estado, "utf8");
        const d = JSON.parse(crudo) as DatosMedidores["buscarCapacidad"];
        return d && typeof d === "object" ? d : null;
    } catch {
        return null;
    }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const RAÍZ = raizDelProyecto();
const PROGRESO = path.join(RAÍZ, "starseed_memory_root", "olas", "progreso.json");

type Entrada = { estado?: string; nota?: string; t?: string; modelo?: string;[k: string]: unknown };

async function git(args: string[]): Promise<string> {
    try {
        const { stdout } = await correr("git", args, { cwd: RAÍZ, timeout: 20_000, maxBuffer: 4_000_000 });
        return stdout;
    } catch {
        return "";
    }
}

/** Envuelve una fuente externa o lenta con tope estricto en ms y valor de respaldo seguro. */
async function conTope<T>(promesa: Promise<T>, ms: number, respaldo: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promesa.catch(() => respaldo),
            new Promise<T>((res) => {
                timer = setTimeout(() => res(respaldo), ms);
            }),
        ]);
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
}

let cacheAsuntosMain: { ref: string; asuntos: string } | null = null;
async function leerAsuntosDeMainCacheados(): Promise<string> {
    const ref = (await git(["rev-parse", "main"])).trim();
    if (ref && cacheAsuntosMain && cacheAsuntosMain.ref === ref) return cacheAsuntosMain.asuntos;
    const asuntos = await git(["log", "main", "--format=%s"]);
    if (ref && asuntos) cacheAsuntosMain = { ref, asuntos };
    return asuntos;
}

/** (2026-10-08) El interruptor y el estado de la autopublicación, para que «Sin publicar» diga
 *  quién publica cada cosa y no enseñe el fallo de una publicación manual ya superada. */
async function leerAutopublicacion(): Promise<DatosMedidores["autopublicacion"]> {
    const carpeta = path.join(os.homedir(), ".starseed", "produccion");
    const leer = async (n: string) => JSON.parse(await readFile(path.join(carpeta, n), "utf8").catch(() => "{}")) as Record<string, unknown>;
    const [interruptor, estado] = await Promise.all([leer("autopublicar.json"), leer("autopublicar-estado.json")]);
    const ultima = Number(estado.ultima_publicacion);
    return {
        activa: interruptor.activo === true,
        fase: typeof estado.fase === "string" ? estado.fase : undefined,
        detalle: typeof estado.detalle === "string" ? estado.detalle : undefined,
        ultimaMs: Number.isFinite(ultima) && ultima > 0 ? ultima * 1000 : undefined,
        // MED1111E: cuándo anotó su fase («2026-11-11 01:14:14», hora local), para no dar por viva una fase «ci» vieja.
        actualizadoMs: typeof estado.actualizado === "string" && Number.isFinite(Date.parse(estado.actualizado.replace(" ", "T")))
            ? Date.parse(estado.actualizado.replace(" ", "T"))
            : undefined,
    };
}

// MED1111E · El carril de Claude y la puerta de integración ───────────────────────────────────────
async function leerEnMarcha(autopublicacion?: DatosMedidores["autopublicacion"] | null): Promise<EnMarcha | null> {
    const [carril, puerta, autoLeida, pruebas, rondaLeida, direccion] = await Promise.all([
        leerCarrilDeDisco(RAÍZ),
        leerPuertaDeDisco(
            path.join(os.homedir(), ".starseed", "produccion", "puerta-estado.json"),
            path.join(os.homedir(), ".starseed", "opus1031"),
        ),
        autopublicacion === undefined ? leerAutopublicacion().catch(() => null) : Promise.resolve(autopublicacion),
        // PRB1111V · la versión de prueba en marcha (o fallida sin sustituir), solo con rastro en GitHub.
        pruebaParaEnMarcha().catch(() => null),
        Promise.resolve().then(() => leerRondaArchivo()).catch(() => null), // RON1112C · la ronda de aparatos
        conTope(leerProcesosDireccion(RAÍZ), 4_500, null), // MED1113A · acotado para no colgar la reunión
    ]);
    const publicacion = autoLeida ? publicacionParaEnviar(autoLeida) : null;
    const ronda = rondaParaEnviar(rondaLeida, Date.now()); // RON1112C: sólo si está en vigor a esta hora
    // MED1113A: `direccion` viaja SIEMPRE (también null): «no se pudo medir» y «no hay nada» no son lo mismo.
    return { generadoMs: Date.now(), carril, puerta, publicacion, ...(pruebas ? { pruebas } : {}), ...(ronda ? { ronda } : {}), direccion };
}

/** (2026-11-05, VER1105D) Estado del director de lanzamientos (Centro de Versiones).
 *  Lee `~/.starseed/produccion/lanzamientos-estado.json` — el mismo archivo que usa
 *  `director_lanzamientos.py` y la API `/api/mando/lanzamientos`. */
async function leerLanzamientosEstado(): Promise<any> {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "produccion", "lanzamientos-estado.json"), "utf8");
        const d = JSON.parse(crudo);
        return d && typeof d === "object" ? d : null;
    } catch {
        return null;
    }
}

/** (2026-10-10, OPB1011) La última pasada del revisor automático de bloqueadas. Solo lo que pinta
 *  Genesis: cadenas, transformadas de hoy, decisiones de Alex y cuentas (nunca la memoria entera). */
async function leerRevisorBloqueadas(): Promise<EstadoRevisorBloqueadas | null> {
    try {
        const crudo = JSON.parse(
            await readFile(path.join(RAÍZ, "starseed_memory_root", "olas", "revisor-bloqueadas.json"), "utf8"),
        ) as EstadoRevisorBloqueadas & { memoria?: unknown };
        if (!crudo || typeof crudo !== "object") return null;
        return {
            t: crudo.t,
            medio: crudo.medio,
            cola_viva: crudo.cola_viva,
            cadenas: Array.isArray(crudo.cadenas) ? crudo.cadenas.slice(0, 40) : [],
            en_cadena: crudo.en_cadena && typeof crudo.en_cadena === "object" ? crudo.en_cadena : {},
            transformadas_hoy: Array.isArray(crudo.transformadas_hoy) ? crudo.transformadas_hoy.slice(-120) : [],
            necesitan_alex: crudo.necesitan_alex && typeof crudo.necesitan_alex === "object" ? crudo.necesitan_alex : {},
            cuentas: crudo.cuentas,
            resumen: crudo.resumen,
        };
    } catch {
        return null;
    }
}

/**
 * Lo que necesita el medidor «Imaginación»: propuestas (para la pastilla, filas y lo que espera
 * en otros ámbitos), ajustes y el `filtro_astraura` del día, con el ámbito pedido. Protegido:
 * si algo falla, `null` y la pastilla dice «sin datos»; nunca una cifra inventada. Las propuestas
 * y ajustes salen de los mismos lectores que `/api/mando/imaginacion`, así que la pastilla y el
 * panel no pueden discrepar.
 */
async function leerImaginacion(ambito: AmbitoPropuesta | "todos"): Promise<DatosMedidores["imaginacion"]> {
    try {
        const [{ propuestas, filtro_astraura }, ajustes] = await Promise.all([leerPropuestasConFiltro(), leerAjustes()]);
        return { propuestas, ajustes, ambito, filtro_astraura };
    } catch {
        return null;
    }
}

/** Correcciones pendientes de aplicar (`olas/progreso-correcciones.json`): solo estado y nota. */
async function leerCorrecciones(): Promise<Record<string, { estado?: string; nota?: string; t?: string }>> {
    try {
        const crudo = JSON.parse(
            await readFile(path.join(RAÍZ, "starseed_memory_root", "olas", "progreso-correcciones.json"), "utf8"),
        ) as Record<string, unknown>;
        const salida: Record<string, { estado?: string; nota?: string; t?: string }> = {};
        for (const [id, v] of Object.entries(crudo ?? {})) {
            if (!v || typeof v !== "object") continue;
            const e = v as { estado?: unknown; nota?: unknown; t?: unknown };
            salida[id] = {
                estado: typeof e.estado === "string" ? e.estado : undefined,
                nota: typeof e.nota === "string" ? e.nota.slice(0, 300) : undefined,
                t: typeof e.t === "string" ? e.t : undefined,
            };
        }
        return salida;
    } catch {
        return {};
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
                    correr("git", ["-C", dir, "status", "--short"], { timeout: 3_000, maxBuffer: 400_000 })
                        .then((r) => r.stdout)
                        .catch(() => ""),
                    correr("git", ["-C", dir, "branch", "--show-current"], { timeout: 3_000 })
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
    // freellmapi incluida. Que Genesis te pida arreglar algo que no figura en ninguna
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
 * Antigravity (`agy`): catálogo y uso que escribe `scripts/puente/antigravity_flota.py`
 * (GEM1119C) en `~/.starseed/`. Aquí solo se leen y se parsean; la decisión (cuota,
 * reserva del 20 %, estado y papeles) vive en el módulo puro `creditos-antigravity.ts`.
 * Si todavía no hay archivos, el resumen dice «sin medir aún» y nunca falla. No viaja
 * ningún dato de la cuenta de Google ni clave alguna.
 */
async function leerAntigravity(): Promise<ResumenAntigravity> {
    const carpeta = path.join(os.homedir(), ".starseed");
    const leer = async (nombre: string): Promise<unknown> => {
        try {
            return JSON.parse(await readFile(path.join(carpeta, nombre), "utf8")) as unknown;
        } catch {
            return null;
        }
    };
    const [modelos, uso] = await Promise.all([
        leer("antigravity-modelos.json"),
        leer("antigravity-uso.json"),
    ]);
    return resumirAntigravity(modelos, uso, Date.now());
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

/**
 * (2026-09-27) Lo que Alex declara de su crédito de Claude en la nube. Vive fuera del repo
 * (`~/.starseed/credito-claude-nube.json`, lo escribe `scripts/puente/credito_claude_nube.py declarar`):
 * es un dato de su cuenta, no del proyecto. Sin archivo, el medidor lo dice.
 */
async function leerCreditoClaude(): Promise<DatosMedidores["creditoClaude"]> {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "credito-claude-nube.json"), "utf8");
        const d = JSON.parse(crudo) as NonNullable<DatosMedidores["creditoClaude"]>;
        return d && typeof d === "object" && "restante_usd" in d ? d : null;
    } catch {
        return null;
    }
}

/**
 * (2026-10-04) Los LÍMITES DEL PLAN de Claude (sesión ~5 h, semanal y opcionalmente
 * modelo concreto) leídos desde `~/.starseed/limites-claude.json`. No hay API: la
 * dirección los toma manualmente desde claude.ai → Ajustes → Uso y los guarda con
 * `scripts/puente/limites_claude.py declarar …`.
 */
async function leerLimitesClaude(): Promise<unknown> {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "limites-claude.json"), "utf8");
        const d = JSON.parse(crudo) as unknown;
        return d && typeof d === "object" ? d : null;
    } catch {
        return null;
    }
}

/** (1103 · U) Preguntas y potenciados de «Buscar más capacidad» (`scripts/puente/potenciar_capacidad.py`). */
async function leerPotenciar(): Promise<DatosMedidores["potenciar"]> {
    try {
        const crudo = await readFile(path.join(RAÍZ, "starseed_memory_root", "mando", "potenciar.json"), "utf8");
        const d = JSON.parse(crudo) as NonNullable<DatosMedidores["potenciar"]>;
        return d && typeof d === "object" ? d : null;
    } catch {
        return null;
    }
}

/** (1103 · U) Los medios que se pueden potenciar (los mismos que `SERVICIOS` de potenciar_capacidad.py). */
const POTENCIABLES = ["claude-nube", "cloudroom", "nube-gh"];

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
 * (MAG1120) El disco libre de cada nodo, de `~/.starseed/capacidades-nodos.json`, que escribe
 * `scripts/puente/recopilar-capacidades-nodos.py`. Solo se lee: la petición del panel no sondea
 * la red. Si el archivo falta o está roto, `null` y el medidor dice «sin dato».
 */
async function leerAlmacenamientoNodos(): Promise<DatosMedidores["almacenamiento"]> {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "capacidades-nodos.json"), "utf8");
        const nodos = leerNodosAlmacenamiento(JSON.parse(crudo) as unknown);
        return nodos.length ? { nodos } : null;
    } catch {
        return null;
    }
}

/**
 * (MED1126A) La pastilla «Nodos y almacenamiento» del pulso pide esta clave sola. Se lee el
 * archivo como mucho una vez cada 60 s (no en cada render ni en cada sondeo) y sin esperar a la
 * reunión entera de los medidores, que con la Mac cargada tarda segundos.
 */
const ALMACENAMIENTO_CADA_MS = 60_000;
let cacheAlmacenamiento: { t: number; datos: DatosMedidores["almacenamiento"] } | null = null;
async function almacenamientoCacheado(): Promise<DatosMedidores["almacenamiento"]> {
    const ahora = Date.now();
    if (cacheAlmacenamiento && ahora - cacheAlmacenamiento.t < ALMACENAMIENTO_CADA_MS) return cacheAlmacenamiento.datos;
    const datos = await conTope(leerAlmacenamientoNodos(), 2_000, cacheAlmacenamiento?.datos ?? null);
    cacheAlmacenamiento = { t: ahora, datos };
    return datos;
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
async function leerAgentesDeLaNube(tareasPorRun: ReadonlyMap<string, string[]> = new Map()): Promise<AgenteDeLaNube[]> {
    try {
        const crudo = await readFile(
            path.join(RAÍZ, "starseed_memory_root", "mando", "agentes-nube.json"),
            "utf8",
        );
        const d = JSON.parse(crudo) as { runs?: RunDeLaNube[] };
        // (PDA1012) Las tareas de la tanda de cada run salen de `leerOlasDeLaNube`, que ya lee su
        // cola: leerla dos veces costaba ~10 s más por refresco con la Mac cargada.
        const runs: RunDeLaNube[] = (d.runs ?? []).map((r) => ({ ...r, tareas: tareasPorRun.get(String(r.run)) ?? [] }));
        return agentesDeRunsNube(runs);
    } catch {
        return [];
    }
}

/** (ALT1022C) Las sesiones de Claude Code en la nube vivas, del registro de su lanzador. */
async function leerSesionesClaudeNube(progreso: Record<string, { estado?: unknown; medio?: unknown }>) {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "alta-capacidad-nube.json"), "utf8");
        return agentesDeClaudeNube(JSON.parse(crudo) as { sesiones?: unknown }, progreso);
    } catch {
        return [];
    }
}

/** (2026-10-24) Los hilos de la nube de Cloudroom vivos, del registro de su lanzador (cloudroom_lanzar.py). */
async function leerHilosCloudroom(progreso: Record<string, { estado?: unknown; medio?: unknown }>) {
    try {
        const crudo = await readFile(path.join(os.homedir(), ".starseed", "cloudroom-hilos.json"), "utf8");
        return agentesDeCloudroom(JSON.parse(crudo), progreso);
    } catch {
        return [];
    }
}

/**
 * (2026-10-27, CAP1026O) Los trabajadores del A1 de Oracle: del estado que deja el ciclo del nodo
 * (`~/.starseed/oracle.json`, sin IPs ni claves) y las tareas de su cola (`enjambre/colas/<cola>`, la que
 * le mandó `oracle_nodo.py lanzar`). Sin red en la petición. Antes solo podían llegar por el bus de medios
 * de la Mac, donde el A1 no escribe: el medidor «Agentes» no contaba ninguno.
 */
async function leerAgentesDelA1() {
    try {
        const estado = JSON.parse(await readFile(path.join(os.homedir(), ".starseed", "oracle.json"), "utf8")) as unknown;
        const cola = colaDelA1(estado);
        let ids: string[] = [];
        // Solo un nombre de cola, nunca una ruta: el archivo lo escribe otro proceso.
        if (/^cola-[A-Za-z0-9._-]{1,120}\.json$/.test(cola)) {
            const ruta = path.join("enjambre", "colas", cola);
            try {
                ids = tareasDeCola(JSON.parse(await readFile(path.join(RAÍZ, ruta), "utf8")), ruta).map((t) => t.id);
            } catch {
                /* una cola de la bandeja de MetaGenesis no está aquí: se cuentan sus trabajadores sin tareas */
            }
        }
        return agentesDelA1(estado, ids);
    } catch {
        return [];
    }
}

/**
 * (2026-09-23) Las olas que la nube ejecuta ahora: los runs vivos de `agentes-nube.json` y,
 * de cada uno, la cola que se llevó. Esa cola vive en `enjambre/colas/`, fuera del
 * directorio que lee `leerColas`, y por eso Genesis no sabía ni el título de lo que
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
 * se llama varias veces por segundo al abrir Genesis.
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
    const inicio = Date.now();
    const tiempos: Record<string, number> = {};
    // Cada fuente se cronometra: si el total pasa de 5 s se dice cuál fue la lenta.
    const midiendo = <T>(fuente: string, p: Promise<T>): Promise<T> =>
        p.then((v) => {
            tiempos[fuente] = Date.now() - inicio;
            return v;
        }).catch((e) => {
            tiempos[fuente] = Date.now() - inicio;
            throw e;
        });
    // Oleada 1: todas las fuentes independientes en paralelo y con topes estrictos en las más caras.
    const [
        progreso,
        colas,
        bus,
        latidosMacTodos,
        vivo,
        commitsGit,
        escritores,
        pausado,
        indice,
        salida,
        commitsSinPublicarAstraura,
        asuntosDeMain,
        envios,
        contenedores,
        proveedores,
        tokens,
        olasNube,
        disco,
        almacenamiento,
        memoria,
        autopublicacion,
        enMarchaBase,
        correcciones,
        revisorBloqueadas,
        potenciar,
        creditoClaude,
        limitesClaude,
        antigravity,
        publicacion,
    ] = await Promise.all([
        midiendo("progreso", leerEntradas()),
        midiendo("colas", leerColas().catch(() => [])),
        midiendo("bus", leerLatidosDelBus().catch(() => ({ latidos: [], enjambres: [] }))),
        midiendo("latidos", leerLatidos().catch(() => [])),
        midiendo("enjambre", enjambreEnMarcha().catch(() => false)),
        midiendo("commitsOlas", leerCommitsDeOlas().catch(() => new Map())),
        midiendo("escritores", leerEscritores().catch(() => null)),
        readFile(path.join(RAÍZ, "starseed_memory_root", "mando", "director-config.json"), "utf8")
            .then((crudo) => Boolean((JSON.parse(crudo) as { pausado?: boolean }).pausado))
            .catch(() => false),
        readFile(path.join(RAÍZ, "starseed_memory_root", "colas-fuente", "indice.json"), "utf8")
            .then((crudo) => parsearIndice(JSON.parse(crudo)))
            .catch(() => null),
        midiendo("git", git(["log", "@{upstream}..HEAD", "--format=%H%x1f%s%x1f%cI"])),
        midiendo(
            "pendientesAstraura",
            conTope(
                leerPendientes("astraura").then((r) =>
                    r.commits.map((c) => ({ sha: c.sha, asunto: c.asunto, fecha: c.fecha })),
                ),
                3_000,
                [] as { sha: string; asunto: string; fecha?: string }[],
            ),
        ),
        midiendo(
            "asuntosMain",
            conTope(leerAsuntosDeMainCacheados(), 4_000, cacheAsuntosMain?.asuntos ?? ""),
        ),
        midiendo("enviosNube", enviosALaNube().catch(() => ({}) as Record<string, number>)),
        midiendo("contenedores", leerContenedores().catch(() => null)),
        midiendo("proveedores", leerProveedores().catch(() => [])),
        midiendo("tokens", leerTokens().catch(() => null)),
        midiendo("olasNube", leerOlasDeLaNube().catch(() => [])),
        midiendo("disco", conTope(medirDisco().then(discoParaMedidor), 3_000, undefined)),
        midiendo("almacenamiento", almacenamientoCacheado()),
        midiendo("memoria", conTope(medirMemoriaMedidor(), 3_000, undefined)),
        leerAutopublicacion().catch(() => null),
        midiendo("enMarcha", leerEnMarcha(null)),
        leerCorrecciones().catch(() => ({})),
        leerRevisorBloqueadas().catch(() => null),
        leerPotenciar().catch(() => null),
        leerCreditoClaude().catch(() => null),
        leerLimitesClaude().catch(() => null),
        midiendo("antigravity", leerAntigravity().catch(() => null)),
        leerDiario().catch(() => null),
    ]);

    const enMarcha: EnMarcha | null = enMarchaBase
        ? { ...enMarchaBase, publicacion: autopublicacion ? publicacionParaEnviar(autopublicacion) : null }
        : null;

    let titulos: Record<string, string> = {};
    for (const t of colas) titulos[t.id] = t.titulo;
    for (const l of latidosMacTodos) if (l.titulo && !titulos[l.tarea]) titulos[l.tarea] = l.titulo;
    if (indice) titulos = fundirTitulosArchivados(titulos, indice);

    // Commits que esta rama tiene y el remoto no.
    const commitsSinPublicar = salida
        .split("\n")
        .filter(Boolean)
        .map((l) => {
            const [sha, asunto, fecha] = l.split("");
            return { sha: sha ?? "", asunto: asunto ?? "", fecha: fecha ?? "" };
        });

    const ejecutables = ejecutablesDeColas(colas, progreso, asuntosDeMain);

    // Latidos: los de ESTA Mac mandan sobre los del bus para la misma tarea, y los de la
    // nube se añaden. Mirar solo el bus era lo que hacía que la cabecera dijera «1 agente»
    // y el panel, justo debajo, «ningún agente escribiendo» sobre la misma tarea: el
    // orquestador local escribe `olas/latidos-*.json` cada 20 s y solo publica en el bus
    // de vez en cuando, así que el bus siempre va por detrás o directamente vacío.
    // (2026-10-09) Un latido de una tarea que el progreso ya CERRÓ (falló, se integró, se
    // sustituyó…) es de una tanda vieja: CPA1007Kb salía tres veces con su tanda ya terminada.
    const CERRADA = /^(commit|hecho|fallo.*|sin_cambios|sustituida|rechazada|bloqueante|descartada|conflicto|interrumpida|pendiente_aprobacion)$/;
    // (2026-10-09) Y un latido que dice «escribiendo» sin ningún `opencode run`/`codex exec`
    // detrás es un fantasma: se quita AQUÍ para que Agentes, En curso, Ola en marcha y Tokens
    // cuenten lo mismo (la primera versión solo lo quitaba de Agentes: «En curso 3 · Agentes 2»).
    const escribe = (fase: string) =>
        !/^(tsc|tests?|testing|probando|revision|revisión|integrando|cableado|alcance|impacto|verificando|analizando|esperando.*|hecho)$/i.test(
            fase.trim(),
        );
    const fantasmas: string[] = [];
    const latidosMac = latidosMacTodos.filter((l) => {
        if (CERRADA.test(String(progreso[l.tarea]?.estado ?? ""))) return false;
        const fantasma =
            escritores !== null &&
            (l.donde || "mac") === "mac" &&
            !String(l.cola ?? "").startsWith("externo-") &&
            escribe(String(l.fase ?? "")) &&
            (l.quietoSegundos ?? 0) > 90 &&
            !escritores[l.tarea];
        if (fantasma) fantasmas.push(l.tarea);
        return !fantasma;
    });
    const deAqui = new Set(latidosMac.map((l) => l.tarea));
    // (PDA1012) Un latido del bus de OTRO medio (el A1 de Oracle) es OTRO agente aunque su tarea
    // también corra aquí: antes se tiraba si la Mac tenía la misma tarea y el A1 no salía nunca.
    // Solo se descarta el eco de esta misma Mac.
    const delBus = (l: { tarea: string; donde?: string }) => (l.donde || "mac") !== "mac" || !deAqui.has(l.tarea);
    const latidosCompletos = [...latidosMac, ...bus.latidos.filter(delBus)];
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
            .filter(delBus)
            .map((l) => ({
                tarea: l.tarea,
                fase: l.fase,
                modelo: l.modelo,
                minutos: l.minutos,
                donde: l.donde,
                proveedor: l.proveedor,
                quietoSegundos: l.quietoSegundos,
                bytesLog: l.bytesLog,
                cola: l.cola,
                medio: l.medio,
                latidoHaceS: l.latidoHaceS,
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
    // Oleada 2: solo las fuentes que dependen de la oleada 1, en paralelo.
    const mapaNube = new Map(olasNube.filter((o) => o.run).map((o) => [String(o.run), o.tareas.map((t) => t.id)] as const));
    const [obras, historiales, agentesNube, agentesA1, sesionesClaudeNube, hilosCloudroom] = await Promise.all([
        midiendo("obras", conTope(leerObras(idsVivas), 4_000, {})),
        midiendo("historiales", leerHistoriales(idsVivas).catch(() => ({}))),
        midiendo("agentesNube", leerAgentesDeLaNube(mapaNube).catch(() => [] as AgenteDeLaNube[])),
        latidosDeAqui.some((l) => l.donde === DONDE_ORACLE || /oracle/i.test(String(l.donde ?? "")))
            ? Promise.resolve([])
            : midiendo("agentesA1", leerAgentesDelA1().catch(() => [])),
        leerSesionesClaudeNube(progreso).catch(() => []),
        leerHilosCloudroom(progreso).catch(() => []),
    ]);

    const olasActivas = [...olasDeLaMac(colas, latidosDeAqui), ...olasNube];
    const descripciones: Record<string, string> = {};
    for (const t of colas) if (t.descripcion) descripciones[t.id] = t.descripcion;
    for (const ola of olasNube) {
        for (const t of ola.tareas) {
            if (!titulos[t.id] && t.titulo) titulos[t.id] = t.titulo;
            if (!descripciones[t.id] && t.descripcion) descripciones[t.id] = t.descripcion;
            if (!declarados[t.id] && t.archivos?.length) declarados[t.id] = t.archivos;
        }
        if (ola.run) {
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

    if (agentesA1[0] && !titulos[agentesA1[0].tarea]) {
        const n = agentesA1[0].tareasDeTanda.length;
        titulos[agentesA1[0].tarea] = `Cola ${agentesA1[0].cola} en el A1 de Oracle${n ? ` (${n} tarea${n === 1 ? "" : "s"})` : ""}`;
    }

    const agentesCarril = agentesDeCarrilClaude(enMarcha?.carril);
    for (const a of agentesCarril) if (!titulos[a.tarea]) titulos[a.tarea] = a.titulo;
    const agentesDireccion = agentesDeDireccion(enMarcha?.direccion);
    for (const a of agentesDireccion) titulos[a.tarea] = a.titulo;
    const idsDireccion = new Set(agentesDireccion.map((a) => a.tarea));
    const sinDobleDireccion = <T extends { tarea: string; cola?: string; donde?: string }>(l: T) =>
        !idsDireccion.has(l.tarea) || !(String(l.cola ?? "").startsWith("externo-") || l.donde === "carril-claude");

    const total = Date.now() - inicio;
    if (total > 5_000) {
        const lentas = Object.fromEntries(
            Object.entries(tiempos)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3),
        );
        console.warn("[medidores] reunir lenta", total, lentas);
    }

    return {
        progreso,
        titulos,
        latidos: [
            ...latidosDeAqui.filter(sinDobleDireccion),
            ...agentesNube,
            ...sesionesClaudeNube,
            ...agentesCarril.filter(sinDobleDireccion),
            ...agentesDireccion,
            ...hilosCloudroom,
            ...agentesA1,
        ],
        escritores,
        fantasmas,
        correcciones,
        revisorBloqueadas,
        contenedores,
        potenciar,
        disco,
        almacenamiento,
        memoria,
        creditoClaude,
        limitesClaude,
        antigravity,
        proveedores,
        tokens,
        commitsSinPublicar,
        commitsSinPublicarAstraura,
        publicacion,
        autopublicacion,
        enMarcha,
        ejecutables,
        enjambreVivo: vivo,
        enjambrePausado: pausado,
        fila,
        obras,
        historiales,
        declarados,
        olasActivas,
        descripciones,
        repoGitHub: "StarSeedSystem/starseed-system",
        asuntosDeMain,
        buscarCapacidad: await leerBuscarCapacidadEstado().catch(() => null),
    };
}

/**
 * (2026-10-04, medido en la Mac) Antes había UNA promesa compartida válida 4 s CONTADOS
 * DESDE QUE EMPEZABA: con `reunir()` tardando más de eso, cada tanda de diez peticiones
 * arrancaba otra reunión encima de la anterior hasta matar el proceso por memoria, y los
 * medidores salían en 0. Ahora el turno vive en `reunion-compartida` (puro y probado):
 * una sola reunión en marcha, resultado fresco 15 s, y espera con tope de 6 s tras la
 * cual se enseña la última cifra buena con `obsoleto` — nunca más un cero por impaciencia.
 */
// (2026-10-13, medido) Con la Mac en presión de memoria cada medidor tardaba 6-8 s (esperaba 6 s a la
// reunión nueva) y la página, con 15 medidores y 4 lecturas a la vez, tardaba 30-40 s en leer la
// ramificación; por el túnel, igual. Con una cifra anterior nadie espera más de 1,5 s; la cifra
// lleva su edad (`datosDe`) y solo se marca «obsoleta» pasados 90 s.
const CACHE_MEDIDORES = path.join(os.homedir(), ".starseed", "cache-medidores-genesis.json");
const CACHE_MEDIDORES_DISCO_CADA_MS = 30_000;
let ultimoGuardadoMedidoresMs = 0;

async function reunirYGuardar(): Promise<Partial<DatosMedidores>> {
    const datos = await reunir();
    const ahora = Date.now();
    if (ahora - ultimoGuardadoMedidoresMs >= CACHE_MEDIDORES_DISCO_CADA_MS) {
        ultimoGuardadoMedidoresMs = ahora;
        const tmp = `${CACHE_MEDIDORES}.tmp-${process.pid}`;
        void writeFile(tmp, JSON.stringify({ t: ahora, datos }))
            .then(() => rename(tmp, CACHE_MEDIDORES))
            .catch(() => {});
    }
    return datos;
}

const reunion = crearReunionCompartida(reunirYGuardar, { esperaMs: 1_500, obsoletoTrasMs: 90_000 });
const semillaMedidores = readFile(CACHE_MEDIDORES, "utf8")
    .then((crudo) => {
        const parsed = JSON.parse(crudo) as { t?: unknown; datos?: Partial<DatosMedidores> };
        const t = Number(parsed?.t ?? 0);
        if (parsed?.datos && typeof parsed.datos === "object" && Number.isFinite(t) && t > 0) {
            reunion.sembrar(parsed.datos, t);
        }
    })
    .catch(() => {});

const CLAVES_RAPIDAS = new Set<ClaveMedidor>([
    "imaginacion",
    "credito-claude",
    "creditos",
    "versiones",
    "pruebas",
    "almacenamiento", // MED1126A: solo lee capacidades-nodos.json (caché de 60 s)
]);

async function aplicarPuertaADatos(
    datosBase: Partial<DatosMedidores>,
    tLocal: number,
): Promise<{
    datos: Partial<DatosMedidores>;
    puerta: Awaited<ReturnType<typeof leerPuerta>>;
    usarPuerta: boolean;
}> {
    const datos: Partial<DatosMedidores> = { ...datosBase };
    const puerta = await leerPuerta().catch(() => null);
    const usarPuerta = puerta?.foto
        ? elegirFuente({
              faltaLocal: faltaLocal(datos),
              localMs: tLocal > 0 ? tLocal : 0,
              fotoMs: puerta.tFoto,
              ahora: Date.now(),
          }) === "puerta"
        : false;
    if (usarPuerta && puerta?.foto) {
        datos.enjambreVivo = puerta.foto.enjambreVivo;
        datos.enjambrePausado = puerta.foto.enjambrePausado;
        if (puerta.foto.enMarcha) datos.enMarcha = puerta.foto.enMarcha;
    }
    return { datos, puerta, usarPuerta };
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const url = new URL(peticion.url);

    // Lectura por lote (`?claves=listas,bloqueadas,...`): 1 reunión compartida y 1 respuesta JSON.
    const clavesParam = url.searchParams.get("claves");
    if (clavesParam !== null) {
        const claves = parsearClavesLote(clavesParam);
        if (claves.length === 0) {
            return Response.json(
                { error: "Sin claves válidas de medidor." },
                { status: 400, headers: { "Cache-Control": "no-store" } },
            );
        }
        let ambito: AmbitoPropuesta | "todos" = "metagenesis";
        if (claves.includes("imaginacion")) {
            const crudo = url.searchParams.get("ambito");
            const resuelto = crudo ? leerAmbito(crudo) : "metagenesis";
            if (resuelto === null) {
                return Response.json(
                    { error: "Ámbito desconocido: usa metagenesis, personal, grupo:<id> o pagina:<id>." },
                    { status: 400, headers: { "Cache-Control": "no-store" } },
                );
            }
            ambito = resuelto;
        }
        const necesitaReunion = claves.some((c) => !CLAVES_RAPIDAS.has(c));
        if (necesitaReunion) {
            await Promise.race([semillaMedidores, new Promise((r) => setTimeout(r, 800))]);
        }
        const [imaginacion, limitesClaude, creditosPago, lanzamientosEstado, turno, almacenamiento] = await Promise.all([
            claves.includes("imaginacion") ? leerImaginacion(ambito) : Promise.resolve(null),
            claves.includes("credito-claude") ? leerLimitesClaude().catch(() => null) : Promise.resolve(null),
            claves.includes("creditos") ? leerCreditosPago().catch(() => null) : Promise.resolve(null),
            claves.includes("versiones") ? leerLanzamientosEstado().catch(() => null) : Promise.resolve(null),
            necesitaReunion ? reunion.obtener() : Promise.resolve(null),
            claves.includes("almacenamiento") ? almacenamientoCacheado() : Promise.resolve(null),
        ]);
        const base = turno?.datos ?? {};
        const datosDe = turno && turno.t > 0 ? new Date(turno.t).toISOString() : null;
        const { datos, puerta, usarPuerta } = necesitaReunion
            ? await aplicarPuertaADatos(base, turno?.t ?? 0)
            : { datos: {} as Partial<DatosMedidores>, puerta: null, usarPuerta: false };
        if (claves.includes("integradas") && necesitaReunion) {
            const conocidas = new Set([...Object.keys(datos.progreso ?? {}), ...Object.keys(datos.titulos ?? {})]);
            datos.integradas =
                cacheIntegradas?.datos ?? {
                    total: contarIntegradasEnAsuntos(datos.asuntosDeMain ?? "", conocidas),
                    lista: [],
                };
        }
        const detalles: Partial<Record<ClaveMedidor, DetalleMedidor>> = {};
        for (const c of claves) {
            if (c === "imaginacion") detalles[c] = detalleDeMedidor(c, { imaginacion });
            else if (c === "credito-claude") detalles[c] = detalleDeMedidor(c, { limitesClaude });
            else if (c === "creditos") detalles[c] = detalleDeMedidor(c, { creditosPago });
            else if (c === "versiones") detalles[c] = detalleDeMedidor(c, { lanzamientosEstado });
            else if (c === "pruebas") detalles[c] = detalleDeMedidor(c, {});
            else if (c === "almacenamiento") detalles[c] = detalleDeMedidor(c, { almacenamiento });
            else detalles[c] = detalleDeMedidor(c, datos);
        }
        return Response.json(
            {
                detalles,
                antigravity: datos.antigravity ?? null,
                enMarcha: datos.enMarcha ?? null,
                generadoEn: new Date().toISOString(),
                datosDe,
                obsoleto: turno ? turno.obsoleto : false,
                puerta: resumenDePuerta(puerta, usarPuerta, Date.now()),
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    const clave = (url.searchParams.get("clave") ?? "ola-activa") as ClaveMedidor;
    if (clave === "imaginacion") {
        const crudo = url.searchParams.get("ambito");
        const ambito = crudo ? leerAmbito(crudo) : "metagenesis";
        if (ambito === null) {
            return Response.json(
                { error: "Ámbito desconocido: usa metagenesis, personal, grupo:<id> o pagina:<id>." },
                { status: 400, headers: { "Cache-Control": "no-store" } },
            );
        }
        const imaginacion = await leerImaginacion(ambito);
        return Response.json(
            { detalle: detalleDeMedidor(clave, { imaginacion }), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    if (clave === "credito-claude") {
        const limitesClaude = await leerLimitesClaude().catch(() => null);
        return Response.json(
            { detalle: detalleDeMedidor(clave, { limitesClaude }), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    if (clave === "creditos") {
        const creditosPago = await leerCreditosPago().catch(() => null);
        return Response.json(
            { detalle: detalleDeMedidor(clave, { creditosPago }), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    if (clave === "versiones") {
        const estado = await leerLanzamientosEstado().catch(() => null);
        return Response.json(
            { detalle: detalleDeMedidor(clave, { lanzamientosEstado: estado }), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    if (clave === "pruebas") {
        return Response.json(
            { detalle: detalleDeMedidor(clave, {}), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    // MED1126A: la pastilla «Nodos y almacenamiento» del pulso abre este medidor sin la reunión.
    if (clave === "almacenamiento") {
        const almacenamiento = await almacenamientoCacheado();
        return Response.json(
            { detalle: detalleDeMedidor(clave, { almacenamiento }), generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
    // GEM1119D: la ventana desplegable de la pastilla pide esta clave sola.
    if (clave === "antigravity") {
        const antigravity = await leerAntigravity();
        return Response.json(
            { detalle: detalleAntigravity(antigravity), antigravity, generadoEn: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    await Promise.race([semillaMedidores, new Promise((r) => setTimeout(r, 800))]);
    const turno = await reunion.obtener();
    const datosDe = turno.t > 0 ? new Date(turno.t).toISOString() : null;
    const { datos, puerta, usarPuerta } = await aplicarPuertaADatos(turno.datos ?? {}, turno.t);
    if (clave === "integradas") {
        const conocidas = new Set([...Object.keys(datos.progreso ?? {}), ...Object.keys(datos.titulos ?? {})]);
        datos.integradas = await leerIntegradas(conocidas).catch(() => null);
    }
    return Response.json(
        {
            detalle: detalleDeMedidor(clave, datos),
            enMarcha: datos.enMarcha ?? null,
            generadoEn: new Date().toISOString(),
            datosDe,
            obsoleto: turno.obsoleto,
            puerta: resumenDePuerta(puerta, usarPuerta, Date.now()),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

/**
 * (2026-10-05, BLQ1005B) Se acabó escribir `progreso.json` sin el cerrojo del
 * orquestador: antes esta ruta leía, modificaba y reescribía el archivo entero mientras el
 * orquestador hacía lo mismo a ciegas con su copia en memoria, y ganaba el último. Ahora el
 * cambio viaja como PARCHE y se aplica dentro del cerrojo fcntl
 * (`~/.starseed/cerrojos/progreso.lock`), el mismo que usa `/api/mando/reintentar`:
 * leer-modificar-escribir queda en una sola sección crítica.
 */
async function guardarParche(cambios: Record<string, Entrada>): Promise<void> {
    const programa = [
        "import fcntl,json,os,sys",
        "p,l,u=sys.argv[1:4]",
        "os.makedirs(os.path.dirname(l),exist_ok=True)",
        "f=open(l,'a+')",
        "fcntl.flock(f,fcntl.LOCK_EX)",
        "try:\n d=json.load(open(p)) if os.path.exists(p) else {}\nexcept Exception:\n d={}",
        "for i,e in json.loads(u).items():\n x=d.get(i) if isinstance(d.get(i),dict) else {}\n x.update(e)\n d[i]=x",
        "t=p+'.tmp-'+str(os.getpid());json.dump(d,open(t,'w'),ensure_ascii=False,indent=1);os.replace(t,p)",
        "fcntl.flock(f,fcntl.LOCK_UN);f.close()",
    ].join("\n");
    const cerrojo = path.join(os.homedir(), ".starseed", "cerrojos", "progreso.lock");
    await correr("python3", ["-c", programa, PROGRESO, cerrojo, JSON.stringify(cambios)], {
        cwd: RAÍZ,
        timeout: 15_000,
    });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: { clave?: string; accion?: string; id?: string; texto?: string; ids?: unknown; opcion?: unknown };
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
            const datosVivos = (await reunion.obtener()).datos ?? {};
            const late = (datosVivos.latidos ?? []).some((l) => l.tarea === id);
            const entradas = JSON.parse(await readFile(PROGRESO, "utf8").catch(() => "{}")) as Record<string, Entrada>;
            if (entradas[id]?.estado === "en_curso") {
                if (late) {
                    return Response.json({ error: `${id} tiene un agente trabajando ahora: no se reasigna.` }, { status: 409 });
                }
                entradas[id].estado = "pendiente";
                entradas[id].nota = `rancia (en curso sin agente): reasignada desde Genesis el ${new Date()
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}`;
                await guardarParche({ [id]: { estado: entradas[id].estado, nota: entradas[id].nota } });
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

    // (2026-10-05) «Buscar más capacidad en todos los medios»: Mac, nube y el resto, de una
    // vez. La decisión vive en `scripts/puente/buscar_capacidad.py` (pura y probada); los jobs
    // de la nube salen en segundo plano, así que esto contesta en segundos con el plan.
    // (1103 · U) Alex: «si ocurre eso cuando selecciono buscar más capacidades debe preguntarme si prefiero
    // potencializar las tareas aumentando el consumo de los créditos mensuales». La decisión la guarda
    // `scripts/puente/potenciar_capacidad.py`; al potenciar se lanza la búsqueda en segundo plano.
    if (accion === "potenciar-capacidad" || accion === "mantener-ritmo") {
        if (!POTENCIABLES.includes(id)) {
            return Response.json({ error: `«${id}» no es un medio que se pueda potenciar.` }, { status: 400 });
        }
        const orden = accion === "potenciar-capacidad" ? "activar" : "mantener";
        try {
            const { stdout } = await correr("python3", ["scripts/puente/potenciar_capacidad.py", orden, id, "--json"], {
                cwd: RAÍZ,
                timeout: 30_000,
                windowsHide: true,
            });
            const r = JSON.parse((stdout || "").trim().split("\n").pop() || "{}") as { resumen?: string };
            let resumen = r.resumen || "Hecho.";
            if (orden === "activar") {
                const hijo = spawn(
                    "python3",
                    ["scripts/puente/buscar_capacidad.py", "buscar", "--aplicar", "--json", "--origen", "boton"],
                    { cwd: RAÍZ, detached: true, stdio: "ignore" },
                );
                hijo.unref();
                resumen = `${resumen}\nBuscando capacidad…`;
            }
            return Response.json({ ok: true, resumen, en_curso: orden === "activar" });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude ${orden === "activar" ? "potenciar" : "mantener el ritmo de"} ${id}: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    if (accion === "buscar-capacidad") {
        try {
            const hijo = spawn(
                "python3",
                ["scripts/puente/buscar_capacidad.py", "buscar", "--aplicar", "--json", "--origen", "boton"],
                { cwd: RAÍZ, detached: true, stdio: "ignore" },
            );
            hijo.unref();
            return Response.json({
                ok: true,
                resumen: "Buscando capacidad…",
                en_curso: true,
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude lanzar la búsqueda de capacidad: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    // (2026-10-08) Alex: «para las bloqueadas agrega un botón de recomprobar todas con los
    // directores desde el medidor». La decisión vive en `scripts/puente/recomprobar_bloqueadas.py`
    // (pura y probada): ya en main → cerrada; fallo del medio → vuelve a la cola de la Mac; fallo
    // de la tarea u obsoleta según Jev → sigue, con su motivo. Va por las correcciones de siempre.
    if (accion === "recomprobar-bloqueadas") {
        try {
            const { stdout } = await correr("python3", ["scripts/puente/recomprobar_bloqueadas.py", "--json"], {
                cwd: RAÍZ,
                timeout: 180_000,
                windowsHide: true,
            });
            const r = JSON.parse((stdout || "").trim().split("\n").pop() || "{}") as {
                resumen?: string;
                integradas?: string[];
                reabiertas?: string[];
                siguen?: { id: string; motivo: string }[];
            };
            const siguen = (r.siguen ?? []).slice(0, 8).map((x) => `· ${x.id}: ${x.motivo}`);
            return Response.json({
                ok: true,
                resumen: [r.resumen || "Recomprobadas.", ...siguen].join("\n"),
                integradas: r.integradas ?? [],
                reabiertas: r.reabiertas ?? [],
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude recomprobar las bloqueadas: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    // (2026-10-10, OPB1011) «Necesitan a Alex»: UNA decisión por tarea, con su botón. Rehacer (vuelve
    // a transformarse con otro enfoque, contador a cero) o descartar (rechazada, rama conservada).
    if (accion === "decidir-bloqueada") {
        const opcion = cuerpo.opcion;
        if (!idDeTareaValido(id) || !esOpcionAlex(opcion)) {
            return Response.json({ error: "Falta la tarea o la opción (rehacer | descartar)." }, { status: 400 });
        }
        try {
            const { stdout } = await correr("python3", ["scripts/puente/revisor_bloqueadas.py", "decidir", id, opcion], {
                cwd: RAÍZ,
                timeout: 60_000,
                windowsHide: true,
            });
            const r = JSON.parse((stdout || "").trim().split("\n").pop() || "{}") as { ok?: boolean; error?: string };
            if (!r.ok) return Response.json({ error: r.error || "No se pudo aplicar la decisión." }, { status: 500 });
            return Response.json({
                ok: true,
                resumen:
                    opcion === "rehacer"
                        ? `${id} vuelve a la cola con otro enfoque: el revisor la vigila desde cero.`
                        : `${id} descartada por ti; su rama queda guardada.`,
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude aplicar tu decisión: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    // (2026-10-08) Alex: «al lado de Recomprobar todas con los directores pon uno para borrarlas,
    // antes revisa que no sean reaplicables». El mismo script recomprueba primero con los
    // directores y solo borra (estado «rechazada», rama conservada) lo que no se puede reaplicar.
    if (accion === "borrar-bloqueadas") {
        const ids = (Array.isArray(cuerpo.ids) ? cuerpo.ids : [])
            .filter((x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(x))
            .slice(0, 200);
        try {
            const args = ["scripts/puente/recomprobar_bloqueadas.py", "--borrar", "--json"];
            if (ids.length) args.push("--ids", ids.join(","));
            const { stdout } = await correr("python3", args, { cwd: RAÍZ, timeout: 180_000, windowsHide: true });
            const r = JSON.parse((stdout || "").trim().split("\n").pop() || "{}") as {
                resumen?: string;
                borradas?: { id: string; motivo: string }[];
                quedan?: { id: string; motivo: string }[];
            };
            const borradas = (r.borradas ?? []).slice(0, 8).map((x) => `− ${x.id}: ${x.motivo}`);
            const quedan = (r.quedan ?? []).slice(0, 8).map((x) => `· se queda ${x.id}: ${x.motivo}`);
            return Response.json({
                ok: true,
                resumen: [r.resumen || "Revisadas.", ...borradas, ...quedan].join("\n"),
                borradas: (r.borradas ?? []).map((x) => x.id),
                quedan: (r.quedan ?? []).map((x) => x.id),
            });
        } catch (e) {
            const msj = e instanceof Error ? e.message : String(e);
            return Response.json({ error: `No pude revisar ni borrar las bloqueadas: ${msj.slice(0, 300)}` }, { status: 500 });
        }
    }

    if (accion === "comprobar-agente") {
        const datosVivos = (await reunion.obtener()).datos ?? {};
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

    // El medidor usa la misma ruta que Ramificación: ahí viven la cadena de sucesores,
    // las fuentes del cambio, la rotación de modelo, la prioridad y el cerrojo.
    if (accion === "reintentar" || accion === "reintentar-auto" || accion === "escalar") {
        if (!id) {
            return Response.json({ error: "Falta la tarea a la que aplicarlo." }, { status: 400 });
        }
        const reparacion = await reintentarTareas(new Request(peticion.url.replace(/\/medidores(?:\?.*)?$/, "/reintentar"), {
            method: "POST",
            headers: peticion.headers,
            body: JSON.stringify({
                ids: [id],
                cambio: accion === "reintentar" ? texto : undefined,
                automatico: accion === "reintentar-auto",
                escalar: accion === "escalar",
            }),
        }));
        const resultado = await reparacion.json() as {
            error?: string;
            resultados?: Array<{ accion?: string; motivo?: string; sucesor?: string; texto?: string }>;
            reintentadas?: string[];
        };
        if (!reparacion.ok) return Response.json(resultado, { status: reparacion.status });
        const primero = resultado.resultados?.[0];
        return Response.json({
            ok: true,
            tareas: resultado.reintentadas?.length ? resultado.reintentadas : [id],
            accion: primero?.accion ?? "esperando",
            cambio: primero?.motivo,
            resultados: resultado.resultados ?? [],
        }, { headers: { "Cache-Control": "no-store" } });
    }

    const crudo = await readFile(PROGRESO, "utf8").catch(() => "{}");
    let entradas: Record<string, Entrada>;
    try {
        entradas = JSON.parse(crudo) as Record<string, Entrada>;
    } catch {
        return Response.json({ error: "progreso.json ilegible; no toco nada." }, { status: 500 });
    }

    const ahora = new Date().toISOString().slice(0, 16).replace("T", " ");
    // (2026-10-20) «Descartar todas» solo donde el medidor la ofrece: sin esta comprobación, un POST a
    // «en-cadena» descartaría de golpe todas las esperas normales de una cadena.
    const detalleTodas =
        accion === "descartar-todas" ? detalleDeMedidor(clave as ClaveMedidor, { progreso: entradas }) : null;
    if (detalleTodas && !detalleTodas.acciones.some((a) => a.clase === "descartar-todas")) {
        return Response.json(
            { error: `El medidor «${clave}» no ofrece «Descartar todas»: se descarta una a una.` },
            { status: 400 },
        );
    }
    const objetivo = detalleTodas ? detalleTodas.filas.map((f) => f.id) : id ? [id] : [];

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

    if (accion !== "descartar" && accion !== "descartar-todas") {
        return Response.json({ error: `Acción desconocida: ${accion}` }, { status: 400 });
    }

    // (2026-10-05, BLQ1005B) Se acabó el `continue` silencioso: una tarea sin entrada en
    // progreso pero presente en alguna cola se descarta igual (la entrada nueva la respeta
    // el vigilante: los estados no abiertos no se relanzan) y responde «en cola, posición
    // N»; una que no está en NINGÚN sitio responde que no existe, nunca un ok falso.
    const colas = await leerColas().catch(() => []);
    const posicionEnCola = (tareaId: string): number | null => {
        const tarea = colas.find((t) => t.id === tareaId);
        if (!tarea) return null;
        const pendientes = colas.filter(
            (t) => t.cola === tarea.cola && !TERMINALES.has(entradas[t.id]?.estado ?? ""),
        );
        const indice = pendientes.findIndex((t) => t.id === tareaId);
        return indice < 0 ? null : indice + 1;
    };

    const parche: Record<string, Entrada> = {};
    const resultados: { id: string; accion: string; texto: string }[] = [];
    const inexistentes: string[] = [];
    for (const t of objetivo) {
        const posicion = posicionEnCola(t);
        if (!entradas[t] && posicion === null) {
            inexistentes.push(t);
            continue;
        }
        parche[t] = {
            estado: "rechazada",
            nota: `descartada desde el medidor «${clave}» el ${ahora}`,
            reconciliado: ahora,
        };
        resultados.push({
            id: t,
            accion: "descartada",
            texto: entradas[t]
                ? `${t}: descartada`
                : `${t}: descartada — estaba en cola, posición ${posicion}, aún sin arrancar`,
        });
    }
    if (resultados.length === 0) {
        return Response.json(
            { error: `${inexistentes.join(", ")} no existe en el progreso ni en ninguna cola.` },
            { status: 404 },
        );
    }

    await guardarParche(parche);
    return Response.json(
        {
            ok: true,
            tareas: resultados.map((r) => r.id),
            accion,
            resultados,
            ...(inexistentes.length ? { aviso: `sin tocar, no existen en ningún sitio: ${inexistentes.join(", ")}` } : {}),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
