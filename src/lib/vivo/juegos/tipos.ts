/**
 * Tipos comunes de los JUEGOS y PROGRAMAS en vivo (L4 · 2026-09-28).
 *
 * Todo lo compartido entre personas viaja como un REGISTRO de entradas (un diario de jugadas):
 * el estado nunca se copia, se RECONSTRUYE repitiendo el diario con las mismas reglas puras en
 * cada dispositivo. Por eso una recarga o alguien que llega tarde ve exactamente la misma
 * partida, y por eso una jugada remota que no es legal se rechaza igual en todos los clientes.
 *
 * Módulo PURO: sin red, sin reloj, sin azar propio.
 */

export type Json = string | number | boolean | null | Json[] | { [clave: string]: Json };
export type Datos = { [clave: string]: Json };

/** Los juegos que sabe abrir la sala. */
export type IdJuego = "tres-en-raya" | "conecta-4" | "ajedrez" | "dibujo";

export const IDS_JUEGO: readonly IdJuego[] = ["tres-en-raya", "conecta-4", "ajedrez", "dibujo"];

export function esIdJuego(v: unknown): v is IdJuego {
    return typeof v === "string" && (IDS_JUEGO as readonly string[]).includes(v);
}

/** Una línea del diario. `n` es su posición (0, 1, 2…): el diario es una cadena sin huecos. */
export interface Entrada {
    /** Id único de la entrada (para no aplicarla dos veces y detectar duplicados). */
    id: string;
    n: number;
    /** Quién la hizo (uid de su cuenta). */
    u: string;
    /** Marca de tiempo (ms) en el reloj de quien la hizo. */
    t: number;
    /** Clase de entrada: «jugar», «sentar», «voto»… */
    k: string;
    d?: Datos;
}

/**
 * Un registro compartido: una partida o un programa. `gen` sube cuando se sustituye entero
 * (revancha, o compactación del diario); gana siempre el de mayor `gen`.
 */
export interface Registro {
    id: string;
    /** Qué motor lo interpreta: un IdJuego o «programa». */
    tipo: string;
    gen: number;
    creada: number;
    /** Configuración inicial: quién lo creó, opciones, semilla, y (programas) la especificación. */
    base: Datos;
    log: Entrada[];
    /**
     * true si el registro nuevo CONTINÚA al anterior (compactación): las entradas pendientes de
     * cada persona que no quedaron incluidas se vuelven a aplicar. false = otra partida.
     */
    continuidad?: boolean;
}

export type Resultado<E> = { ok: true; estado: E } | { ok: false; motivo: string };

/** Un intérprete de registros: estado inicial + regla pura de aplicar una entrada. */
export interface Motor<E> {
    inicial(base: Datos): E;
    aplicar(estado: E, entrada: Entrada): Resultado<E>;
    /** Resumen de una partida acabada (para el historial de la sala), o null si aún no acabó. */
    resumen?(estado: E, registro: Registro): ResumenPartida | null;
}

/** Un motor de cualquier estado (para el registro y el controlador, que no conocen el juego concreto). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MotorCualquiera = Motor<any>;

export interface ResumenPartida {
    id: string;
    juego: string;
    gen: number;
    /** Momento en que se cerró la partida. */
    t: number;
    /** Nombres de quienes se sentaron, por asiento. */
    nombres: string[];
    uids: string[];
    /** Asiento ganador; null = tablas / sin ganador. */
    ganador: number | null;
    motivo: string;
    /** Puntos por asiento (dibujo). */
    puntos?: number[];
}

/** Ajuste `extras`: datos sueltos de la sala que no son del diario (p. ej. el dibujo actual). */
export interface Extra {
    /** Versión (marca de tiempo): gana la mayor. */
    v: number;
    d: Json;
}

/** El documento que se guarda en `os_spaces.doc` de una sala de juego o de un programa. */
export interface DocSala {
    v: 1;
    vivo: { tipo: "juego" | "programa" };
    registro: Registro | null;
    historial: ResumenPartida[];
    extras: Record<string, Extra>;
}

export const LIMITE_HISTORIAL = 30;

/** Quien está en la sala (presencia). */
export interface Presente {
    uid: string;
    nombre: string;
}

export interface Yo {
    uid: string | null;
    nombre: string;
}

// ───────────────────────────── Mesa: asientos y reglas de cada juego ─────────────────────────────

export interface Asiento {
    uid: string;
    nombre: string;
}

/** Cómo terminó una partida. `ganador` es un asiento; null = nadie (tablas). */
export interface Fin {
    tipo: "victoria" | "tablas" | "rendicion" | "terminada";
    ganador: number | null;
    motivo: string;
}

/** Lo que un juego necesita saber de la mesa para validar una entrada. */
export interface ContextoMesa {
    asientos: (Asiento | null)[];
    /** Asientos que ocupa esa persona (una persona puede ocupar los dos en «jugar aquí»). */
    asientosDe(uid: string): number[];
}

export type ResultadoJuego<T> =
    | { ok: true; tablero: T; fin?: Fin | null }
    | { ok: false; motivo: string };

/** Las reglas puras de un juego de mesa. La mesa (`mesa.ts`) pone los asientos, la rendición, etc. */
export interface JuegoDeMesa<T> {
    id: IdJuego;
    nombre: string;
    /** Asientos mínimos y máximos. */
    jugadores: { min: number; max: number };
    /** ¿Empieza sola cuando se llenan los asientos? (si no, hay que pulsar «Empezar»). */
    autoInicio: boolean;
    inicial(opciones: Datos, semilla: number): T;
    /** Solo si `autoInicio` es false: prepara el tablero cuando alguien pulsa «Empezar» (con esos asientos ocupados). */
    alEmpezar?(tablero: T, asientosOcupados: number[], ahora: number): T;
    aplicar(tablero: T, entrada: Entrada, ctx: ContextoMesa): ResultadoJuego<T>;
    /** Asiento al que le toca mover, o null si no aplica. */
    turno(tablero: T): number | null;
}

/** Marca de tiempo máxima aceptada en el futuro (ms) para una entrada: evita relojes locos. */
export const DESFASE_MAX_MS = 5 * 60_000;
