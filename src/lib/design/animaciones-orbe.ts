/**
 * ANIMACIONES DE LA ORBE — estados de Astraura (DAN1024C · Ola 1024D)
 * Módulo PURO: sin red, disco, reloj ni DOM. Traduce el carácter del registro
 * (DAN1024B) a los cinco estados de la orbe y a su `@keyframes` CSS. Solo se
 * animan `transform` y `opacity`; escala y periodo salen de
 * `movimientoDe(registro, "astraura")`, la única fuente de movimiento del OS.
 * La «siembra» es la firma de la marca: punto → dos círculos → ojo, 2.400 ms
 * y una sola vez. Con `reducido` el estado final se pinta quieto, sin ondas.
 */

import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";

export type EstadoOrbe = "reposo" | "escucha" | "piensa" | "habla" | "siembra";

export interface PresetOrbe {
    escala: [number, number];
    periodoMs: number;
    brillo: [number, number];
    giroGradosPorS: number;
    ondas: number;
}

/** La siembra dura 2.400 ms y no se repite: es la firma de la marca. */
export const SIEMBRA_MS = 2400;

/** Ningún estado supera tres destellos por segundo. */
export const DESTELLOS_MAX_POR_SEGUNDO = 3;

interface ConfigEstado {
    factorPeriodo: number;
    factorEscala: number;
    brillo: [number, number];
    giro: number;
    ondas: number;
}

const CONFIG: Record<EstadoOrbe, ConfigEstado> = {
    reposo: { factorPeriodo: 1.4, factorEscala: 0.6, brillo: [0.55, 0.78], giro: 3, ondas: 0 },
    escucha: { factorPeriodo: 1, factorEscala: 1, brillo: [0.6, 0.9], giro: 10, ondas: 2 },
    piensa: { factorPeriodo: 0.8, factorEscala: 0.8, brillo: [0.45, 0.85], giro: 28, ondas: 1 },
    habla: { factorPeriodo: 0.65, factorEscala: 1.4, brillo: [0.7, 0.98], giro: 14, ondas: 3 },
    siembra: { factorPeriodo: 0, factorEscala: 0, brillo: [0, 1], giro: 0, ondas: 2 },
};

function redondear(n: number, decimales = 3): number {
    const factor = 10 ** decimales;
    return Math.round(n * factor) / factor;
}

