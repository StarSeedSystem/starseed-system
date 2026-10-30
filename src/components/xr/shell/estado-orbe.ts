/**
 * StarSeed XR · ESTADO DEL ORBE DE ASTRAURA (XR1010O · contrato `architecture/starseed-xr.md` §3 a y f).
 *
 * Reductor PURO del orbe de Zenith. Las fases son las del contrato: reposo → escuchando →
 * pensando → hablando → reposo. `capa` dice qué capa de Astraura respondió (`capaDe` del núcleo
 * de voz) y el orbe la muestra; `nivelVoz` lo alimenta el analizador del micrófono. Nada aquí
 * toca red, disco, audio ni WebGL: la suscripción vive en el cascarón `orbe-astraura.tsx`.
 */
import { capaDe } from "../../../lib/xr/intenciones-voz";
import type { CapaIA, Intencion } from "../../../lib/xr/intenciones-tipos";
import { COLORES_NODO } from "../../../lib/xr/tokens-3d";

export type FaseOrbe = "reposo" | "escuchando" | "pensando" | "hablando";

export interface EstadoOrbe {
    fase: FaseOrbe;
    capa: CapaIA | null;
    nivelVoz: number;
    texto: string;
}

export type EventoOrbe =
    | { tipo: "escucha-inicio" }
    | { tipo: "escucha-fin"; texto?: string }
    | { tipo: "texto-parcial"; texto: string }
    | { tipo: "entendido"; capa: CapaIA }
    | { tipo: "entendido"; intencion: Intencion }
    | { tipo: "habla-inicio"; texto?: string }
    | { tipo: "habla-fin" }
    | { tipo: "nivel-voz"; nivel: number }
    | { tipo: "error"; texto?: string };

export interface ParametrosVisualesOrbe {
    radio: number;
    pulso: number;
    color: string;
    brillo: number;
}

export const ESTADO_ORBE_INICIAL: EstadoOrbe = Object.freeze({
    fase: "reposo",
    capa: null,
    nivelVoz: 0,
    texto: "",
});

export const TEXTO_ERROR_ORBE = "Astraura no ha podido responder. Inténtalo otra vez.";

const nivel = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Una transición del orbe. Nunca deja estados imposibles ni un bucle sin salida. */
export function siguienteEstadoOrbe(prev: EstadoOrbe, ev: EventoOrbe): EstadoOrbe {
    switch (ev.tipo) {
        case "escucha-inicio":
            return { fase: "escuchando", capa: null, nivelVoz: 0, texto: "" };
        case "texto-parcial":
            return { ...prev, fase: "escuchando", texto: ev.texto };
        case "escucha-fin":
            return { ...prev, fase: "pensando", nivelVoz: 0, texto: ev.texto ?? prev.texto };
        case "entendido":
            return { ...prev, fase: "pensando", capa: "capa" in ev ? ev.capa : capaDe(ev.intencion) };
        case "habla-inicio":
            return { ...prev, fase: "hablando", texto: ev.texto ?? prev.texto };
        case "habla-fin":
            return { ...prev, fase: "reposo", nivelVoz: 0 };
        case "nivel-voz":
            return { ...prev, nivelVoz: nivel(ev.nivel) };
        case "error":
            return { ...prev, fase: "reposo", capa: null, nivelVoz: 0, texto: ev.texto ?? TEXTO_ERROR_ORBE };
    }
}

const BASE: Record<FaseOrbe, { radio: number; pulso: number; brillo: number }> = {
    reposo: { radio: 0.16, pulso: 0.25, brillo: 0.55 },
    escuchando: { radio: 0.18, pulso: 0.55, brillo: 0.85 },
    pensando: { radio: 0.165, pulso: 0.45, brillo: 0.95 },
    hablando: { radio: 0.19, pulso: 0.7, brillo: 1 },
};

const redondear = (n: number): number => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/** Radio, pulso y brillo por fase, movidos por el nivel de voz. Con movimiento reducido, pulso = 0. */
export function parametrosVisuales(e: EstadoOrbe, reducido: boolean): ParametrosVisualesOrbe {
    const b = BASE[e.fase] ?? BASE.reposo;
    const v = nivel(e.nivelVoz);
    const activo = e.fase === "escuchando" || e.fase === "hablando";
    const pulso = reducido ? 0 : redondear(b.pulso + (activo ? v * 0.3 : 0));
    return {
        radio: Math.round((b.radio + (activo ? v * 0.06 : 0)) * 1000) / 1000,
        pulso,
        color: e.fase === "reposo" && e.capa === null ? COLORES_NODO.zenith.base : COLORES_NODO.zenith.vivo,
        brillo: redondear(b.brillo + (activo ? v * 0.15 : 0)),
    };
}

/** Evento `entendido` cuya capa sale de `capaDe`: el orbe muestra qué capa de Astraura respondió. */
export function eventoEntendido(intencion: Intencion): EventoOrbe {
    return { tipo: "entendido", capa: capaDe(intencion) };
}

/** Hasta `max` líneas no vacías para el texto 3D (nunca más de tres bajo el orbe). */
export function lineasDe(texto: string, max = 3): string[] {
    return texto
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean)
        .slice(0, Math.max(1, max));
}
