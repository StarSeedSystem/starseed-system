"use client";
/**
 * Caché compartida del paquete B (Ontocracia · gobernanza · economía) — Ola 0929.
 *
 * Contrato «consumo» (2026-09-29): Supabase se bloqueó dos veces por tráfico. Aquí NO hay sondeo:
 *   · Cada dato vive UNA vez en memoria (y en localStorage para sobrevivir a la recarga), con su
 *     momento de lectura. Dos widgets que piden la misma clave comparten la misma petición.
 *   · Se lee al montar SOLO si lo guardado está caducado (TTL ≥ 10 min por defecto).
 *   · Al volver a la pestaña (visibilitychange → visible) se relee solo si caducó.
 *   · «Actualizar» a mano fuerza la lectura, como mucho una vez cada 30 s por clave.
 *   · Con el freno remoto o el cortacircuitos puesto no se toca la red: queda lo último guardado.
 * Ningún intervalo, ninguna suscripción en tiempo real.
 */
import * as React from "react";

export type EstadoDato = "cargando" | "listo" | "error";

export interface EntradaCache<T> {
    dato: T | null;
    /** Momento (ms) de la última lectura buena; 0 si nunca. */
    ts: number;
    error: string | null;
    enVuelo: Promise<void> | null;
    /** Último intento forzado (para el mínimo entre «Actualizar»). */
    forzadoTs: number;
}

export interface OpcionesDato {
    /** Tiempo de vida de lo leído (ms). Nunca menos de 5 min. */
    ttlMs?: number;
    /** Guardar en localStorage (por defecto sí). */
    persistir?: boolean;
    /** false = no leer todavía (p. ej. esperando a la sesión). */
    activo?: boolean;
}

export interface ResultadoDato<T> {
    dato: T | null;
    estado: EstadoDato;
    error: string | null;
    /** Momento de la última lectura buena (ms) o 0. */
    actualizado: number;
    /** Fuerza una lectura (limitada a una cada 30 s). */
    recargar: () => void;
}

export const TTL_MINIMO_MS = 5 * 60_000;
export const TTL_POR_DEFECTO_MS = 10 * 60_000;
export const FORZADO_MINIMO_MS = 30_000;
const PREFIJO = "starseed.b.cache.";

const almacen = new Map<string, EntradaCache<unknown>>();
const oyentes = new Map<string, Set<() => void>>();

function entrada<T>(clave: string, persistir: boolean): EntradaCache<T> {
    let e = almacen.get(clave) as EntradaCache<T> | undefined;
    if (!e) {
        e = { dato: null, ts: 0, error: null, enVuelo: null, forzadoTs: 0 };
        if (persistir && typeof window !== "undefined") {
            try {
                const crudo = window.localStorage.getItem(PREFIJO + clave);
                if (crudo) {
                    const j = JSON.parse(crudo) as { ts?: number; dato?: T };
                    if (j && typeof j.ts === "number" && j.dato !== undefined) { e.dato = j.dato; e.ts = j.ts; }
                }
            } catch { /* sin almacén (privado, cuota): solo memoria */ }
        }
        almacen.set(clave, e as EntradaCache<unknown>);
    }
    return e;
}

function avisar(clave: string): void {
    oyentes.get(clave)?.forEach((f) => { try { f(); } catch { /* un oyente roto no tumba a los demás */ } });
}

/** ¿Está caducado lo guardado para esta clave? (puro, para pruebas) */
export function caducado(ts: number, ttlMs: number, ahora = Date.now()): boolean {
    return !ts || ahora - ts >= Math.max(TTL_MINIMO_MS, ttlMs);
}

/** Freno remoto o cortacircuitos activos: no se toca la red. Tolerante si el módulo no está. */
async function redEnPausa(): Promise<boolean> {
    try {
        const m = await import("@/lib/consumo/freno");
        return typeof m.frenoActivo === "function" ? m.frenoActivo() : false;
    } catch {
        return false;
    }
}

/**
 * Lee (o reutiliza la lectura en vuelo de) una clave. Devuelve cuando termina. Nunca lanza.
 * `forzar` salta el TTL (respetando el mínimo de 30 s entre forzados).
 */
