"use client";
/**
 * Fuente compartida del paquete «Social, red y archivos» (Ola 0929 · D).
 *
 * Contrato «consumo» (2026-09-29): Supabase se bloqueó dos veces por tráfico. Aquí vive la regla
 * de TODAS las lecturas propias de estos widgets, una sola vez:
 *
 *   · UNA lectura por clave, compartida por todas las instancias (tres widgets de mensajes en
 *     tres pestañas del tablero cuestan lo mismo que uno) y con las peticiones en vuelo
 *     deduplicadas.
 *   · El bucle es el común (`crearBucle` de bucle-fondo): pausa con el dispositivo oculto, freno
 *     remoto, espera exponencial ante fallos que se arreglan solos y PARADA ante un 400/404.
 *   · Cadencia mínima de 5 min; y si ninguna instancia está en pantalla, la vuelta no toca la red
 *     (vuelve a mirar al minuto, sin peticiones). Al asomar con el dato caducado, se adelanta.
 *   · Ni realtime ni sondeos rápidos: quien quiera lo último pulsa «Actualizar».
 */
import * as React from "react";
import { clasificarFallo, crearBucle, MINUTO_MS, type BucleFondo, type FalloConsulta } from "@/lib/network/bucle-fondo";

/** Nunca menos de esto entre dos lecturas automáticas. */
export const CADENCIA_MINIMA_MS = 5 * MINUTO_MS;

export interface ResultadoCarga<T> {
    datos?: T;
    fallo?: FalloConsulta | null;
}

export interface EstadoFuente<T> {
    datos: T | undefined;
    /** Primera carga en curso (sin datos aún). */
    cargando: boolean;
    /** Actualización en curso con datos ya pintados. */
    actualizando: boolean;
    /** Último fallo (null si la última lectura fue bien). */
    fallo: FalloConsulta | null;
    /** La consulta no funcionará contra esta base (400/404): parada hasta recargar. */
    detenida: boolean;
    /** ms de la última lectura correcta (0 = nunca). */
    actualizado: number;
}

interface Registro<T> {
    estado: EstadoFuente<T>;
    oyentes: Set<() => void>;
    enPantalla: Map<symbol, boolean>;
    cargar: () => Promise<ResultadoCarga<T>>;
    intervaloMs: number;
    bucle: BucleFondo | null;
    usuarios: number;
}

const INICIAL: EstadoFuente<never> = {
    datos: undefined,
    cargando: true,
    actualizando: false,
    fallo: null,
    detenida: false,
    actualizado: 0,
};

const registros = new Map<string, Registro<unknown>>();

function emitir(r: Registro<unknown>, parche: Partial<EstadoFuente<unknown>>): void {
    r.estado = { ...r.estado, ...parche };
    for (const o of r.oyentes) {
        try {
            o();
        } catch {
            /* un oyente roto no para al resto */
        }
    }
}

function algunoEnPantalla(r: Registro<unknown>): boolean {
    for (const v of r.enPantalla.values()) if (v) return true;
    return r.enPantalla.size === 0;
}

function registroDe<T>(clave: string, cargar: () => Promise<ResultadoCarga<T>>, intervaloMs: number): Registro<T> {
    let r = registros.get(clave) as Registro<T> | undefined;
    if (!r) {
        r = {
            estado: { ...INICIAL },
            oyentes: new Set(),
            enPantalla: new Map(),
            cargar,
            intervaloMs: Math.max(CADENCIA_MINIMA_MS, intervaloMs),
            bucle: null,
            usuarios: 0,
        };
        registros.set(clave, r as Registro<unknown>);
    } else {
        // La última instancia montada trae el cargador más reciente (cierres con la sesión nueva).
        r.cargar = cargar;
    }
    return r;
}

function arrancar(clave: string, r: Registro<unknown>): void {
    if (r.bucle) return;
    r.bucle = crearBucle({
        nombre: `widgets · ${clave}`,
        consulta: clave,
        intervaloMs: r.intervaloMs,
        soloLider: false,
        tarea: async () => {
            const caducado = Date.now() - r.estado.actualizado >= r.intervaloMs;
            // Nadie mira y ya hay algo pintado: esta vuelta no toca la red.
            if (r.estado.actualizado > 0 && (!algunoEnPantalla(r) || !caducado)) {
                return { siguienteMs: MINUTO_MS };
            }
            emitir(r, r.estado.datos === undefined ? { cargando: true } : { actualizando: true });
            let res: ResultadoCarga<unknown>;
            try {
                res = await r.cargar();
            } catch (e) {
                res = { fallo: { message: e instanceof Error ? e.message : "sin red" } };
            }
            if (res.fallo) {
                const detenida = clasificarFallo(res.fallo) === "permanente";
                emitir(r, { cargando: false, actualizando: false, fallo: res.fallo, detenida });
            } else {
                emitir(r, { datos: res.datos, cargando: false, actualizando: false, fallo: null, actualizado: Date.now() });
            }
            return { fallo: res.fallo ?? null };
        },
    });
    r.bucle.iniciar();
}