function acotar(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/** Preset de un estado, derivado del movimiento de Astraura con ese registro. */
export function presetOrbe(
    estado: EstadoOrbe,
    registro: RegistroMovimiento,
    reducido = false,
): PresetOrbe {
    if (reducido) {
        return { escala: [1, 1], periodoMs: 0, brillo: [1, 1], giroGradosPorS: 0, ondas: 0 };
    }

    const c = CONFIG[estado];
    const e = movimientoDe(registro, "astraura").respiracion.escala;
    const empuje = estado === "siembra" ? 0 : (e - 1) * 2;
    const bMin = redondear(acotar(c.brillo[0] + empuje, 0, 1));
    const bMax = redondear(acotar(c.brillo[1] + empuje, 0, 1));

    if (estado === "siembra") {
        return { escala: [0.08, 1], periodoMs: SIEMBRA_MS, brillo: [bMin, bMax], giroGradosPorS: 0, ondas: c.ondas };
    }

    const delta = (e - 1) * c.factorEscala;
    const bruto = movimientoDe(registro, "astraura").respiracion.periodoMs * c.factorPeriodo;
    const periodoMs = Math.round(acotar(bruto, 1000, 6000) / 10) * 10;

    return {
        escala: [redondear(1 - delta * 0.6), redondear(1 + delta)],
        periodoMs,
        brillo: [bMin, bMax],
        giroGradosPorS: Math.round(c.giro * (1 + (e - 1) * 8)),
        ondas: c.ondas,
    };
}

/** Cuántas veces se reproduce el estado: la siembra, una sola vez. */
export function repeticionesDe(estado: EstadoOrbe): number {
    return estado === "siembra" ? 1 : Infinity;
}

/** Registro por defecto para bots Orbe. */
export const REGISTRO_ORBE_BOT: RegistroMovimiento = "sobrio";

/** Mapea un estado de orbe a una fase (para la UI/voz). */
export function estadoOrbeDeFase(estado: EstadoOrbe | undefined): string {
    if (estado === undefined) return "reposo";
    switch (estado) {
        case "reposo": return "reposo";
        case "escucha": return "observando";
        case "piensa": return "pensando";
        case "habla": return "actuando";
        case "siembra": return "siembra";
        default: return "reposo";
    }
}

/** Mapea una fase del voz a un estado de avatar. */
export function estadoAvatarDeFase(etapa: string | undefined): string {
    if (etapa === undefined) return "idle";
    switch (etapa) {
        case "observando": return "listening";
        case "esperando": return "thinking";
        case "actuando": return "speaking";
        default: return "idle";
    }
}

/** Output de la función movimientoOrbeBot. */
export interface MovimientoOrbeBotOutput {
    estado: string;
    animacion: string;
    transicion: string;
    keyframes: string;
}

/** Mapeo de fases a estados de orbe. */
const estadoPorFase: Record<string, string> = {
    observando: "escucha",
    esperando: "pensando",
    actuando: "habla",
    reposo: "reposo",
};

/** Genera la configuración de movimiento para un orbe bot. */
export function movimientoOrbeBot(
    fase: string,
    registro: RegistroMovimiento = REGISTRO_ORBE_BOT,
    reducido = false,
): MovimientoOrbeBotOutput {
    const estado = estadoPorFase[fase] || "reposo";
    const configuracionAnim: Record<RegistroMovimiento, string> = {
        sobrio: "orbebot-escucha",
        expresivo: "orbebot-expresivo",
        experimental: "orbebot-experimental",
    };
    const prefix = configuracionAnim[registro] || "orbebot-escucha";

    if (reducido) {
        return {
            estado,
            animacion: "none",
            transicion: "none",
            keyframes: `@keyframes orbebot-reposo { 0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; } }`,
        };
    }

    const { entrada } = movimientoDe(registro, "astraura");
    const transicion = `left ${entrada.ms}ms ${entrada.curva}, top ${entrada.ms}ms ${entrada.curva}`;

    return {
        estado,
        animacion: `${prefix} `,
        transicion,
        keyframes: `@keyframes orbebot-${fase} { 0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; } }`,
    };
}

/** Texto `@keyframes` del preset: solo `transform` y `opacity`. */
export function cssKeyframesOrbe(preset: PresetOrbe): string {
    const [sMin, sMax] = preset.escala;
    const [bMin, bMax] = preset.brillo;
    if (preset.periodoMs <= 0) {
        return `@keyframes orbe-quieto {\n  0%, 100% { transform: scale(1) rotate(0deg); opacity: ${bMax}; }\n}`;
    }
    if (preset.periodoMs === SIEMBRA_MS) {
        return [
            "@keyframes orbe-siembra {",
            "  0% { transform: scale(0) rotate(0deg); opacity: 0; }",
            "  25% { transform: scale(0.12) rotate(0deg); opacity: 1; }",
            "  55% { transform: scale(0.62) rotate(0deg); opacity: 1; }",
            "  100% { transform: scale(1) rotate(0deg); opacity: 1; }",
            "}",
        ].join("\n");
    }
    const vueltas = redondear((preset.giroGradosPorS * preset.periodoMs) / 4000);
    const giro = (signo: 1 | -1): string => `${signo < 0 ? "-" : ""}${vueltas}deg`;
    return [
        "@keyframes orbe-respira {",
        `  0% { transform: scale(${sMin}) rotate(${giro(-1)}); opacity: ${bMin}; }`,
        `  50% { transform: scale(${sMax}) rotate(${giro(1)}); opacity: ${bMax}; }`,
        `  100% { transform: scale(${sMin}) rotate(${giro(-1)}); opacity: ${bMin}; }`,
        "}",
    ].join("\n");
}
