/**
 * GET /api/mando/estado (Ola 231 · Genesis)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de mando en `localhost`: muestra en vivo el estado del desarrollo y
 * la orquestación multiagéntica leyendo archivos reales de la máquina.
 *
 * ⚠️ Seguridad (innegociable):
 *  • Rutas `/api/mando/*` SOLO funcionan en local: si no estamos en desarrollo
 *    ni `STARSEED_MANDO=1`, responden 404 sin mayor información.
 *  • Exigen sesión como el resto de rutas privadas.
 *  • NUNCA devuelven claves, tokens ni rutas absolutas del disco del usuario:
 *    todo se recorta a rutas relativas al repositorio y a resúmenes seguros.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CuentasTareas, EstadoMando, EventoRelevo, RepoInfo } from "@/lib/mando/tipos";
import { guardianMando } from "@/lib/mando/guardian";
import { ramificacionCompartida } from "@/lib/mando/ramificacion-compartida";
import { compartirCalculo } from "@/lib/mando/calculo-compartido";
import { quiereEstadoCompleto, textoEstado } from "@/lib/mando/estado-ligero";
import {
    leerColas,
    colaInteligente,
    enjambreEnMarcha,
    leerEstadoRelevo,
    leerLatidos,
    leerLatidosDelBus,
    leerEventosDelBus,
    leerProgreso,
    medirAgentes,
    leerInformes,
    leerRevisiones,
    leerUsoDiario,
    resumirOlas,
    leerVeredictos,
    leerAsuntosDeMain,
    leerCommitsDeOlas,
} from "@/lib/mando/lector-local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

/** Ejecuta un comando git de la lista fija y devuelve su stdout recortado. */
async function git(cmd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, {
            cwd: process.cwd(),
            timeout: 5000,
            windowsHide: true,
        });
        return stdout.trim();
    } catch {
        return "";
    }
}

