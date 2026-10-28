/**
 * ANIMACIONES DE LA ORBE DE ASTRAURA (Ola 1024D)
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: los presets de animación de la orbe como DATO, uno por estado
 * («reposo», «escucha», «piensa», «habla» y la siembra, la firma de la marca).
 * Todo se deriva de `movimientoDe(registro, "astraura")` — nunca números de
 * vídeo (§6 de la skill claude-video-studio); solo se animan transform y opacity.
 */

import { DURACION } from "@/lib/design/movimiento";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";

/** Los cinco estados de la orbe de Astraura. */
export type EstadoOrbe = "reposo" | "escucha" | "piensa" | "habla" | "siembra";

/** Un preset: la orbe como DATO, listo para pintarse con CSS. */
export interface PresetOrbe {
    /** Escala mín y máx del `transform: scale()` durante un ciclo. */
    escala: [min: number, max: number];
    /** Duración de un ciclo de respiración (o de la siembra) en ms. */
    periodoMs: number;
    /** Opacidad mín y máx del brillo de la orbe. */
    brillo: [min: number, max: number];
    /** Giro continuo en grados por segundo (0 en la siembra). */
    giroGradosPorS: number;
    /** Ondas de anillo por ciclo; nunca > 3 destellos por segundo. */
    ondas: number;
    /** Solo la siembra: corre UNA vez y queda con `forwards`. */
    unico?: boolean;
}

/** Techo de amplitud al respirar: nunca pasar de 1,05 de escala. */
const ESCALA_TOPE = 1.05;

/** Redondeo a dos decimales, para un dato legible y estable. */
const afinar = (n: number): number => Math.round(n * 100) / 100;

/** El carácter de cada estado cíclico: `amplitud` multiplica el delta de
 *  escala del registro, `ritmo` ajusta su periodo, y cada estado fija sus
 *  ondas de anillo, su giro por ciclo (sobre el ángulo áureo de 137,5°) y
 *  el brillo de reposo. Duraciones y curvas NO se inventan: el periodo parte
 *  del registro y el resto son proporciones sobre él. */
const PAPEL: Record<Exclude<EstadoOrbe, "siembra">, { amplitud: number; ritmo: number; ondas: number; angulo: number; brilloMin: number }> = {
    // Reposo: la respiración del registro, tal cual; giro suave áureo.
    reposo: { amplitud: 1, ritmo: 1, ondas: 1, angulo: 137.5, brilloMin: 0.8 },
    // Escucha: respira más rápido y algo más ancho; dos ondas atentas.
    escucha: { amplitud: 1.6, ritmo: 0.85, ondas: 2, angulo: 275, brilloMin: 0.86 },
    // Piensa: respiración larga y baja; un cuarto de vuelta ordenado.
    piensa: { amplitud: 0.7, ritmo: 1.15, ondas: 1, angulo: 90, brilloMin: 0.7 },
    // Habla: ritmo vivo marcando la palabra, brillo que sube y baja.
    habla: { amplitud: 1.2, ritmo: 0.75, ondas: 2, angulo: 137.5, brilloMin: 0.76 },
};

/** Deriva el preset completo de un estado con su registro. */
export function presetOrbe(
    estado: EstadoOrbe,
    registro: RegistroMovimiento = "expresivo",
): PresetOrbe {
    if (estado === "siembra") {
        // La firma de la marca es la MISMA para todos los registros: punto →
        // dos círculos → ojo, cinco actos a ritmo de escena (480 ms × 5).
        return {
            escala: [0, 1],
            periodoMs: DURACION.escena * 5,
            brillo: [0, 1],
            giroGradosPorS: 0,
            ondas: 2,
            unico: true,
        };
    }
    const m = movimientoDe(registro, "astraura");
    const papel = PAPEL[estado];
    const periodoMs = Math.round(m.respiracion.periodoMs * papel.ritmo);
    return {
        // La escala respira de 1 al tope del registro, ampliado por el papel
        // del estado y nunca por encima del techo de la orbe (1,05).
        escala: [1, Math.min(ESCALA_TOPE, afinar(1 + (m.respiracion.escala - 1) * papel.amplitud))],
        periodoMs,
        brillo: [papel.brilloMin, 1],
        giroGradosPorS: afinar(papel.angulo / (periodoMs / 1000)),
        ondas: papel.ondas,
    };
}

/** Devuelve el texto de `@keyframes` del preset: solo `transform` y `opacity`.
 *  Con movimiento reducido, las paradas píntan el estado final quieto. */
export function cssKeyframesOrbe(preset: PresetOrbe, nombre = "orbe", reducido = false): string {
    const [escMin, escMax] = preset.escala;
    const [brilloMin, brilloMax] = preset.brillo;
    if (reducido) {
        // Estado final: escala natural y brillo pleno, sin giro ni pulso.
        return `@keyframes ${nombre}-reducido {\n  0%, 100% { transform: scale(1); opacity: ${brilloMax}; }\n}\n`;
    }
    if (preset.unico) {
        // La firma: punto → dos círculos → ojo. La sección áurea (61,8 %) abre
        // el ojo; el último 38 % queda quieto: la animación corre una sola vez
        // y el componente la deja con `forwards` y sin iterar.
        return (
            `@keyframes ${nombre}-siembra {\n` +
            `  0% { transform: scale(0); opacity: 0; }\n` +
            `  8% { transform: scale(0.13); opacity: 1; }\n` +
            `  27% { transform: scale(0.38); opacity: 0.9; }\n` +
            `  46% { transform: scale(0.62); opacity: 0.85; }\n` +
            `  61.8% { transform: scale(1); opacity: 1; }\n` +
            `  100% { transform: scale(1); opacity: 1; }\n` +
            `}\n`
        );
    }
    // Respiración: escala y brillo suben al 50 % y bajan; el giro avanza
    // sin detenerse durante todo el ciclo del registro.
    const ciclo = preset.periodoMs / 1000;
    const giro = afinar(preset.giroGradosPorS * ciclo);
    return (
        `@keyframes ${nombre} {\n` +
        `  0% { transform: scale(${escMin}) rotate(0deg); opacity: ${brilloMin}; }\n` +
        `  50% { transform: scale(${afinar((escMin + escMax) / 2)}) rotate(${afinar(giro / 2)}deg); opacity: ${afinar((brilloMin + brilloMax) / 2)}; }\n` +
        `  100% { transform: scale(${escMin}) rotate(${giro}deg); opacity: ${brilloMin}; }\n` +
        `}\n`
    );
}
