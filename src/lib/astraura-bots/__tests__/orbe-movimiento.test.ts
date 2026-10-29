/**
 * Movimiento de la orbe de los bots (BOT1011D2): el MISMO gesto en todas las
 * pantallas y equipos. Pruebas puras, sin DOM, red, reloj ni `node:*`.
 *
 * El registro manda el CARÁCTER (amplitud de la respiración) y la sección de
 * Astraura manda el COMPÁS (periodo): cambiar de equipo no cambia la identidad
 * del gesto, solo su precisión.
 */
import { describe, it, expect } from "vitest";
import type { FaseBucle } from "@/lib/astraura-bots/bucle";
import { presetOrbe } from "@/lib/design/animaciones-orbe";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import { estadoOrbeDeFase, movimientoOrbe, presetOrbeDeFase } from "@/lib/design/orbe-bucle";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const FASES: FaseBucle[] = ["reposo", "observando", "esperando", "actuando", "hecho", "rechazado"];

describe("movimientoOrbe — la orbe del bot usa el gesto de Astraura", () => {
    it("cada registro coincide con el movimiento de la sección Astraura", () => {
        for (const registro of REGISTROS) {
            expect(movimientoOrbe(registro)).toEqual(movimientoDe(registro, "astraura"));
        }
    });

    it("el compás no depende del carácter: el periodo es igual en los tres registros", () => {
        const periodos = REGISTROS.map((r) => movimientoOrbe(r).respiracion.periodoMs);
        expect(new Set(periodos).size).toBe(1);
        expect(periodos[0]).toBe(movimientoDe("sobrio", "astraura").respiracion.periodoMs);
    });
});

describe("presetOrbeDeFase — el mismo gesto en todas las pantallas", () => {
    it("cada fase y registro entrega el preset del tema para su estado", () => {
        for (const fase of FASES) {
            const estado = estadoOrbeDeFase(fase);
            for (const registro of REGISTROS) {
                expect(presetOrbeDeFase(fase, registro)).toEqual(presetOrbe(estado, registro));
            }
        }
    });

    it("con movimiento reducido todas las fases y registros quedan quietos", () => {
        for (const fase of FASES) {
            for (const registro of REGISTROS) {
                const p = presetOrbeDeFase(fase, registro, true);
                expect(p.periodoMs).toBe(0);
                expect(p.escala).toEqual([1, 1]);
                expect(p.ondas).toBe(0);
            }
        }
    });
});
