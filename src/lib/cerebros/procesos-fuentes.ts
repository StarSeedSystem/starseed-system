"use client";

/** Une las fuentes reales con los normalizadores puros. Contrato: §7 de cerebros-fusion-telepatia.md. */

import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { leerHistorial } from "@/lib/genesis/historial";
import { misEntidades, propuestasDe } from "@/lib/genesis/entidades";
import { fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus } from "@/lib/astraura/astraura-158-client";
import { listRuns } from "@/lib/aurora/imagine";
import { leerInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { readDesktopsSnapshot } from "@/components/desktop/desktop-store";
import { presenciaActual } from "@/lib/neurons/presencia";
import { listNeurons } from "@/lib/neurons/neurons";
import { hardwareDesdeMac, hardwareDesdeNeurona, hardwareDesdeNodo, type HardwareServidor, type ProcesoActivo } from "./procesos";
import {
    desdeActualizaciones, desdeAgentesMac, desdeImaginacion, desdeInstalaciones, desdeLatidos,
    desdeNodos, desdePoligenesis, desdePresencia, desdeSuenos, desdeVentanas, unirProcesos,
} from "./procesos-normalizar";

/** Lo que devuelve leerProcesos: el contrato de §7 (la lista ES `procesos`). */
export interface ResultadoProcesos extends Array<ProcesoActivo> {
    procesos: ProcesoActivo[];
    hardware: HardwareServidor[];
    fuentes: FuenteProcesos[];
}

const PLAZO_MS = 4000;
const N_AGENTES = "/api/mando/agentes", N_MEDIDORES = "/api/mando/medidores";
const N_SUENOS = "/api/mando/suenos", N_HARDWARE = "/api/mando/hardware";
const N_NODOS = "leerEstadoAutonomo()", N_POLIGENESIS = "leerHistorial()";
const N_DREAM = "fetchAstraura158DreamStatus()", N_IMAGINACION = "fetchAstraura158ImaginationStatus()";
const N_RUNS = "listRuns()", N_INSTALACIONES = "leerInstalaciones()";
const N_VENTANAS = "readDesktopsSnapshot()", N_NEURONAS = "listNeurons()";

/** Cómo fue una fuente: su tiempo es una medida real, nunca un 0 inventado. */
export interface FuenteProcesos {
    nombre: string;
    ok: boolean;
    ms: number;
    motivo?: string;
}

/** Lo que ya se leyó de cada fuente, sin interpretar; las funciones puras lo normalizan. */
export interface FuentesProcesos {
    agentes?: unknown;
    medidores?: unknown;
    nodos?: unknown;
    poligenesis?: unknown;
    suenos?: unknown;
    suenosAstraura?: unknown;
    imaginacion?: unknown;
    instalaciones?: unknown;
    actualizaciones?: unknown;
    ventanas?: unknown;
    presencia?: unknown;
}

/** Compone todas las fuentes ya leídas. Puro: aquí no hay red ni disco. */
export function componerProcesos(f: FuentesProcesos): ProcesoActivo[] {
    return unirProcesos(
        desdeAgentesMac(f.agentes), desdeLatidos(f.medidores), desdeNodos(f.nodos),
        desdePoligenesis(f.poligenesis), desdeSuenos(f.suenos), desdeSuenos(f.suenosAstraura),
        desdeImaginacion(f.imaginacion), desdeInstalaciones(f.instalaciones),
        desdeActualizaciones(f.actualizaciones), desdeVentanas(f.ventanas), desdePresencia(f.presencia),
    );
}

/** Hardware de la Mac, los nodos de MetaGenesis y las neuronas, a partir de lo ya leído. Puro. */
export function hardwareDeLecturas(mac: unknown, estado: unknown, neuronas: unknown, ahora: number): HardwareServidor[] {
    const salida: HardwareServidor[] = [];
    const hMac = mac === null ? null : hardwareDesdeMac(mac, ahora);
    if (hMac) salida.push(hMac);
    const o = reg(estado);
    if (o && o.ok !== false) {
        const estadoNodos = reg(o.estado) ?? o;
        for (const n of lista(estadoNodos.nodos)) {
            const h = hardwareDesdeNodo(n, ahora);
            if (h) salida.push(h);
        }
    }
    for (const n of lista(neuronas)) {
        const h = hardwareDesdeNeurona(n, ahora);
        if (h) salida.push(h);
    }
    return salida;
}

const reg = (v: unknown): Record<string, unknown> | null =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

type Carrera = { tope: true } | { tope: false; dato: unknown };

/** Con tope y medida: una fuente colgada no tumba a las demás y su tiempo es real. */
async function medir(nombre: string, leer: () => Promise<unknown>, plazo: number): Promise<{ fuente: FuenteProcesos; dato: unknown }> {
    const t0 = performance.now();
    const fallida = (motivo: string): { fuente: FuenteProcesos; dato: unknown } =>
        ({ fuente: { nombre, ok: false, ms: Math.max(1, Math.round(performance.now() - t0)), motivo }, dato: null });
    try {
        const colgada = new Promise<Carrera>((res) => { setTimeout(() => res({ tope: true }), plazo); });
        const r = await Promise.race([colgada, leer().then((dato): Carrera => ({ tope: false, dato }))]);
        if (r.tope) return fallida(plazo === PLAZO_MS ? "colgada: tope de 4 s" : "colgada");
        if (r.dato === null) return fallida("no disponible aquí");
        return { fuente: { nombre, ok: true, ms: Math.max(1, Math.round(performance.now() - t0)) }, dato: r.dato };
    } catch (e) {
        return fallida(`error: ${e instanceof Error ? e.message : "desconocido"}`);
    }
}

/** Una llamada con su señal de corte; 401/403/404 es «no disponible aquí», no un fallo. */
async function traerJson(url: string, plazo: number): Promise<unknown> {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(plazo) }).catch(() => null);
    if (!r) return null;
    if (r.ok) return await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403 || r.status === 404) return null;
    throw new Error(`HTTP ${r.status}`);
}

