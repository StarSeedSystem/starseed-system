"use client";

/**
 * VOTOS DE VOZ — el 👍/👎 de cada respuesta hablada (contrato
 * `architecture/voz-voicestudio.md` §4 «Se mejora sola»): junto a las medidas
 * de latencia (`medidas-voz.ts`), el pulgar de la persona ordena al elector
 * de voz (`voz-starseed/elector-aprende.ts`) para el siguiente mensaje. El
 * voto es de la PERSONA, no de la neurona; queda SOLO en esta neurona (nunca
 * sale de ella) y se recorta a los más recientes, como las medidas.
 * Almacenamiento y reloj inyectables; nada lanza.
 */

import { safeGet, safeRemove, safeSet } from "@/lib/safe-storage";

/** Lo que la persona dijo de la respuesta hablada por un motor: 👍 o 👎. */
export type PulgarVoz = 1 | -1;

/** Un voto guardado: el motor que habló y la decisión de la persona, con hora. */
export interface VotoVoz {
    motor: string;
    voto: PulgarVoz;
    timestamp: number;
}

export const CLAVE_VOTOS_VOZ = "starseed.voz.votos.v1";
/** Los más recientes que se guardan (los demás salen con el recorte). */
export const MAX_VOTOS_TOTAL = 200;

/** Lo que el módulo toca fuera de sí mismo (las pruebas lo sustituyen). */
export interface DepsVotos {
    leer: (clave: string) => string | null;
    /** Devuelve false si no quedó guardado en disco (cuota llena, modo privado). */
    escribir: (clave: string, valor: string) => boolean | void;
    borrar: (clave: string) => void;
    ahora: () => number;
}

const DEPS: DepsVotos = {
    leer: safeGet,
    escribir: safeSet,
    borrar: safeRemove,
    ahora: () => Date.now(),
};

const con = (d?: Partial<DepsVotos>): DepsVotos => (d ? { ...DEPS, ...d } : DEPS);

const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Un voto bien formado (o null): motor limpio, 👍/👎 entero y hora con sentido. */
function votoValido(x: unknown): VotoVoz | null {
    if (!x || typeof x !== "object") return null;
    const r = x as Record<string, unknown>;
    const voto = typeof r.voto === "number" && (r.voto === 1 || r.voto === -1) ? (r.voto as PulgarVoz) : null;
    if (!esTexto(r.motor) || voto === null || typeof r.timestamp !== "number" || !Number.isFinite(r.timestamp)) return null;
    return { motor: r.motor.trim().slice(0, 64), voto, timestamp: r.timestamp };
}

/** Lo guardado ya limpio, del más antiguo al más reciente; lo ilegible, fuera. */
function leerTodos(d: DepsVotos): VotoVoz[] {
    const crudo = d.leer(CLAVE_VOTOS_VOZ);
    if (!crudo) return [];
    let datos: unknown;
    try {
        datos = JSON.parse(crudo);
    } catch {
        return [];
    }
    return Array.isArray(datos) ? datos.map(votoValido).filter((v): v is VotoVoz => v !== null) : [];
}

/** Los votos de voz guardados en esta neurona (vacío si no hay o el almacén no se lee). */
export function leerVotos(deps?: Partial<DepsVotos>): VotoVoz[] {
    try {
        return leerTodos(con(deps));
    } catch {
        return [];
    }
}

/**
 * anotarVoto — guarda un 👍/👎 para el motor de voz que habló la respuesta
 * (con la hora del reloj) y recorta la lista al tope. Devuelve si quedó
 * guardado; sin almacenamiento devuelve false y la valoración sigue igual.
 */
export function anotarVoto(
    p: { motor: string; voto: PulgarVoz },
    deps?: Partial<DepsVotos>,
): boolean {
    try {
        const d = con(deps);
        const voto = votoValido({ motor: p.motor, voto: p.voto, timestamp: d.ahora() });
        if (!voto) return false;
        return d.escribir(CLAVE_VOTOS_VOZ, JSON.stringify([...leerTodos(d), voto].slice(-MAX_VOTOS_TOTAL))) !== false;
    } catch {
        return false; // sin almacenamiento: la voz sigue igual
    }
}
