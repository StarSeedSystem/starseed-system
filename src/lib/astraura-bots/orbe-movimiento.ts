/**
 * ORBE DE LOS BOTS · PRESET DE MOVIMIENTO POR FASE (DAN1024D · Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: traduce la fase del bucle del bot a un `EstadoOrbe` de Astraura
 * y a su preset de animación. Las duraciones, escalas y curvas salen de
 * `animaciones-orbe.ts` y `movimiento.ts` — las ÚNICAS fuentes del OS —; aquí
 * no se inventa ninguna. Sin red, disco ni reloj. Solo se animan `transform` y
 * `opacity`; con `prefers-reduced-motion` el estado final queda quieto.
 */

import {
    cssKeyframesOrbe,
    presetOrbe,
    type EstadoOrbe,
} from "@/lib/design/animaciones-orbe";
import { CURVA } from "@/lib/design/movimiento";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type RegistroMovimiento,
} from "@/lib/design/registros-movimiento";
import type { QuantumOrbVoiceState } from "@/lib/aurora/quantum-orb-bus";
import type { FaseBucle } from "./bucle";

/** El bot en reposo se pinta con el registro sobrio: el carácter del OS. */
export const REGISTRO_ORBE_BOT: RegistroMovimiento = "sobrio";

/** Sección del ADN de movimiento que gobierna la orbe de Astraura. */
const SECCION = "astraura" as const;

const ESTADO_POR_FASE: Record<FaseBucle, EstadoOrbe> = {
    reposo: "reposo",
    observando: "escucha",
    esperando: "piensa",
    actuando: "habla",
    hecho: "reposo",
    rechazado: "reposo",
};

const AVATAR_POR_ESTADO: Record<EstadoOrbe, QuantumOrbVoiceState> = {
    reposo: "idle",
    escucha: "listening",
    piensa: "thinking",
    habla: "speaking",
    siembra: "idle",
};

/** La fase del bucle (o su ausencia) vista como estado de la orbe. */
export function estadoOrbeDeFase(fase: FaseBucle | undefined): EstadoOrbe {
    return fase ? ESTADO_POR_FASE[fase] : "reposo";
}

/** El estado equivalente del avatar cuántico de la orbe. */
export function estadoAvatarDeFase(fase: FaseBucle | undefined): QuantumOrbVoiceState {
    return AVATAR_POR_ESTADO[estadoOrbeDeFase(fase)];
}

/** Lo que la orbe necesita para latir con la voz del OS. */
export interface MovimientoOrbeBot {
    estado: EstadoOrbe;
    estadoAvatar: QuantumOrbVoiceState;
    /** Regla `animation` del latido; `"none"` cuando el movimiento está reducido. */
    animacion: string;
    /** `@keyframes` con nombre propio, listo para pintarse una vez por orbe. */
    keyframes: string;
    /** `transition` de la posición al arrastrar; `"none"` con movimiento reducido. */
    transicion: string;
}

/**
 * El movimiento completo de la orbe para una fase. Determinista: la misma fase,
 * el mismo registro y el mismo `reducido` devuelven siempre lo mismo. El latido
 * usa el periodo del preset (acotado por `presetOrbe`) y el arrastre la entrada
 * del registro de movimiento (la salida es más corta, pero aquí no hay salida).
 */
export function movimientoOrbeBot(
    fase: FaseBucle | undefined,
    registro: RegistroMovimiento = REGISTRO_ORBE_BOT,
    reducido = false,
): MovimientoOrbeBot {
    const estado = estadoOrbeDeFase(fase);
    const preset = presetOrbe(estado, registro, reducido);
    const base = movimientoDe(registro, SECCION);
    const movimiento = reducido ? aplicarMovimientoReducido(base) : base;
    const nombre = `orbebot-${estado}`;
    return {
        estado,
        estadoAvatar: AVATAR_POR_ESTADO[estado],
        animacion: preset.periodoMs > 0
            ? `${nombre} ${preset.periodoMs}ms ${CURVA.suave} infinite both`
            : "none",
        keyframes: cssKeyframesOrbe(preset).replace(/@keyframes\s+[^\s{]+/, `@keyframes ${nombre}`),
        transicion: reducido
            ? "none"
            : `left ${movimiento.entrada.ms}ms ${movimiento.entrada.curva}, top ${movimiento.entrada.ms}ms ${movimiento.entrada.curva}`,
    };
}