/** Lee el resumen del estado git del repositorio. */
async function leerRepo(): Promise<RepoInfo> {
    const [rama, head, log] = await Promise.all([
        git("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
        git("git", ["rev-parse", "--short", "HEAD"]),
        git("git", ["log", "--oneline", "-10"]),
    ]);

    // Sin push (commits locales no publicados) y sin commit (cambios sin commitear).
    let sinPush: number | null = null;
    try {
        const { stdout } = await execFileAsync(
            "git",
            ["rev-list", "--count", "@{upstream}..HEAD"],
            { cwd: process.cwd(), timeout: 5000, windowsHide: true },
        );
        const n = Number.parseInt(stdout.trim(), 10);
        sinPush = Number.isFinite(n) ? n : null;
    } catch {
        sinPush = null;
    }

    let sinCommit: number | null = null;
    const porcelain = await git("git", ["status", "--porcelain"]);
    if (porcelain) sinCommit = porcelain.split("\n").filter((l) => l.trim()).length;

    return {
        rama: rama || null,
        head: head || null,
        sinPush,
        sinCommit,
        log: log ? log.split("\n").filter((l) => l.trim()) : [],
    };
}

export async function GET(request: Request): Promise<Response> {
    // La puerta completa vive en el guardián (Ola 253 · 2026-09-06): 404 fuera de
    // local; sesión solo en producción desplegada; en un despliegue LOCAL (modo
    // ligero en la neurona) pasa sin sesión, igual que las rutas de voz. Antes la
    // puerta estaba duplicada aquí y pedía sesión en `next start` local, dejando
    // la consola inservible justo en la máquina donde tiene que usarse.
    const veto = await guardianMando(request);
    if (veto) return veto;

    await Promise.race([semilla, new Promise((r) => setTimeout(r, 1_500))]);
    const estado = await estadoCompartido();
    // (2026-10-13) Ligero por defecto: 3,1 MB por sondeo eran sobre todo informes y descripciones
    // que solo enseña el panel de olas, que pide `?completo=1` (`estado-ligero.ts`).
    return new Response(textoEstado(estado, quiereEstadoCompleto(request.url)), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
}

/**
 * (2026-10-12) UN cálculo a la vez y reutilizado 8 s, sea quien sea quien pregunte (la página de
 * Genesis, la de MetaGenesis, cada aparato por el túnel): con la Mac en presión de memoria cada
 * cálculo tardaba 5-25 s y repetirlo por petición hacía más lentas a todas. La puerta (guardián)
 * se sigue pasando en CADA petición, antes de llegar aquí.
 */
const VIGENCIA_ESTADO_MS = 8_000;
/**
 * (2026-10-13, medido) Con la Mac sin memoria un cálculo pasaba de 50 s y MetaGenesis se quedaba
 * en «Midiendo el pulso del trabajo…». Con un estado anterior, nadie espera más de 6 s: se le da
 * el anterior (con su `generadoEn`, que dice de cuándo es) y el cálculo sigue. El último estado
 * bueno se guarda en disco para que un reinicio de Genesis no empiece en blanco.
 */
const ESPERA_ESTADO_MS = 6_000;
const CACHE_ESTADO = path.join(os.homedir(), ".starseed", "cache-estado-genesis.json");
const estadoCompartido = compartirCalculo(calcularYGuardar, VIGENCIA_ESTADO_MS, undefined, ESPERA_ESTADO_MS);
// (2026-10-13, medido) La primera petición tras reiniciar Genesis llegaba antes de que se leyera la
// caché del disco y esperaba el cálculo entero (27 s): la ruta espera la semilla, como mucho 1,5 s.
const semilla = readFile(CACHE_ESTADO, "utf8")
    .then((crudo) => {
        const d = JSON.parse(crudo) as EstadoMando;
        const t = Date.parse(String(d?.generadoEn ?? ""));
        if (d && typeof d === "object" && Number.isFinite(t)) estadoCompartido.sembrar(d, t);
    })
    .catch(() => {});

async function calcularYGuardar(): Promise<EstadoMando> {
    const estado = await calcularEstado();
    void writeFile(CACHE_ESTADO + ".tmp", JSON.stringify(estado))
        .then(() => rename(CACHE_ESTADO + ".tmp", CACHE_ESTADO))
        .catch(() => {});
    return estado;
}

async function calcularEstado(): Promise<EstadoMando> {
    const [relevo, tareas, informes, uso, revisiones, repo, progreso, latidosMac, enMarcha, agentes, bus, eventosBus, rama, commitsGit, asuntosDeMain, veredictos] =
        await Promise.all([
            leerEstadoRelevo(),
            leerColas(),
            leerInformes(),
            leerUsoDiario(),
            leerRevisiones(),
            leerRepo(),
            leerProgreso(),
            leerLatidos(),
            enjambreEnMarcha(),
            medirAgentes(),
            leerLatidosDelBus(),
            leerEventosDelBus(20),
            ramificacionCompartida(4).catch(() => null),
            leerCommitsDeOlas(),
            leerAsuntosDeMain(),
            leerVeredictos(),
        ]);
    // Recuento de tareas para la cabecera: la ola activa (la viva o la más reciente) y las últimas olas.
    let cuentas: CuentasTareas | undefined;
    if (rama && rama.olas.length > 0) {
        const activa = rama.olas[0];
        const suma = (k: "hechas" | "enCurso" | "fallidas" | "sinCambios" | "pendientes" | "esperandoAprobacion") => rama.olas.reduce((acc, o) => acc + o[k], 0);
        cuentas = {
            ola: activa.id,
            integradas: activa.hechas,
            enCurso: activa.enCurso,
            fallidas: activa.fallidas,
            sinCambios: activa.sinCambios,
            pendientes: activa.pendientes,
            esperandoAprobacion: activa.esperandoAprobacion,
            ultimas: { olas: rama.olas.length, integradas: suma("hechas"), enCurso: suma("enCurso"), fallidas: suma("fallidas"), sinCambios: suma("sinCambios"), pendientes: suma("pendientes"), esperandoAprobacion: suma("esperandoAprobacion") },
        };
    }
    // «Últimos eventos»: primero lo que acaba de pasar en el bus (Mac + nube), después la bitácora local.
    // (2026-10-13, medido) La bitácora va de vieja a nueva y solo crece: sin bus viajaba ENTERA
    // (1.637 eventos, 433 KB en cada sondeo) y, con bus, se le añadían las MÁS VIEJAS. Ahora, las 40
    // más nuevas, las más nuevas primero (como el bus).
    const locales = relevo.eventos.slice(-40).reverse();
    if (eventosBus.length > 0) {
        const vistos = new Set(eventosBus.map((e) => e.id));
        relevo.eventos = [...eventosBus, ...locales.filter((e) => !vistos.has(e.id))].slice(0, 40);
    } else {
        relevo.eventos = locales;
    }
    // Lo local manda sobre lo que diga el bus de la misma tarea; la nube se añade.
    const idsMac = new Set(latidosMac.map((l) => `${l.cola}|${l.tarea}`));
    const latidos = [...latidosMac, ...bus.latidos.filter((l) => l.donde !== "mac" || !idsMac.has(`${l.cola}|${l.tarea}`))];

    // Órdenes para la nube que nadie recogió: cada `lanzar`/`detener`/`control` con datos.donde
    // «nube» debe tener después un `lanzada`/`detenida`/`controlada` (o `lanzar_rechazado`) de
    // la misma cola; si pasan 90 s sin respuesta, el lanzador del contenedor está muerto.
    const ordenesSinAtender = ordenesNubeSinRespuesta(eventosBus);

    const estado: EstadoMando = {
        ordenesSinAtender,
        cuentas,
        generadoEn: new Date().toISOString(),
        mandoActivo: true,
        relevo,
        olas: resumirOlas(tareas, progreso, commitsGit, asuntosDeMain, latidos),
        tareas,
        latidos,
        enjambreEnMarcha: enMarcha,
        agentes,
        enjambres: bus.enjambres,
        fila: colaInteligente(tareas, progreso, latidos, commitsGit, asuntosDeMain),
        informes,
        uso,
        revisiones,
        repo,
        veredictos: veredictos.veredictos,
    };
    return estado;
}
/** Órdenes firmadas para la nube publicadas hace >90 s sin evento de respuesta posterior de su cola. */
function ordenesNubeSinRespuesta(eventos: EventoRelevo[]): EstadoMando["ordenesSinAtender"] {
    const ORDENES = new Set(["lanzar", "detener", "control"]);
    const RESPUESTAS = new Set(["lanzada", "detenida", "controlada", "lanzar_rechazado", "arranque", "aprobacion", "reasignado", "rechazada"]);
    const objeto = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
    const colaDe = (e: EventoRelevo): string => String(objeto(e.datos).cola ?? "").replace(/\.json$/, "");
    const ahora = Date.now();
    const salida: NonNullable<EstadoMando["ordenesSinAtender"]> = [];
    for (const e of eventos) {
        if (!ORDENES.has(e.tipo) || String(objeto(e.datos).donde ?? "") !== "nube") continue;
        const t = Date.parse(e.t);
        if (!Number.isFinite(t) || ahora - t < 90_000 || ahora - t > 15 * 60_000) continue;
        const cola = colaDe(e);
        const atendida = eventos.some((r) => RESPUESTAS.has(r.tipo) && Date.parse(r.t) >= t && (colaDe(r) === cola || (r.tarea && r.tarea === e.tarea)));
        if (!atendida) salida.push({ id: e.id, t: e.t, tipo: e.tipo, tarea: e.tarea, texto: e.texto });
    }
    return salida;
}
