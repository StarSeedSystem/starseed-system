"use client";
/**
 * Caché compartida del paquete E — presupuesto de tráfico (contrato «consumo», 2026-09-29).
 *
 * Todas las instancias de un widget (y los widgets hermanos que leen lo mismo, p. ej. el mapa y
 * los proyectos de la red) comparten UNA lectura: memoria + localStorage con caducidad, y las
 * peticiones en vuelo se deduplican. Los refrescos van cada ≥ 5 min y solo con el widget visible.
 * Nunca se llama a la red dentro de un render.
 */
import * as React from "react";

interface Entrada<T> { t: number; v: T }

const memoria = new Map<string, Entrada<unknown>>();
const enVuelo = new Map<string, Promise<unknown>>();
const oyentes = new Map<string, Set<() => void>>();
const PREFIJO = "starseed.paquete-e.cache.";

/** Mínimos del contrato: nada se refresca más a menudo que esto. */
export const TTL_MINIMO_MS = 5 * 60_000;
export const TTL_EXTERNO_MS = 15 * 60_000;

function leerPersistido<T>(clave: string): Entrada<T> | undefined {
    if (typeof window === "undefined") return undefined;
    try {
        const crudo = window.localStorage.getItem(PREFIJO + clave);
        if (!crudo) return undefined;
        const e = JSON.parse(crudo) as Entrada<T>;
        return typeof e?.t === "number" ? e : undefined;
    } catch {
        return undefined;
    }
}

function persistir<T>(clave: string, e: Entrada<T>): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(PREFIJO + clave, JSON.stringify(e)); } catch { /* cuota llena: solo memoria */ }
}

function avisar(clave: string) {
    oyentes.get(clave)?.forEach((f) => f());
}

/** Lectura síncrona: el valor en caché (aunque haya caducado) y su edad. */
export function leerCacheE<T>(clave: string, persistente = true): { valor: T; edadMs: number } | undefined {
    let e = memoria.get(clave) as Entrada<T> | undefined;
    if (!e && persistente) {
        e = leerPersistido<T>(clave);
        if (e) memoria.set(clave, e);
    }
    return e ? { valor: e.v, edadMs: Date.now() - e.t } : undefined;
}

/** Guarda un valor (y avisa a todas las instancias que lo miran). */
export function escribirCacheE<T>(clave: string, valor: T, persistente = true): void {
    const e = { t: Date.now(), v: valor };
    memoria.set(clave, e);
    if (persistente) persistir(clave, e);
    avisar(clave);
}

/** Olvida una clave (tras una escritura propia, para que la próxima lectura sea fresca). */
export function invalidarCacheE(clave: string): void {
    memoria.delete(clave);
    if (typeof window !== "undefined") {
        try { window.localStorage.removeItem(PREFIJO + clave); } catch { /* sin almacenamiento */ }
    }
}

/**
 * Devuelve el valor fresco (edad < ttl) o lo carga UNA sola vez aunque lo pidan N widgets a la vez.
 */
export async function cacheadoE<T>(clave: string, ttlMs: number, cargar: () => Promise<T>, persistente = true, forzar = false): Promise<T> {
    const ttl = Math.max(TTL_MINIMO_MS, ttlMs);
    const actual = forzar ? undefined : leerCacheE<T>(clave, persistente);
    if (actual && actual.edadMs < ttl) return actual.valor;
    const pendiente = enVuelo.get(clave) as Promise<T> | undefined;
    if (pendiente) return pendiente;
    const p = (async () => {
        try {
            const v = await cargar();
            escribirCacheE(clave, v, persistente);
            return v;
        } finally {
            enVuelo.delete(clave);
        }
    })();
    enVuelo.set(clave, p);
    return p;
}

export interface EstadoCacheE<T> {
    datos: T | undefined;
    cargando: boolean;
    error: unknown;
    /** Fuerza una lectura nueva (tras un gesto de la persona o una escritura). */
    recargar: () => void;
}

/**
 * Hook sobre `cacheadoE`: primera pintura con lo que haya en caché, una lectura si está caducado,
 * y un refresco cada `ttlMs` SOLO mientras `visible`. `activo=false` no toca la red.
 */
export function useCacheadoE<T>(
    clave: string,
    cargar: () => Promise<T>,
    { ttlMs = TTL_MINIMO_MS, visible = true, activo = true, persistente = true }: { ttlMs?: number; visible?: boolean; activo?: boolean; persistente?: boolean } = {},
): EstadoCacheE<T> {
    const cargarRef = React.useRef(cargar);
    cargarRef.current = cargar;
    const [datos, setDatos] = React.useState<T | undefined>(undefined);
    const [cargando, setCargando] = React.useState<boolean>(activo);
    const [error, setError] = React.useState<unknown>(null);
    const ttl = Math.max(TTL_MINIMO_MS, ttlMs);

    const leer = React.useCallback(async (forzar: boolean) => {
        if (!activo) { setCargando(false); return; }
        setCargando(true);
        try {
            const v = await cacheadoE(clave, ttl, () => cargarRef.current(), persistente, forzar);
            setDatos(v);
            setError(null);
        } catch (e) {
            setError(e ?? new Error("fallo"));
        } finally {
            setCargando(false);
        }
    }, [clave, ttl, activo, persistente]);

    // Primera pintura síncrona desde la caché (en efecto: el servidor no la tiene).
    React.useEffect(() => {
        const previo = leerCacheE<T>(clave, persistente);
        if (previo) setDatos(previo.valor);
        const f = () => { const e = leerCacheE<T>(clave, persistente); if (e) setDatos(e.valor); };
        let set = oyentes.get(clave);
        if (!set) { set = new Set(); oyentes.set(clave, set); }
        set.add(f);
        return () => { set?.delete(f); };
    }, [clave, persistente]);

    React.useEffect(() => { void leer(false); }, [leer]);

    React.useEffect(() => {
        if (!activo || !visible) return;
        const id = window.setInterval(() => { void leer(false); }, ttl);
        return () => window.clearInterval(id);
    }, [activo, visible, ttl, leer]);

    const recargar = React.useCallback(() => { void leer(true); }, [leer]);
    return { datos, cargando, error, recargar };
}

/** Solo para pruebas: vacía la memoria compartida. */
export function _vaciarCacheE(): void {
    memoria.clear();
    enVuelo.clear();
}