async function leerPoligenesis(): Promise<unknown> {
    const [historial, entidades] = await Promise.all([
        leerHistorial({ tipo: "persona" }).catch(() => null), misEntidades().catch(() => null),
    ]);
    const propuestas: unknown[] = [];
    if (entidades?.ok) {
        const resultados = await Promise.all(entidades.lista.slice(0, 12).map((e) => propuestasDe(e).catch(() => null)));
        for (const r of resultados) if (r?.ok) propuestas.push(...r.lista);
    }
    return { entradas: historial?.entradas ?? [], propuestas };
}

/** El estado de MetaGenesis ya sin fallos: null si no se pudo leer. */
async function leerNodos(): Promise<unknown> {
    try { const r = await leerEstadoAutonomo(); return r.ok ? r : null; } catch { return null; }
}

/** Lecturas del almacenamiento local (stores del cliente): null sin almacenamiento. */
function delAlmacenamiento(leer: () => unknown): () => Promise<unknown> {
    return async () => { try { return leer(); } catch { return null; } };
}

export interface OpcionesProcesos {
    /** `/api/mando/*` solo responde en la Mac o con sesión de MetaGenesis; en falso se salta. */
    incluirMac?: boolean;
    /** Atrasos del hook `useEstadoActualizaciones` (los pasa el panel). */
    atrasos?: unknown;
    /** Presencia de neuronas del hook `usePresenciaNeuronas` (la pasa el panel). */
    presencia?: unknown;
    /** Tope por fuente en ms; solo las pruebas lo acortan. */
    plazoMs?: number;
}

/** Lee todas las fuentes en paralelo con tope de 4 s: la que falla se anota en `fuentes`. */
export async function leerProcesos(opciones: OpcionesProcesos = {}): Promise<ResultadoProcesos> {
    const plazo = opciones.plazoMs ?? PLAZO_MS;
    const incluirMac = opciones.incluirMac !== false;
    const ahora = Date.now();
    const tareas: Array<[string, () => Promise<unknown>]> = [];
    if (incluirMac) for (const n of [N_AGENTES, N_MEDIDORES, N_SUENOS, N_HARDWARE]) tareas.push([n, () => traerJson(n, plazo)]);
    tareas.push(
        [N_NODOS, leerNodos],
        [N_POLIGENESIS, leerPoligenesis],
        [N_DREAM, () => fetchAstraura158DreamStatus("local").then((r) => (r.ok ? r : null))],
        [N_IMAGINACION, () => fetchAstraura158ImaginationStatus("local").then((r) => (r.ok ? r : null))],
        [N_RUNS, async () => await listRuns().catch(() => null)],
        [N_INSTALACIONES, delAlmacenamiento(leerInstalaciones)],
        [N_VENTANAS, delAlmacenamiento(readDesktopsSnapshot)],
        [N_NEURONAS, async () => await listNeurons().catch(() => null)],
    );
    const mediciones = await Promise.all(tareas.map(([nombre, leer]) => medir(nombre, leer, plazo)));
    const de = (nombre: string): unknown => mediciones.find((m) => m.fuente.nombre === nombre)?.dato ?? null;
    const imagen = reg(de(N_IMAGINACION));
    const procesos = componerProcesos({
        agentes: de(N_AGENTES), medidores: de(N_MEDIDORES), nodos: de(N_NODOS),
        poligenesis: de(N_POLIGENESIS), suenos: de(N_SUENOS), suenosAstraura: de(N_DREAM),
        imaginacion: { ...(imagen?.ok === true && imagen.data !== undefined ? { data: imagen.data } : {}), runs: lista(de(N_RUNS)) },
        instalaciones: de(N_INSTALACIONES) ?? [],
        ventanas: de(N_VENTANAS),
        actualizaciones: { atrasos: opciones.atrasos },
        presencia: opciones.presencia ?? presenciaActual(),
    });
    const hardware = hardwareDeLecturas(de(N_HARDWARE), de(N_NODOS), de(N_NEURONAS), ahora);
    const resultado = procesos as ResultadoProcesos;
    resultado.procesos = procesos;
    resultado.hardware = hardware;
    resultado.fuentes = mediciones.map((m) => m.fuente);
    return resultado;
}