function soltar(clave: string, r: Registro<unknown>): void {
    r.usuarios -= 1;
    if (r.usuarios > 0) return;
    r.bucle?.detener();
    r.bucle = null;
    // El estado se conserva: si el widget vuelve (cambio de pestaña del tablero), pinta al
    // instante lo último y solo lee si ya caducó.
    r.oyentes.clear();
    r.enPantalla.clear();
    registros.set(clave, r);
}

export interface OpcionesFuente {
    /** Cadencia de relectura (mínimo 5 min). */
    intervaloMs?: number;
    /** ¿Esta instancia está en pantalla? (IntersectionObserver del widget). */
    enPantalla?: boolean;
}

export interface Fuente<T> extends EstadoFuente<T> {
    /** Lectura inmediata pedida por la persona (respeta el freno y la parada). */
    recargar: () => void;
    /** Reescribe los datos en memoria tras una acción propia (envío, reacción…), sin red. */
    mutar: (fn: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Lee `cargar` bajo la clave `clave` (null = todavía no: p. ej. sin sesión resuelta) y la comparte
 * entre instancias. Devuelve el estado honesto: cargando, fallo, parada, datos y cuándo.
 */
export function useFuenteCompartida<T>(
    clave: string | null,
    cargar: () => Promise<ResultadoCarga<T>>,
    opciones: OpcionesFuente = {},
): Fuente<T> {
    const intervalo = opciones.intervaloMs ?? CADENCIA_MINIMA_MS;
    const idRef = React.useRef<symbol>(Symbol("instancia"));
    const cargarRef = React.useRef(cargar);
    cargarRef.current = cargar;

    const suscribir = React.useCallback(
        (cb: () => void) => {
            if (!clave) return () => undefined;
            const r = registroDe<unknown>(clave, () => cargarRef.current() as Promise<ResultadoCarga<unknown>>, intervalo);
            r.oyentes.add(cb);
            r.usuarios += 1;
            arrancar(clave, r);
            return () => {
                r.oyentes.delete(cb);
                r.enPantalla.delete(idRef.current);
                soltar(clave, r);
            };
        },
        [clave, intervalo],
    );
    const leer = React.useCallback(
        () => (clave ? ((registros.get(clave)?.estado as EstadoFuente<T> | undefined) ?? (INICIAL as EstadoFuente<T>)) : (INICIAL as EstadoFuente<T>)),
        [clave],
    );
    const estado = React.useSyncExternalStore(suscribir, leer, () => INICIAL as EstadoFuente<T>);

    // Visibilidad de ESTA instancia: al asomar con el dato caducado, se adelanta la vuelta.
    const enPantalla = opciones.enPantalla !== false;
    React.useEffect(() => {
        if (!clave) return;
        const r = registros.get(clave);
        if (!r) return;
        r.enPantalla.set(idRef.current, enPantalla);
        if (enPantalla && r.estado.actualizado > 0 && Date.now() - r.estado.actualizado >= r.intervaloMs) r.bucle?.adelantar();
    }, [clave, enPantalla]);

    const recargar = React.useCallback(() => {
        if (!clave) return;
        void registros.get(clave)?.bucle?.ahora();
    }, [clave]);

    const mutar = React.useCallback(
        (fn: (prev: T | undefined) => T | undefined) => {
            if (!clave) return;
            const r = registros.get(clave);
            if (!r) return;
            emitir(r, { datos: fn(r.estado.datos as T | undefined) });
        },
        [clave],
    );

    return { ...estado, recargar, mutar };
}

/** Para pruebas: olvida todas las fuentes. */
export function _reiniciarFuentesParaPruebas(): void {
    for (const r of registros.values()) r.bucle?.detener();
    registros.clear();
}

/**
 * ¿El elemento está en pantalla? (IntersectionObserver; sin él, siempre sí). Sirve para pausar
 * lecturas y animaciones de los widgets que quedan fuera de la vista.
 */
export function useEnPantalla<E extends Element>(ref: React.RefObject<E | null>): boolean {
    const [visible, setVisible] = React.useState(true);
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entradas) => {
            for (const e of entradas) setVisible(e.isIntersecting);
        }, { rootMargin: "80px" });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return visible;
}
