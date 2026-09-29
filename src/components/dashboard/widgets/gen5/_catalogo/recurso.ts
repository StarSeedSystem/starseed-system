"use client";
/**
 * Recursos compartidos con caducidad (Ola 0929-C) — la regla del presupuesto de tráfico hecha
 * código: una fuente externa (Open-Meteo, NOAA) o una lectura puntual de la nube se pide UNA
 * vez por clave, la comparten todas las instancias del widget (y las pestañas, vía
 * localStorage) y no se vuelve a pedir hasta que caduca (≥ 15 min) Y el widget está a la vista.
 *
 * - `obtenerCompartido`: memoria → localStorage → red (deduplicada en vuelo).
 * - `useCompartido`: pinta al instante lo último guardado (aunque esté caducado, marcado
 *   como tal) y solo pide de nuevo cuando está visible y caducado. Nunca hay un intervalo
 *   corriendo: un único temporizador hasta la próxima caducidad, y solo si se ve.
 */
import * as React from "react";

export interface EntradaCompartida<T> {
    datos: T;
    /** Momento de la carga (epoch ms). */
    en: number;
}

const PREFIJO = "starseed.c.cache.v1:";
/** Mínimo absoluto de caducidad: nada se refresca más a menudo que esto. */
export const TTL_MINIMO_MS = 5 * 60_000;
/** Espera tras un fallo antes de volver a intentarlo solo. */
export const REINTENTO_MS = 5 * 60_000;

const memoria = new Map<string, EntradaCompartida<unknown>>();
const enVuelo = new Map<string, Promise<unknown>>();
const oyentes = new Map<string, Set<() => void>>();

function avisar(clave: string) {
    oyentes.get(clave)?.forEach((f) => { try { f(); } catch { /* un oyente roto no tumba a los demás */ } });
}

function leerAlmacen<T>(clave: string): EntradaCompartida<T> | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(PREFIJO + clave);
        if (!raw) return null;
        const j = JSON.parse(raw) as EntradaCompartida<T>;
        return j && typeof j.en === "number" && "datos" in j ? j : null;
    } catch {
        return null;
    }
}

function escribirAlmacen<T>(clave: string, e: EntradaCompartida<T>) {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(PREFIJO + clave, JSON.stringify(e)); } catch { /* cuota llena o modo privado */ }
}

/** Lo último que se tiene (memoria o almacén), fresco o no. */
export function leerCompartido<T>(clave: string): EntradaCompartida<T> | null {
    const m = memoria.get(clave) as EntradaCompartida<T> | undefined;
    if (m) return m;
    const a = leerAlmacen<T>(clave);
    if (a) memoria.set(clave, a);
    return a;
}

export function estaFresco(e: EntradaCompartida<unknown> | null, ttlMs: number, ahora = Date.now()): boolean {
    return !!e && ahora - e.en < Math.max(TTL_MINIMO_MS, ttlMs);
}

export interface OpcionesCompartido {
    /** Guardar en localStorage (por defecto sí). */
    persistir?: boolean;
    /** Ignorar la caducidad (acción explícita del usuario). */
    forzar?: boolean;
}

/** Devuelve el dato fresco o lo carga (una sola petición en vuelo por clave). */
export async function obtenerCompartido<T>(clave: string, ttlMs: number, cargar: () => Promise<T>, op: OpcionesCompartido = {}): Promise<T> {
    const actual = leerCompartido<T>(clave);
    if (!op.forzar && actual && estaFresco(actual, ttlMs)) return actual.datos;
    const vuelo = enVuelo.get(clave) as Promise<T> | undefined;
    if (vuelo) return vuelo;
    const p = (async () => {
        try {
            const datos = await cargar();
            const e = { datos, en: Date.now() };
            memoria.set(clave, e);
            if (op.persistir !== false) escribirAlmacen(clave, e);
            avisar(clave);
            return datos;
        } finally {
            enVuelo.delete(clave);
        }
    })();
    enVuelo.set(clave, p);
    return p;
}

/** Solo para pruebas: vacía memoria y vuelos. */
export function _vaciarCompartidos() {
    memoria.clear();
    enVuelo.clear();
}

export interface EstadoCompartido<T> {
    datos: T | null;
    /** Epoch ms de los datos mostrados (o null). */
    en: number | null;
    cargando: boolean;
    error: unknown;
    /** Hay datos pero ya caducaron (se muestran igual, marcados). */
    caducado: boolean;
    recargar: () => void;
}

/**
 * Hook: `clave` null = aún no se puede pedir (sin ubicación, sin sesión…). `activo` = el
 * widget está a la vista; sin él no se pide nada (ni se programa nada).
 */
export function useCompartido<T>(clave: string | null, ttlMs: number, cargar: () => Promise<T>, activo = true, op: OpcionesCompartido = {}): EstadoCompartido<T> {
    const ttl = Math.max(TTL_MINIMO_MS, ttlMs);
    const cargarRef = React.useRef(cargar);
    cargarRef.current = cargar;
    const [version, setVersion] = React.useState(0);
    const [cargando, setCargando] = React.useState(false);
    const [error, setError] = React.useState<unknown>(null);
    const [montado, setMontado] = React.useState(false);
    const ultimoFallo = React.useRef(0);
    const ultimaCarga = React.useRef(0);

    React.useEffect(() => { setMontado(true); }, []);

    // Suscripción: otra instancia (o esta) trajo datos nuevos.
    React.useEffect(() => {
        if (!clave) return;
        const f = () => setVersion((v) => v + 1);
        let set = oyentes.get(clave);
        if (!set) { set = new Set(); oyentes.set(clave, set); }
        set.add(f);
        return () => { set?.delete(f); };
    }, [clave]);

    const pedir = React.useCallback(async (forzar = false) => {
        if (!clave) return;
        // Ni siquiera a mano se pide más de una vez por minuto.
        if (forzar && Date.now() - ultimaCarga.current < 60_000) return;
        ultimaCarga.current = Date.now();
        setCargando(true);
        try {
            await obtenerCompartido(clave, ttl, () => cargarRef.current(), { ...op, forzar });
            setError(null);
        } catch (e) {
            ultimoFallo.current = Date.now();
            setError(e ?? new Error("fallo"));
        } finally {
            setCargando(false);
            setVersion((v) => v + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave, ttl, op.persistir]);

    // Pedir solo si está a la vista y caducado; programar UNA vez la próxima caducidad. Tras un
    // fallo no se reintenta en bucle: se espera REINTENTO_MS.
    React.useEffect(() => {
        if (!clave || !activo || !montado) return;
        const e = leerCompartido<T>(clave);
        const ahora = Date.now();
        let falta: number;
        if (estaFresco(e, ttl)) falta = e!.en + ttl - ahora;
        else if (ahora - ultimoFallo.current < REINTENTO_MS) falta = ultimoFallo.current + REINTENTO_MS - ahora;
        else { void pedir(); return; }
        const t = window.setTimeout(() => { void pedir(); }, Math.max(1_000, falta));
        return () => window.clearTimeout(t);
    }, [clave, activo, montado, ttl, pedir, version]);

    const e = montado && clave ? leerCompartido<T>(clave) : null;
    return {
        datos: e?.datos ?? null,
        en: e?.en ?? null,
        cargando: cargando || (!!clave && activo && !e && !error),
        error: e ? null : error,
        caducado: !!e && !estaFresco(e, ttl),
        recargar: () => { void pedir(true); },
    };
}
