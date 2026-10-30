/**
 * StarSeed XR · ESTADO DEL ORBE DE ASTRAURA (XR1010O, contrato §3 a y f). Módulo PURO: sin React,
 * sin red, sin WebGL; funciona igual en un visor o probándose en node con vitest. Traduce los
 * acontecimientos de la conversación (que XR1010P alimenta desde el bus de Aurora) en una sola
 * máquina de estados con 4 fases y una capa: REPOSO → ESCUCHANDO → PENSANDO → HABLANDO → reposo.
 * La capa la rellena `capaDe` de `intenciones-voz.ts` (qué capa de Astraura respondió) y el orbe la muestra.
 * Nunca deja a nadie en bucle: cualquier `error` devuelve a reposo con un texto humano.
 */
import type { CapaIA } from "../../../lib/xr/intenciones-voz";
import { COLORES_NODO } from "../../../lib/xr/tokens-3d";

export type FaseOrbe = "reposo" | "escuchando" | "pensando" | "hablando";
export type CapaOrbe = CapaIA;

export interface EstadoOrbe {
    fase: FaseOrbe;
    capa: CapaOrbe | null;
    /** Amplitud del micrófono 0..1 (`acquireMicAnalyser`); solo se usa como intensidad visual. */
    nivelVoz: number;
    /** Texto parcial dictado y, tras responder, la última respuesta (esta se conserva). */
    texto: string;
}

export type EventoOrbe =
    | { tipo: "escucha-inicio" }
    | { tipo: "escucha-fin" }
    | { tipo: "texto-parcial"; texto: string }
    | { tipo: "entendido"; capa: CapaOrbe }
    | { tipo: "habla-inicio" }
    | { tipo: "habla-fin" }
    | { tipo: "error"; mensaje: string };

const CARACTERES = 64;

export const ORBE_REPOSO: EstadoOrbe = { fase: "reposo", capa: null, nivelVoz: 0, texto: "" };

/** Reductor principal: (estado, acontecimiento) → estado. */
export function siguienteEstadoOrbe(prev: EstadoOrbe, ev: EventoOrbe): EstadoOrbe {
    switch (ev.tipo) {
        case "escucha-inicio":
            // Nueva escucha: se borra lo dictado y la capa; el nivel de voz se conserva.
            return { fase: "escuchando", capa: null, nivelVoz: prev.nivelVoz, texto: "" };
        case "escucha-fin":
            // Solo cierra la escucha; si ya se está pensando o hablando no corta nada (nunca un bucle).
            return prev.fase === "escuchando" ? { ...prev, fase: "reposo" } : prev;
        case "texto-parcial":
            // El parcial SIEMPRE sustituye al anterior; conservado tras responder (última respuesta).
            return { ...prev, texto: ev.texto };
        case "entendido":
            // La capa se rellena aquí (viene de `capaDe`); nada lo vacía hasta la escucha o un error.
            return prev.fase === "hablando" ? prev : { ...prev, fase: "pensando", capa: ev.capa };
        case "habla-inicio":
            // Si se habla, se ha entendido: la capa anterior sigue y se enseña.
            return { ...prev, fase: "hablando" };
        case "habla-fin":
            return { ...prev, fase: "reposo", nivelVoz: 0 }; // el texto se queda: es la última respuesta
        case "error":
            // Vuelta a reposo SIEMPRE, con qué pasó en el texto: jamás se deja pensando o escuchando.
            return { fase: "reposo", capa: null, nivelVoz: 0, texto: ev.mensaje };
    }
}

/** Nivel de voz entrado por fuera (analizador): acotado a 0..1, sin fondo, sin NaN. */
export function conNivelVoz(e: EstadoOrbe, nivel: number): EstadoOrbe {
    const limpio = Number.isFinite(nivel) ? Math.min(1, Math.max(0, nivel)) : 0;
    return { ...e, nivelVoz: limpio };
}

/** Etiqueta visible de la capa que respondió («el orbe la muestra»). */
export function etiquetaCapa(capa: CapaOrbe | null): string {
    return capa === null ? "" : capa === "razon" ? "respondió con la capa razón" : capa === "palabra" ? "respondió con la capa palabra" : "respondió con la capa reflejo";
}

/** Máximo de líneas del texto bajo el orbe; lo demás se corta con «…». */
export function textoOrbe(texto: string, maxLineas = 3): string {
    const limpio = texto.trim();
    if (!limpio || maxLineas < 1) return "";
    const lineas: string[] = [];
    let actual = "";
    for (const palabra of limpio.split(/\s+/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (prueba.length > CARACTERES && actual) {
            lineas.push(actual);
            actual = palabra;
        } else {
            actual = prueba;
        }
    }
    if (actual) lineas.push(actual);
    return lineas.length <= maxLineas ? lineas.join("\n") : `${lineas.slice(0, maxLineas).join("\n")} …`;
}

export interface ParamsOrbe {
    /** Radio de la esfera en metros (crece con `nivelVoz`); fijo con movimiento reducido. */
    radio: number;
    /** Intensidad del latido 0..1; 0 en reposo y siempre 0 con movimiento reducido (§3 j). */
    pulso: number;
    /** Color de `COLORES_NODO.zenith`: `base` en reposo, `vivo` en escucha/pensamiento/habla. */
    color: string;
    /** Brillo del material 0..1 por fase. */
    brillo: number;
}

const RADIO_REPOSO = 0.12;
const BRILLO_FASE: Record<FaseOrbe, number> = { reposo: 0.55, escuchando: 0.95, pensando: 0.75, hablando: 1 };
const LATIDO_FASE: Record<FaseOrbe, number> = { reposo: 0.25, escuchando: 0.5, pensando: 0.65, hablando: 1 };

/** Parámetros visuales del orbe para una fase, corte y movimiento reducido. */
export function parametrosVisuales(e: EstadoOrbe, reducido: boolean): ParamsOrbe {
    const hablando = e.fase === "hablando";
    const radio = !reducido && e.fase !== "reposo" ? RADIO_REPOSO * (1 + e.nivelVoz * 0.35) : RADIO_REPOSO;
    const pulso = reducido ? 0 : hablando ? Math.min(1, LATIDO_FASE.hablando * (0.4 + e.nivelVoz * 0.6)) : LATIDO_FASE[e.fase];
    return { radio, pulso, color: e.fase === "reposo" ? COLORES_NODO.zenith.base : COLORES_NODO.zenith.vivo, brillo: BRILLO_FASE[e.fase] };
}

