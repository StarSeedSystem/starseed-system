/**
 * DEMONIO LOCAL DE MOVIMIENTO (Ola 229 · M2) — cliente al daemon Kimodo.
 * ─────────────────────────────────────────────────────────────────────────────
 * El motor de máxima calidad del movimiento de avatares (niveles «Vivo» y
 * «Fluido», ver `src/lib/avatares/movimiento/motor.ts`) es un proceso LOCAL
 * gestionado por el usuario en esta neurona: el daemon Kimodo (kimodo.cpp),
 * texto → movimiento con rotaciones por articulación y traslación de raíz.
 *
 * Escucha en `127.0.0.1:4600`:
 *   · `GET  /health` — 200 cuando está listo; puede informar modelo/esqueletos.
 *   · `POST /motion` — cuerpo `{ prompt, skeleton, seconds, seed }` y
 *                      respuesta `{ fps, frames, rotations, root }`.
 *
 * Este módulo NUNCA acepta una URL del exterior: solo habla con
 * `127.0.0.1:4600`. Lo usan las rutas `/api/movimiento/salud` y
 * `/api/movimiento/generar` del servidor del OS; nada de aquí expone rutas
 * absolutas del disco.
 *
 * Caché en memoria del servidor: los gestos se repiten mucho, así que cada
 * clip correcto se guarda por `(prompt, esqueleto, segundos, semilla)` con un
 * tope de 200 entradas y 30 minutos de vida — el demonio no recalcula lo
 * mismo dos veces.
 */

import type { EsqueletoMovimiento, MovimientoClip } from "./motor";

// Reexportado para que rutas y pruebas importen desde un solo punto.
export type { EsqueletoMovimiento, MovimientoClip } from "./motor";

/** Puerto fijo del demonio de movimiento (Kimodo) en esta neurona. */
export const PUERTO_MOVIMIENTO = 4600;

/** Origen interno del demonio (solo bucle local, jamás configurable). */
const ORIGEN = `http://127.0.0.1:${PUERTO_MOVIMIENTO}`;

/** Esqueletos que admite el demonio (SMPL-X 22, SOMA 30, Unitree G1 34). */
export const ESQUELETOS_ADMITIDOS: readonly EsqueletoMovimiento[] = ["smplx22", "soma30", "g1-34"];

/** ¿Es uno de los tres esqueletos admitidos? Guarda de tipo para las rutas. */
export function esEsqueletoAdmitido(v: unknown): v is EsqueletoMovimiento {
    return typeof v === "string" && (ESQUELETOS_ADMITIDOS as readonly string[]).includes(v);
}

/** Estado de salud del demonio de movimiento, medido en una llamada. */
export interface SaludDaemonMovimiento {
    /** El demonio respondió 200 al sondeo. */
    vivo: boolean;
    /** Modelo declarado por el demonio, si lo informa. */
    modelo?: string;
    /** Esqueletos declarados por el demonio, si los informa. */
    esqueletos?: string[];
    /** Milisegundos que tardó `/health` en responder. */
    latenciaMs?: number;
}

/**
 * Sondea `GET /health` del demonio y mide su latencia. `timeoutMs` (800 ms
 * por defecto) es el límite de espera. Nunca lanza: si el demonio está
 * apagado devuelve `{ vivo: false }`.
 */
export async function saludDaemonMovimiento(timeoutMs = 800): Promise<SaludDaemonMovimiento> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    const inicio = Date.now();
    try {
        const resp = await fetch(`${ORIGEN}/health`, {
            signal: control.signal,
            cache: "no-store",
        });
        if (!resp.ok) return { vivo: false };
        const latenciaMs = Date.now() - inicio;
        // El demonio PUEDE devolver un JSON con datos (modelo, esqueletos).
        const salud: SaludDaemonMovimiento = { vivo: true, latenciaMs };
        try {
            const cuerpo = (await resp.json()) as {
                model?: unknown;
                modelo?: unknown;
                skeletons?: unknown;
                esqueletos?: unknown;
            };
            const m = cuerpo.model ?? cuerpo.modelo;
            if (typeof m === "string" && m.trim()) salud.modelo = m.trim();
            const es = cuerpo.skeletons ?? cuerpo.esqueletos;
            if (Array.isArray(es)) {
                const lista = es
                    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                    .map((x) => x.trim());
                if (lista.length) salud.esqueletos = lista;
            }
        } catch {
            // Sin cuerpo JSON: el 200 ya basta para saber que está vivo.
        }
        return salud;
    } catch {
        return { vivo: false };
    } finally {
        clearTimeout(temporizador);
    }
}

/** Opciones de generación hacia el demonio. */
export interface OpcionesMovimiento {
    /** Esqueleto objetivo del clip (uno de los tres admitidos). */
    esqueleto: EsqueletoMovimiento;
    /** Duración del clip, en segundos. */
    segundos: number;
    /** Semilla determinista; si falta, el demonio decide. */
    semilla?: number;
}

