/**
 * Movimiento de la orbe de los bots (BOT1011 · rescate de RTCVV1028M).
 *
 * Rescata los casos de la rama nube/40800324768 que main todavía no fijaba,
 * adaptados a la API de hoy: la antigua `movimientoOrbeBot` se partió en
 * `estadoOrbeDeFase` y `presetOrbeDeFase` (`src/lib/design/orbe-bucle.ts`);
 * `estadoAvatarDeFase` (listening/thinking/idle) ya no existe — contrato
 * descartado. Pruebas puras: sin DOM, red, reloj ni `node:*`.
 */
import { describe, it, expect } from "vitest";
import type { FaseBucle } from "../bucle";
import { presetOrbe, cssKeyframesOrbe } from "@/lib/design/animaciones-orbe";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import { REGISTRO_ORBE_BOTS, estadoOrbeDeFase, movimientoOrbe, presetOrbeDeFase } from "@/lib/design/orbe-bucle";

const FASES: FaseBucle[] = ["reposo", "observando", "esperando", "actuando", "hecho", "rechazado"];
const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];

describe("movimientoOrbe — la identidad del gesto", () => {
    it("entrada y salida salen del registro de movimiento, no de un valor fijo", () => {
        for (const registro of REGISTROS) {
            const mov = movimientoOrbe(registro);
            expect(mov.entrada).toEqual(movimientoDe(registro, "astraura").entrada);
            expect(mov.salida).toEqual(movimientoDe(registro, "astraura").salida);
            expect(mov.entrada.ms).toBeGreaterThan(0);
        }
    });

    it("el compás no depende del carácter: mismo periodo en los tres registros", () => {
        const periodos = REGISTROS.map((r) => movimientoOrbe(r).respiracion.periodoMs);
        expect(new Set(periodos).size).toBe(1);
        expect(periodos[0]).toBe(movimientoDe("sobrio", "astraura").respiracion.periodoMs);
    });

    it("determinista y con el registro sobrio de los bots por defecto", () => {
        expect(REGISTRO_ORBE_BOTS).toBe("sobrio");
        expect(movimientoOrbe()).toEqual(movimientoOrbe(REGISTRO_ORBE_BOTS));
    });
});

describe("presetOrbeDeFase — ninguna fase se congela", () => {
    it("cada fase y registro entrega el preset de su estado y respira", () => {
        for (const fase of FASES) {
            for (const registro of REGISTROS) {
                const p = presetOrbeDeFase(fase, registro);
                expect(p).toEqual(presetOrbe(estadoOrbeDeFase(fase), registro));
                expect(p.periodoMs).toBeGreaterThan(0);
                expect(p.escala[0]).toBeLessThan(p.escala[1]);
                expect(p.escala[1]).toBeGreaterThan(1);
            }
        }
    });

    it("cada fase pinta keyframes de su estado", () => {
        for (const fase of FASES) {
            expect(cssKeyframesOrbe(presetOrbeDeFase(fase, "experimental")).startsWith("@keyframes orbe-")).toBe(true);
        }
    });
});

describe("estado real con movimiento reducido", () => {
    it("la fase sigue siendo la real aunque la orbe quede quieta", () => {
        for (const fase of FASES) {
            const estado = estadoOrbeDeFase(fase);
            const quieta = presetOrbeDeFase(fase, "sobrio", true);
            expect(quieta).toEqual(presetOrbe(estado, "sobrio", true));
            expect(quieta.periodoMs).toBe(0);
            expect(quieta.escala).toEqual([1, 1]);
            expect(quieta.ondas).toBe(0);
            expect(cssKeyframesOrbe(quieta)).toContain("@keyframes orbe-quieto");
            expect(cssKeyframesOrbe(quieta)).toContain("scale(1)");
            expect(cssKeyframesOrbe(quieta)).toContain("rotate(0deg)");
        }
    });
});

