/**
 * Movimiento de la orbe del bot (BOT1011 · DAN1024D).
 *
 * Rescata los casos de la rama nube/40800324768 adaptados a la API de hoy:
 * la antigua `movimientoOrbeBot` se partió en `estadoOrbeDeFase` y
 * `presetOrbeDeFase` (src/lib/design/orbe-bucle.ts), así que se prueban los
 * contratos de esa API que main todavía no fijaba: el arrastre toma la
 * entrada del registro de movimiento, ninguna fase activa se congela y el
 * estado sigue siendo el real cuando la persona pide menos animación.
 */
import { describe, it, expect } from "vitest";
import type { FaseBucle } from "../bucle";
import {
    REGISTRO_ORBE_BOTS,
    estadoOrbeDeFase,
    movimientoOrbe,
    presetOrbeDeFase,
} from "@/lib/design/orbe-bucle";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import { cssKeyframesOrbe, type EstadoOrbe } from "@/lib/design/animaciones-orbe";

const FASES: FaseBucle[] = ["reposo", "observando", "esperando", "actuando", "hecho", "rechazado"];
const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const ACTIVAS: FaseBucle[] = ["observando", "esperando", "actuando"];
const ESPERADO: Record<FaseBucle, EstadoOrbe> = {
    reposo: "reposo",
    observando: "escucha",
    esperando: "piensa",
    actuando: "habla",
    hecho: "reposo",
    rechazado: "reposo",
};

describe("movimientoOrbe · el arrastre usa la entrada del registro", () => {
    it("toma duración y curva de movimientoDe(registro, \"astraura\")", () => {
        for (const registro of REGISTROS) {
            const mov = movimientoOrbe(registro);
            expect(mov.entrada).toEqual(movimientoDe(registro, "astraura").entrada);
            expect(mov.salida).toEqual(movimientoDe(registro, "astraura").salida);
        }
    });

    it("no deja la transición a mano: hay entrada y la salida no la supera", () => {
        for (const registro of REGISTROS) {
            const mov = movimientoOrbe(registro);
            expect(mov.entrada.ms).toBeGreaterThan(0);
            expect(mov.entrada.ms).not.toBe(200);
            expect(mov.salida.ms).toBeLessThanOrEqual(mov.entrada.ms);
        }
        expect(movimientoOrbe()).toEqual(movimientoOrbe(REGISTRO_ORBE_BOTS));
    });
});

describe("orbe activa · nunca se congela", () => {
    it("cada fase activa respira en todos los registros", () => {
        for (const registro of REGISTROS) {
            for (const fase of ACTIVAS) {
                const preset = presetOrbeDeFase(fase, registro);
                expect(preset.periodoMs).toBeGreaterThan(0);
                expect(preset.escala[0]).toBeLessThan(preset.escala[1]);
                expect(preset.escala[1]).toBeGreaterThan(1);
            }
        }
    });

    it("sin bucle todavía (reposo) también respira, sin ondas", () => {
        const preset = presetOrbeDeFase("reposo");
        expect(preset.periodoMs).toBeGreaterThan(0);
        expect(preset.ondas).toBe(0);
        expect(cssKeyframesOrbe(preset)).toContain("@keyframes orbe-respira");
    });
});

describe("estado real con movimiento reducido", () => {
    it("la fase sigue siendo la real aunque la orbe quede quieta", () => {
        for (const fase of FASES) {
            expect(estadoOrbeDeFase(fase)).toBe(ESPERADO[fase]);
            const quieta = presetOrbeDeFase(fase, "sobrio", true);
            expect(quieta.periodoMs).toBe(0);
            expect(quieta.escala).toEqual([1, 1]);
            expect(quieta.ondas).toBe(0);
            expect(cssKeyframesOrbe(quieta)).toContain("@keyframes orbe-quieto");
        }
    });
});
