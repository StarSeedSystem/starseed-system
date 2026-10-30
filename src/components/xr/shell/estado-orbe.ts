/**
 * StarSeed XR · ESTADO DEL ORBE DE ASTRAURA — Zenith (XR1010O · contrato `architecture/starseed-xr.md`
 * §3 a y f). Reductor puro del ciclo reposo → escuchando → pensando → hablando → reposo, y los
 * parámetros visuales del orbe (radio, pulso, color, brillo) a partir de `COLORES_NODO.zenith`; con
 * movimiento reducido el pulso es 0. Reutiliza `capaDe` de `intenciones-voz`: el orbe muestra qué capa
 * de Astraura respondió. El componente fino vive en `orbe-astraura.tsx`. Módulo PURO.
 */
import { COLORES_NODO } from "../../../lib/xr/tokens-3d";
import type { CapaIA } from "../../../lib/xr/intenciones-tipos";

export type FaseOrbe = "reposo" | "escuchando" | "pensando" | "hablando";
export type CapaOrbe = CapaIA;

export interface EstadoOrbe {
    fase: FaseOrbe;
    capa: CapaOrbe | null;
    /** Nivel real del micrófono (0..1, del analizador del bus de Aurora) o del TTS. */
    nivelVoz: number;
    /** Último texto: parcial de escucha, respuesta de Astraura o motivo de error. */
    texto: string;
}

export const ESTADO_ORBE_INICIAL: EstadoOrbe = { fase: "reposo", capa: null, nivelVoz: 0, texto: "" };

export type EventoOrbe =
    | { tipo: "escucha-inicio" }
    | { tipo: "escucha-fin" }
    | { tipo: "texto-parcial"; texto: string }
    | { tipo: "entendido"; capa: CapaOrbe }
    | { tipo: "habla-inicio"; texto: string }
    | { tipo: "habla-fin" }
    | { tipo: "error"; texto: string }
    | { tipo: "voz"; nivel: number };

const acotar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Nunca deja a la persona en bucle: cualquier camino desemboca en `reposo` y el texto siempre se cuenta. */
export function siguienteEstadoOrbe(prev: EstadoOrbe, ev: EventoOrbe): EstadoOrbe {
    switch (ev.tipo) {
        case "escucha-inicio":
            return { ...prev, fase: "escuchando", capa: null, nivelVoz: 0, texto: "" };
        case "texto-parcial":
            // Solo mientras escucha: un parcial tardío no pisa la respuesta final.
            return prev.fase === "escuchando" ? { ...prev, texto: ev.texto } : prev;
        case "escucha-fin":
            return prev.fase === "escuchando" ? { ...prev, fase: "pensando" } : prev;
        case "entendido":
            return { ...prev, capa: ev.capa };
        case "habla-inicio":
            return { ...prev, fase: "hablando", texto: ev.texto };
        case "habla-fin":
            return prev.fase === "hablando" ? { ...prev, fase: "reposo" } : prev;
        case "error":
            return { ...prev, fase: "reposo", capa: null, texto: ev.texto };
        case "voz":
            return { ...prev, nivelVoz: acotar(ev.nivel, 0, 1) };
    }
}

export interface ParametrosVisualesOrbe {
    /** Radio de la esfera, en metros. */
    radio: number;
    /** Amplitud de la pulsación en useFrame; con movimiento reducido es 0. */
    pulso: number;
    color: string;
    /** Intensidad del material (0..1): reposo la más tenue, hablando la más viva. */
    brillo: number;
}

const ZENITH = COLORES_NODO.zenith;

/** Apariencia del orbe para la fase y el nivel de voz dados. Ningún color se inventa fuera de los tokens. */
export function parametrosVisuales(e: EstadoOrbe, reducido: boolean): ParametrosVisualesOrbe {
    const nivel = acotar(e.nivelVoz, 0, 1);
    switch (e.fase) {
        case "reposo":
            return { radio: 0.1 + nivel * 0.01, pulso: reducido ? 0 : 0.1, color: ZENITH.base, brillo: 0.5 };
        case "escuchando":
            return { radio: 0.11 + nivel * 0.04, pulso: reducido ? 0 : 0.6, color: ZENITH.vivo, brillo: 0.85 };
        case "pensando":
            return { radio: 0.11 + nivel * 0.04, pulso: reducido ? 0 : 0.45, color: ZENITH.vivo, brillo: 0.7 };
        case "hablando":
            return { radio: 0.13 + nivel * 0.03, pulso: reducido ? 0 : 0.8, color: ZENITH.vivo, brillo: 1 };
    }
}
