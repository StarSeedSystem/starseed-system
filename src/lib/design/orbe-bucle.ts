/**
 * ORBE DEL BOT — su estado visual desde el bucle (Ola 1024D · DAN1024D).
 * Módulo PURO: sin red, disco, reloj ni DOM. Traduce la fase del bucle del
 * bot (BOT1011) al estado de la orbe (DAN1024C) y entrega su preset con el
 * registro de movimiento del tema —«sobrio» por defecto— y el movimiento ya
 * reducido cuando la persona pidió menos animación (estado final, quieto).
 */

import type { FaseBucle } from "@/lib/astraura-bots/bucle";
import { presetOrbe, type EstadoOrbe, type PresetOrbe } from "@/lib/design/animaciones-orbe";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type MovimientoRegistro,
    type RegistroMovimiento,
} from "@/lib/design/registros-movimiento";

/** Registro por defecto de la orbe de los bots: sobrio, sin adornos. */
export const REGISTRO_ORBE_BOTS: RegistroMovimiento = "sobrio";

/** Fase del bucle → estado de la orbe. Escuchar, pensar, hablar o reposar. */
const POR_FASE: Record<FaseBucle, EstadoOrbe> = {
    reposo: "reposo",
    observando: "escucha",
    esperando: "piensa",
    actuando: "habla",
    hecho: "reposo",
    rechazado: "reposo",
};

/** Estado de la orbe para la fase actual del bot. */
export function estadoOrbeDeFase(fase: FaseBucle): EstadoOrbe {
    return POR_FASE[fase];
}

/** Movimiento de Astraura para la orbe; con `reducido` queda en 0 ms y escala 1. */
export function movimientoOrbe(
    registro: RegistroMovimiento = REGISTRO_ORBE_BOTS,
    reducido = false,
): MovimientoRegistro {
    const m = movimientoDe(registro, "astraura");
    return reducido ? aplicarMovimientoReducido(m) : m;
}

/** Preset de la orbe para la fase actual, con el registro efectivo. */
export function presetOrbeDeFase(
    fase: FaseBucle,
    registro: RegistroMovimiento = REGISTRO_ORBE_BOTS,
    reducido = false,
): PresetOrbe {
    return presetOrbe(estadoOrbeDeFase(fase), registro, reducido);
}