/** ¿Matriz de números (filas no vacías de valores finitos)? */
function esMatrizDeNumeros(v: unknown): v is number[][] {
    if (!Array.isArray(v) || v.length === 0) return false;
    for (const fila of v) {
        if (!Array.isArray(fila) || fila.length === 0) return false;
        for (const n of fila) {
            if (typeof n !== "number" || !Number.isFinite(n)) return false;
        }
    }
    return true;
}

// ─── Caché en memoria del servidor ───────────────────────────────────────────
// Tope de 200 entradas y 30 minutos de vida. Lectura con refresco de orden
// (sobreviven los gestos más usados) y expulsión de lo más viejo al llenarse.

/** Tope de entradas de la caché. */
const CACHE_TOPE = 200;
/** Vida de cada entrada, en milisegundos (30 min). */
const CACHE_VIDA_MS = 30 * 60 * 1000;
const CACHE = new Map<string, { clip: MovimientoClip; expira: number }>();

/** Clave inequívoca del pedido: el mismo gesto devuelve el mismo clip. */
function claveDeCache(prompt: string, o: OpcionesMovimiento): string {
    return JSON.stringify([prompt, o.esqueleto, o.segundos, o.semilla ?? null]);
}

/** Lee un clip aún vivo de la caché (y refresca su antigüedad). */
function leerDeCache(clave: string, ahora: number): MovimientoClip | null {
    const entrada = CACHE.get(clave);
    if (!entrada) return null;
    if (entrada.expira <= ahora) {
        CACHE.delete(clave);
        return null;
    }
    // Refresca el orden de inserción: los gestos usados sobreviven.
    CACHE.delete(clave);
    CACHE.set(clave, entrada);
    return entrada.clip;
}

/** Guarda un clip en la caché respetando el tope (expulsa lo más viejo). */
function guardarEnCache(clave: string, clip: MovimientoClip): void {
    if (CACHE.size >= CACHE_TOPE) {
        const ahora = Date.now();
        // Primero expulsa una entrada vencida; si no hay, la menos usada.
        let expulsar: string | null = null;
        for (const [k, e] of CACHE) {
            if (e.expira <= ahora) {
                expulsar = k;
                break;
            }
        }
        if (expulsar === null) {
            const masAntigua = CACHE.keys().next().value;
            if (masAntigua !== undefined) expulsar = masAntigua;
        }
        if (expulsar !== null) CACHE.delete(expulsar);
    }
    CACHE.set(clave, { clip, expira: Date.now() + CACHE_VIDA_MS });
}

/**
 * Genera un clip de movimiento en el demonio local (`POST /motion`) y lo
 * devuelve, o `null` si el demonio no respondió, falló o devolvió algo
 * inválido. Consulta primero la caché del servidor. NUNCA lanza: quien
 * llama (la ruta `/api/movimiento/generar`) decide cómo responder al cliente.
 */
export async function generarMovimiento(
    prompt: string,
    opciones: OpcionesMovimiento,
): Promise<MovimientoClip | null> {
    const limpio = (prompt || "").trim();
    if (!limpio) return null;
    if (!esEsqueletoAdmitido(opciones.esqueleto)) return null;
    if (typeof opciones.segundos !== "number" || !Number.isFinite(opciones.segundos)) return null;

    // Los gestos se repiten mucho: mismo pedido → mismo clip, sin recalcular.
    const clave = claveDeCache(limpio, opciones);
    const cacheado = leerDeCache(clave, Date.now());
    if (cacheado) return cacheado;

    const control = new AbortController();
    // La generación puede tardar en la primera llamada (modelo frío): 120 s.
    const temporizador = setTimeout(() => control.abort(), 120_000);
    try {
        const resp = await fetch(`${ORIGEN}/motion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: limpio,
                skeleton: opciones.esqueleto,
                seconds: opciones.segundos,
                seed: opciones.semilla ?? 0,
            }),
            signal: control.signal,
        });
        if (!resp.ok) return null;
        const cuerpo = (await resp.json()) as {
            fps?: unknown;
            frames?: unknown;
            rotations?: unknown;
            root?: unknown;
        };
        if (typeof cuerpo.fps !== "number" || !Number.isFinite(cuerpo.fps) || cuerpo.fps <= 0) {
            return null;
        }
        if (!esMatrizDeNumeros(cuerpo.rotations)) return null;

        let raiz: number[][] | undefined;
        if (cuerpo.root !== undefined && cuerpo.root !== null) {
            if (!esMatrizDeNumeros(cuerpo.root)) return null;
            raiz = cuerpo.root;
        }

        const fotogramas =
            typeof cuerpo.frames === "number" && Number.isFinite(cuerpo.frames) && cuerpo.frames > 0
                ? cuerpo.frames
                : cuerpo.rotations.length;

        const clip: MovimientoClip = {
            esqueleto: opciones.esqueleto,
            fps: cuerpo.fps,
            duracionMs: Math.round((fotogramas / cuerpo.fps) * 1000),
            rotaciones: cuerpo.rotations,
            raiz,
            origen: "kimodo",
        };
        guardarEnCache(clave, clip);
        return clip;
    } catch {
        return null;
    } finally {
        clearTimeout(temporizador);
    }
}
