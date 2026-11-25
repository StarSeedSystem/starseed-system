/**
 * CTL1118M · el modo «automático» inteligente del control entre neuronas. Módulo PURO (sin red, sin DOM, sin reloj propio).
 *
 * Qué decide, sin que la persona elija nada:
 *   · ÓRDENES (gestos, teclas, lecturas): el enlace directo vivo de MENOR latencia medida. Un enlace directo gana SIEMPRE a un relevo por otra
 *     neurona, a un TURN o al servidor mientras exista y esté abierto: lo que no es directo solo se usa si no queda ninguno directo.
 *   · PANTALLA (cuadros por la malla): el enlace directo de MÁS caudal (medido; si no hay medida, el nominal de su tipo, dicho como estimado).
 *   · Se reevalúa solo (al fallar y cada pocos segundos) con HISTÉRESIS: un enlace en uso no se deja por otro que no sea claramente mejor
 *     (≥ 30 % y ≥ 15 ms mejor en latencia; ≥ 50 % más de caudal) ni antes de `PERMANENCIA_MS`, salvo que el actual falle o desaparezca.
 *
 * Nada se inventa: sin medida, el enlace cuenta como «sin medir» y queda detrás de uno medido de su misma clase.
 */

import type { CandidatoMedio } from "@/lib/mensajeria/medios/tipos";
import { medioDeEnlaceUsado, type MedioReal, type TipoMedio } from "./medio";

/** Un enlace no se deja por otro antes de tanto tiempo (salvo que falle o se caiga). */
export const PERMANENCIA_MS = 6_000;
/** Cada cuánto se vuelve a mirar quién es el mejor. */
export const REEVALUAR_MS = 4_000;
/** Para dejar el enlace en uso por otro de latencia mejor: al menos esta fracción y estos ms. */
export const MEJORA_RTT_FRACCION = 0.3;
export const MEJORA_RTT_MS = 15;
/** Para dejar el enlace en uso por otro de más caudal: al menos esta fracción más. */
export const MEJORA_CAUDAL_FRACCION = 0.5;
/** Un enlace sin latencia medida cuenta como esto al ordenar (peor que cualquiera medido razonable, mejor que nada). */
export const RTT_SIN_MEDIR_MS = 400;

/** Caudal nominal por tipo de medio (kbit/s), SOLO para ordenar cuando no hay medida. Nunca se enseña como medido. */
export const CAUDAL_NOMINAL_KBPS: Readonly<Record<TipoMedio, number>> = {
    "wifi-directo": 20_000,
    "red-local": 20_000,
    internet: 4_000,
    nodo: 600,
    turn: 1_500,
    servidor: 300,
    bluetooth: 120,
    lora: 5,
};

export interface EnlaceAuto {
    enlaceId: string;
    medio: TipoMedio | null;
    directo: boolean;
    rttMs: number | null;
    /** Caudal medido (kbit/s) o, si no hay, el nominal de su tipo. */
    kbps: number;
    kbpsMedido: boolean;
}

export interface AutoPrevio {
    enlaceId: string;
    /** Desde cuándo está en uso (ms epoch). */
    desde: number;
}

export interface EleccionAuto {
    /** El enlace que debe llevar lo siguiente; null = ninguno directo vivo (las órdenes irán por el relevo, la pantalla no sale). */
    enlace: EnlaceAuto | null;
    previo: AutoPrevio | null;
    /** Cambió respecto al previo (hay que registrar `control-medio cambio`). */
    cambia: boolean;
    /** Palabra corta para el registro: por qué. */
    causa: "inicial" | "mejor-latencia" | "mas-caudal" | "fallo-del-anterior" | "anterior-caido" | "sin-directos" | "sigue";
}

export interface OpcionesAuto {
    ahora: number;
    esWifiDirecto?: (enlaceId: string) => boolean;
    /** Enlaces que acaban de fallar en un envío (se saltan). */
    fallidos?: ReadonlySet<string>;
    /** kbps medidos por enlace (de envíos de archivos o de cuadros anteriores). */
    caudalMedido?: ReadonlyMap<string, number>;
}

/** Los enlaces vivos hacia ese aparato, ya traducidos a medio real. Sin relevos (el relevo no es un enlace directo). */
export function enlacesAuto(candidatos: readonly CandidatoMedio[], o: OpcionesAuto): EnlaceAuto[] {
    const wd = o.esWifiDirecto ?? (() => false);
    const out: EnlaceAuto[] = [];
    for (const c of candidatos) {
        if (!c.abierto || !c.llega) continue;
        if (c.enlaceId.startsWith("relevo:")) continue;
        if (o.fallidos?.has(c.enlaceId)) continue;
        const real: MedioReal = medioDeEnlaceUsado(c, wd);
        const directo = real.camino === "directo";
        const medido = o.caudalMedido?.get(c.enlaceId);
        const cap = c.capacidadKbps;
        const m = typeof medido === "number" && medido > 0 ? medido : typeof cap === "number" && cap > 0 ? cap : null;
        out.push({
            enlaceId: c.enlaceId,
            medio: real.medio,
            directo,
            rttMs: typeof c.rttMs === "number" && Number.isFinite(c.rttMs) ? c.rttMs : null,
            kbps: m ?? (real.medio ? CAUDAL_NOMINAL_KBPS[real.medio] : CAUDAL_NOMINAL_KBPS.internet / 2),
            kbpsMedido: m !== null,
        });
    }
    return out;
}

const rttDe = (e: EnlaceAuto): number => e.rttMs ?? RTT_SIN_MEDIR_MS;

