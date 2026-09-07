/**
 * Lectura del «aprendizaje continuo» de Astraura 1.58 para el Mando (Ola 270 · 2026-09-07)
 * ───────────────────────────────────────────────────────────────────────────────────────
 * El backend 1.58 aprende sola: un corpus JSONL por personalidad
 * (`data/aprendizaje/corpus/`), una curación, evaluaciones con puerta de regresión,
 * una crónica en prosa y una «fábrica» de adaptadores LoRA GGUF. Este módulo junta
 * todo eso para la pestaña «Aprendizaje» del Centro de Mando.
 *
 *   - El corpus, la curación, las evaluaciones, la crónica y la fábrica se leen del
 *     DISCO del repo astraura (`ASTRAURA_158_DIR` o `~/Documents/IA 1.58 bit`), con
 *     `fs` tolerante y `os.homedir()`, nunca rutas absolutas literales.
 *   - El estado del corpus también puede venir del backend por HTTP, pero el panel
 *     prefiere el disco: los archivos son la fuente con más detalle (train/val/bytes).
 *   - Los adaptadores salen de `starseed_memory_root/aprendizaje/adaptadores.json`.
 *
 * Tolerancia total: cualquier archivo que falte o esté corrupto queda en `null` o
 * en arrays vacíos — `leerAprendizaje()` nunca lanza. Nunca se devuelven rutas
 * absolutas ni claves: solo nombres de variables de entorno.
 */

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

/** Turno individual del corpus con su partición y valoraciones acumuladas. */
export interface TurnoCorpus {
    id: string;
    role: string;
    train: boolean;
    val: boolean;
    valoraciones: number;
}

/** Resumen del corpus de una personalidad (turnos, partición y valoración). */
export interface CorpusPersonalidadAprendizaje {
    nombre: string;
    turnos: number;
    train: number;
    val: number;
    sinValorar: number;
}

/** Métricas de curación del corpus (duplicados, pendientes, listos). */
export interface CuracionAprendizaje {
    duplicados: number;
    sinValorar: number;
    listos: number;
}

/** Una evaluación reciente de la puerta de regresión. */
export interface EvaluacionAprendizaje {
    t: string;
    puntuacion: number;
    tono: string;
}

/** Detalle de la fábrica de adaptadores LoRA (instalada o no). */
export interface FabricaAprendizaje {
    instalada: boolean;
    detalle: string;
}

/** Un adaptador LoRA registrado en el memory root. */
export interface AdaptadorAprendizaje {
    id: string;
    personalidad: string;
    fecha: string;
}

/** Foto completa de la pestaña «Aprendizaje». */
export interface Aprendizaje158 {
    /** ISO de cuándo se tomó esta foto. */
    t: string;
    corpus: CorpusPersonalidadAprendizaje[];
    totalBytes: number;
    curacion: CuracionAprendizaje | null;
    evaluaciones: EvaluacionAprendizaje[];
    cronica: string;
    fabrica: FabricaAprendizaje | null;
    adaptadores: AdaptadorAprendizaje[];
    backend: "vivo" | "apagado";
}

// ── Resolución del repo astraura en disco (solo servidor) ────────────────────

/**
 * Directorio del repo Astraura 1.58 en esta máquina: `ASTRAURA_158_DIR` si está
 * definida; si no, `~/Documents/IA 1.58 bit`. Nunca una ruta literal del usuario:
 * se compone con `os.homedir()`.
 */
function dirAstraura(): string {
    const env = String(process.env.ASTRAURA_158_DIR ?? "").trim();
    return env.length > 0 ? env : path.join(os.homedir(), "Documents", "IA 1.58 bit");
}

/**
 * URL base del backend 1.58 (para reenviar valoraciones y exportaciones). Solo
 * servidor; sin ella, el backend local `http://127.0.0.1:8000`.
 */
function baseBackendAprendizaje(): string {
    const env = String(process.env.ASTRAURA_158_URL ?? "").trim().replace(/\/+$/, "");
    return env || "http://127.0.0.1:8000";
}

/**
 * Lee un archivo de texto del repo astraura de forma tolerante: `null` si no
 * existe, no se puede leer o no es texto válido. Nunca lanza.
 */
async function leerArchivo(dir: string, relativa: string): Promise<string | null> {
    try {
        const contenido = await readFile(path.join(dir, relativa), "utf-8");
        return contenido;
    } catch {
        return null;
    }
}