export async function leerCompartido<T>(clave: string, cargar: () => Promise<T>, op: { ttlMs?: number; persistir?: boolean; forzar?: boolean } = {}): Promise<void> {
    const persistir = op.persistir !== false;
    const ttl = op.ttlMs ?? TTL_POR_DEFECTO_MS;
    const e = entrada<T>(clave, persistir);
    const ahora = Date.now();
    if (e.enVuelo) return e.enVuelo;
    if (op.forzar) {
        if (ahora - e.forzadoTs < FORZADO_MINIMO_MS) return;
        e.forzadoTs = ahora;
    } else if (!caducado(e.ts, ttl, ahora) && e.dato !== null) {
        return;
    }
    e.enVuelo = (async () => {
        try {
            if (await redEnPausa()) {
                e.error = "La red está en pausa para cuidar el consumo: se muestra lo último guardado.";
                return;
            }
            const dato = await cargar();
            e.dato = dato;
            e.ts = Date.now();
            e.error = null;
            if (persistir && typeof window !== "undefined") {
                try { window.localStorage.setItem(PREFIJO + clave, JSON.stringify({ ts: e.ts, dato })); } catch { /* cuota */ }
            }
        } catch (err) {
            e.error = err instanceof Error && err.message ? err.message : "No se pudo leer.";
        } finally {
            e.enVuelo = null;
            avisar(clave);
        }
    })();
    avisar(clave);
    return e.enVuelo;
}

/** Olvida una clave (tras votar, revocar…) para que la próxima lectura vaya a la red. */
export function invalidarCompartido(clave: string): void {
    const e = almacen.get(clave);
    if (e) { e.ts = 0; e.forzadoTs = 0; }
}

/** Solo pruebas: vacía la caché en memoria. */
export function __reiniciarCacheB(): void {
    almacen.clear();
    oyentes.clear();
}

/**
 * Hook: el dato compartido de `clave`. `cargar` debe ser estable en significado para la clave
 * (la clave manda: si cambia el usuario, cambia la clave).
 */
export function useDatoCompartido<T>(clave: string | null, cargar: () => Promise<T>, op: OpcionesDato = {}): ResultadoDato<T> {
    const persistir = op.persistir !== false;
    const ttl = op.ttlMs ?? TTL_POR_DEFECTO_MS;
    const activo = op.activo !== false && !!clave;
    const [, setVersion] = React.useState(0);
    // Hasta montar no se lee el almacén: el servidor no lo tiene y la hidratación debe coincidir.
    const [montado, setMontado] = React.useState(false);
    React.useEffect(() => setMontado(true), []);
    const cargarRef = React.useRef(cargar);
    cargarRef.current = cargar;

    React.useEffect(() => {
        if (!clave) return;
        let set = oyentes.get(clave);
        if (!set) { set = new Set(); oyentes.set(clave, set); }
        const f = () => setVersion((v) => v + 1);
        set.add(f);
        return () => { set!.delete(f); };
    }, [clave]);

    React.useEffect(() => {
        if (!activo || !clave) return;
        void leerCompartido<T>(clave, () => cargarRef.current(), { ttlMs: ttl, persistir });
        const alVolver = () => {
            if (document.visibilityState === "visible") void leerCompartido<T>(clave, () => cargarRef.current(), { ttlMs: ttl, persistir });
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => document.removeEventListener("visibilitychange", alVolver);
    }, [activo, clave, ttl, persistir]);

    const recargar = React.useCallback(() => {
        if (!clave) return;
        void leerCompartido<T>(clave, () => cargarRef.current(), { ttlMs: ttl, persistir, forzar: true });
    }, [clave, ttl, persistir]);

    if (!clave || !montado) return { dato: null, estado: "cargando", error: null, actualizado: 0, recargar };
    const e = entrada<T>(clave, persistir);
    const estado: EstadoDato = e.dato !== null ? "listo" : e.error ? "error" : "cargando";
    return { dato: e.dato, estado, error: e.error, actualizado: e.ts, recargar };
}