function porLatencia(a: EnlaceAuto, b: EnlaceAuto): number {
    return rttDe(a) - rttDe(b) || b.kbps - a.kbps || (a.enlaceId < b.enlaceId ? -1 : 1);
}
function porCaudal(a: EnlaceAuto, b: EnlaceAuto): number {
    return b.kbps - a.kbps || rttDe(a) - rttDe(b) || (a.enlaceId < b.enlaceId ? -1 : 1);
}

type Criterio = "latencia" | "caudal";

function elegir(lista: readonly EnlaceAuto[], previo: AutoPrevio | null, criterio: Criterio, o: OpcionesAuto): EleccionAuto {
    // Un directo gana siempre a lo que no lo es: lo que no es directo ni se considera si queda algún directo.
    const directos = lista.filter((e) => e.directo);
    const pool = directos;
    if (!pool.length) {
        return { enlace: null, previo: null, cambia: previo !== null, causa: "sin-directos" };
    }
    const orden = [...pool].sort(criterio === "latencia" ? porLatencia : porCaudal);
    const mejor = orden[0];
    const actual = previo ? pool.find((e) => e.enlaceId === previo.enlaceId) : undefined;
    if (!previo) return { enlace: mejor, previo: { enlaceId: mejor.enlaceId, desde: o.ahora }, cambia: true, causa: "inicial" };
    if (!actual) {
        const fallo = !!o.fallidos?.has(previo.enlaceId);
        return { enlace: mejor, previo: { enlaceId: mejor.enlaceId, desde: o.ahora }, cambia: true, causa: fallo ? "fallo-del-anterior" : "anterior-caido" };
    }
    if (mejor.enlaceId === actual.enlaceId) return { enlace: actual, previo, cambia: false, causa: "sigue" };
    // El anterior sigue vivo: solo se deja por uno CLARAMENTE mejor y pasado el tiempo de permanencia.
    if (o.ahora - previo.desde < PERMANENCIA_MS) return { enlace: actual, previo, cambia: false, causa: "sigue" };
    if (criterio === "latencia") {
        const dif = rttDe(actual) - rttDe(mejor);
        const claro = dif >= MEJORA_RTT_MS && dif >= rttDe(actual) * MEJORA_RTT_FRACCION && (mejor.rttMs !== null || actual.rttMs === null);
        if (claro) return { enlace: mejor, previo: { enlaceId: mejor.enlaceId, desde: o.ahora }, cambia: true, causa: "mejor-latencia" };
    } else if (mejor.kbps >= actual.kbps * (1 + MEJORA_CAUDAL_FRACCION)) {
        return { enlace: mejor, previo: { enlaceId: mejor.enlaceId, desde: o.ahora }, cambia: true, causa: "mas-caudal" };
    }
    return { enlace: actual, previo, cambia: false, causa: "sigue" };
}

/** El enlace de las ÓRDENES: el directo de menor latencia, con histéresis. */
export function elegirOrdenesAuto(lista: readonly EnlaceAuto[], previo: AutoPrevio | null, o: OpcionesAuto): EleccionAuto {
    return elegir(lista, previo, "latencia", o);
}

/** El enlace de la PANTALLA: el directo de más caudal, con histéresis. */
export function elegirPantallaAuto(lista: readonly EnlaceAuto[], previo: AutoPrevio | null, o: OpcionesAuto): EleccionAuto {
    return elegir(lista, previo, "caudal", o);
}

/** ¿Hay que volver a mirar ya? (cada `REEVALUAR_MS`, o ahora si el último envío falló). */
export function tocaReevaluar(ultima: number, ahora: number, fallo: boolean): boolean {
    return fallo || ahora - ultima >= REEVALUAR_MS;
}

/**
 * CTL1124F · quién pide abrir una sesión de control. Solo una pulsación de la persona («Pedir controlarla desde
 * aquí» o «Abrir ventana de control») abre o reabre; latidos, sondeos, reintentos y eventos automáticos no.
 */
export type QuienPideAbrir = "persona" | "automatico";

/**
 * CTL1124F · tras una parada terminal (la persona terminó, la otra neurona terminó por el dueño, se apagó el
 * permiso…) nada automático reabre la sesión: hace falta otra pulsación de la persona.
 */
export function puedeAbrirSesion(quien: QuienPideAbrir, paradaTerminal: boolean): boolean {
    return quien === "persona" || !paradaTerminal;
}

/** `control-medio cambio de=… a=… causa=… ms=N kbps=N` (mismo estilo clave=valor que el resto de líneas `control-*`). */
export function lineaCambioMedio(p: { de: EnlaceAuto | MedioReal | null; a: EnlaceAuto | null; causa: string; ms: number | null; kbps: number | null; uso?: "ordenes" | "pantalla" }): string {
    const ficha = (x: EnlaceAuto | MedioReal | null): string => {
        if (!x) return "ninguno";
        if ("enlaceId" in x) return `directo:${x.medio ?? "ruta-sin-medir"}`;
        return x.camino === "sin-determinar" ? "sin-determinar" : `${x.camino === "capa" ? "capa" : "directo"}:${x.medio ?? "ruta-sin-medir"}`;
    };
    const num = (n: number | null) => (n === null || !Number.isFinite(n) ? "sin-medir" : String(Math.max(0, Math.round(n))));
    return `control-medio cambio uso=${p.uso ?? "ordenes"} de=${ficha(p.de)} a=${ficha(p.a)} causa=${/^[a-z-]{1,32}$/.test(p.causa) ? p.causa : "otra"} ms=${num(p.ms)} kbps=${num(p.kbps)}`;
}