/** Lee JSON tolerante de `ruta` y lo devuelve como objeto, o `null`. */
async function leerJson<R = unknown>(dir: string, relativa: string): Promise<R | null> {
    const texto = await leerArchivo(dir, relativa);
    if (texto === null) return null;
    try {
        const d = JSON.parse(texto) as unknown;
        return d as R;
    } catch {
        return null;
    }
}

// ── Lectores de cada pieza (tolerantes) ──────────────────────────────────────

/** Número entero tolerante: `0` si no es un número finito. */
function numeroCero(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Lee el estado del corpus (`data/aprendizaje/corpus/estado.json` en el repo
 * astraura). Devuelve el array de personalidades del corpus y los bytes totales.
 * Si el archivo no existe, array vacío y cero bytes.
 */
async function leerCorpusDisco(dir: string): Promise<{ corpora: CorpusPersonalidadAprendizaje[]; totalBytes: number }> {
    const crudo = await leerJson<unknown>(dir, path.join("data", "aprendizaje", "corpus", "estado.json"));
    if (typeof crudo !== "object" || crudo === null) return { corpora: [], totalBytes: 0 };
    const c = crudo as Record<string, unknown>;
    const fuente = typeof c.personalidades === "object" && c.personalidades !== null
        ? (c.personalidades as Record<string, unknown>)
        : {};
    const corpora: CorpusPersonalidadAprendizaje[] = [];
    for (const [nombre, datos] of Object.entries(fuente)) {
        const d = typeof datos === "object" && datos !== null ? (datos as Record<string, unknown>) : {};
        const turnos = numeroCero(d.turnos);
        const train = numeroCero(d.train);
        const val = numeroCero(d.val);
        corpora.push({
            nombre,
            turnos,
            train,
            val,
            sinValorar: numeroCero(d.sin_valorar ?? d.sinValorar),
        });
    }
    return { corpora, totalBytes: numeroCero(c.bytes) };
}

/** Lee la curación (`data/aprendizaje/curacion.json`) o `null`. */
async function leerCuracion(dir: string): Promise<CuracionAprendizaje | null> {
    const crudo = await leerJson<unknown>(dir, path.join("data", "aprendizaje", "curacion.json"));
    if (typeof crudo !== "object" || crudo === null) return null;
    const c = crudo as Record<string, unknown>;
    return {
        duplicados: numeroCero(c.duplicados),
        sinValorar: numeroCero(c.sin_valorar ?? c.sinValorar),
        listos: numeroCero(c.listos),
    };
}

/**
 * Lee las últimas 20 evaluaciones de `data/aprendizaje/evaluaciones.jsonl`
 * (un JSON por línea, en orden; se devuelven las más recientes al final).
 */
async function leerEvaluaciones(dir: string): Promise<EvaluacionAprendizaje[]> {
    const texto = await leerArchivo(dir, path.join("data", "aprendizaje", "evaluaciones.jsonl"));
    if (texto === null) return [];
    const lineas = texto.split("\n").filter((l) => l.trim().length > 0);
    const evaluadas: EvaluacionAprendizaje[] = [];
    for (const linea of lineas.slice(-20)) {
        try {
            const d = JSON.parse(linea) as unknown;
            if (typeof d !== "object" || d === null) continue;
            const o = d as Record<string, unknown>;
            evaluadas.push({
                t: typeof o.t === "string" ? o.t : "",
                puntuacion: numeroCero(o.puntuacion ?? o.score),
                tono: typeof o.tono === "string" ? o.tono : "",
            });
        } catch {
            continue;
        }
    }
    return evaluadas;
}

/** Lee las últimas 30 líneas de `data/aprendizaje/cronica.md` (o ""). */
async function leerCronica(dir: string): Promise<string> {
    const texto = await leerArchivo(dir, path.join("data", "aprendizaje", "cronica.md"));
    if (texto === null) return "";
    const lineas = texto.split("\n");
    return lineas.slice(-30).join("\n");
}

/** Lee la fábrica (`data/aprendizaje/fabrica.json`) o `null`. */
async function leerFabrica(dir: string): Promise<FabricaAprendizaje | null> {
    const crudo = await leerJson<unknown>(dir, path.join("data", "aprendizaje", "fabrica.json"));
    if (typeof crudo !== "object" || crudo === null) return null;
    const c = crudo as Record<string, unknown>;
    return {
        instalada: c.instalada === true,
        detalle: typeof c.detalle === "string" ? c.detalle : "",
    };
}

/**
 * Lee los adaptadores del memory root (`starseed_memory_root/aprendizaje/adaptadores.json`).
 * Formato: objeto con entradas por id. Devuelve array vacío si no existe.
 */
async function leerAdaptadores(): Promise<AdaptadorAprendizaje[]> {
    const crudo = await leerJson<unknown>(raizDelProyecto(), path.join("starseed_memory_root", "aprendizaje", "adaptadores.json"));
    if (typeof crudo !== "object" || crudo === null) return [];
    const lista: AdaptadorAprendizaje[] = [];
    const fuente = Array.isArray(crudo) ? crudo : Object.values(crudo as Record<string, unknown>);
    for (const entrada of fuente) {
        if (typeof entrada !== "object" || entrada === null) continue;
        const a = entrada as Record<string, unknown>;
        const id = typeof a.id === "string" ? a.id : "";
        const personalidad = typeof a.personalidad === "string" ? a.personalidad : "";
        const fecha = typeof a.fecha === "string" ? a.fecha : (typeof a.creado === "string" ? a.creado : "");
        if (!id && !personalidad && !fecha) continue;
        lista.push({ id, personalidad, fecha });
    }
    return lista;
}

// ── Foto completa ────────────────────────────────────────────────────────────

/**
 * Junta toda la foto de la pestaña «Aprendizaje»: corpus, curación, evaluaciones,
 * crónica, fábrica y adaptadores. `backend` queda en `"vivo"` si hay corpus o
 * cualquiera de los archivos en disco; si todo falta, `"apagado"`.
 */
export async function leerAprendizaje(): Promise<Aprendizaje158> {
    const dir = dirAstraura();
    const [corpusR, curacionR, evaluacionesR, cronicaR, fabricaR, adaptadoresR] = await Promise.allSettled([
        leerCorpusDisco(dir),
        leerCuracion(dir),
        leerEvaluaciones(dir),
        leerCronica(dir),
        leerFabrica(dir),
        leerAdaptadores(),
    ]);
    const corpus = corpusR.status === "fulfilled" ? corpusR.value : { corpora: [], totalBytes: 0 };
    const curacion = curacionR.status === "fulfilled" ? curacionR.value : null;
    const evaluaciones = evaluacionesR.status === "fulfilled" ? evaluacionesR.value : [];
    const cronica = cronicaR.status === "fulfilled" ? cronicaR.value : "";
    const fabrica = fabricaR.status === "fulfilled" ? fabricaR.value : null;
    const adaptadores = adaptadoresR.status === "fulfilled" ? adaptadoresR.value : [];

    const hayAlgo =
        corpus.corpora.length > 0 || curacion !== null || evaluaciones.length > 0 ||
        cronica.length > 0 || fabrica !== null || adaptadores.length > 0;

    return {
        t: new Date().toISOString(),
        corpus: corpus.corpora,
        totalBytes: corpus.totalBytes,
        curacion,
        evaluaciones,
        cronica,
        fabrica,
        adaptadores,
        backend: hayAlgo ? "vivo" : "apagado",
    };
}

// ── Acciones reenviadas al backend 1.58 ──────────────────────────────────────

/**
 * Reenvía una valoración manual de un turno al backend:
 * `POST /api/aprendizaje/corpus/valorar` con `{ id, valoracion (-1|0|1), nota }`.
 * Devuelve si el backend respondió OK; false si está apagado o rechazó.
 */
export async function valorarTurno(id: string, valoracion: -1 | 0 | 1, nota: string): Promise<boolean> {
    try {
        const res = await fetch(`${baseBackendAprendizaje()}/api/aprendizaje/corpus/valorar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, valoracion, nota }),
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Resultado de una exportación de corpus a train.jsonl. */
export interface ExportacionAprendizaje {
    ok: boolean;
    turnos: number;
    ruta: string;
}

/**
 * Pide al backend exportar el corpus de una personalidad:
 * `POST /api/aprendizaje/corpus/exportar` con `{ personalidad }`. Devuelve
 * `{ turnos, ruta }` (ruta RELATIVA, nunca absoluta) o `{ ok:false }` si falló.
 */
export async function exportarCorpus(personalidad: string): Promise<ExportacionAprendizaje> {
    try {
        const res = await fetch(`${baseBackendAprendizaje()}/api/aprendizaje/corpus/exportar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ personalidad }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ok: false, turnos: 0, ruta: "" };
        const d = (await res.json()) as unknown;
        if (typeof d !== "object" || d === null) return { ok: true, turnos: 0, ruta: "" };
        const o = d as Record<string, unknown>;
        return {
            ok: true,
            turnos: numeroCero(o.turnos),
            ruta: typeof o.ruta === "string" ? o.ruta : "",
        };
    } catch {
        return { ok: false, turnos: 0, ruta: "" };
    }
}

export {};