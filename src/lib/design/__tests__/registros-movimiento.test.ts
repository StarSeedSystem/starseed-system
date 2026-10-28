import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "../movimiento";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type RegistroMovimiento,
    type SeccionMovimiento,
} from "../registros-movimiento";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
    "trinity",
    "astraura",
    "genesis",
    "malla",
    "biblioteca",
    "protomolecula",
];

describe("movimientoDe", () => {
    it("los 18 pares registro×seccion devuelven tokens del ADN del OS", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(Object.values(DURACION)).toContain(m.entrada.ms);
                expect(Object.values(CURVA)).toContain(m.entrada.curva);
                expect(Object.values(DURACION)).toContain(m.salida.ms);
                expect(Object.values(CURVA)).toContain(m.salida.curva);
            }
        }
    });

    it("la salida siempre es más corta que la entrada, en los 18 pares", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
                expect(m.cascadaMs).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("la respiración queda entre 1 y 1,03 con periodo de 3500–6000 ms", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const r = movimientoDe(registro, seccion).respiracion;
                expect(r.escala).toBeGreaterThanOrEqual(1);
                expect(r.escala).toBeLessThanOrEqual(1.03);
                expect(r.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(r.periodoMs).toBeLessThanOrEqual(6000);
            }
        }
    });

    it("sobrio nunca lleva elástico y experimental lo lleva solo en la entrada", () => {
        for (const seccion of SECCIONES) {
            const sobrio = movimientoDe("sobrio", seccion);
            expect(sobrio.entrada.curva).not.toBe(CURVA.elastico);
            expect(sobrio.salida.curva).not.toBe(CURVA.elastico);
            const experimental = movimientoDe("experimental", seccion);
            expect(experimental.entrada.curva).toBe(CURVA.elastico);
            expect(experimental.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("la sección modula la cascada y la respiración, no los tokens base", () => {
        const a = movimientoDe("sobrio", "trinity");
        const b = movimientoDe("sobrio", "genesis");
        expect(a.cascadaMs).not.toBe(b.cascadaMs);
        expect(a.respiracion).not.toEqual(b.respiracion);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("pone todos los tiempos a 0 y la escala de respiración a 1", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
                expect(r.entrada.ms).toBe(0);
                expect(r.salida.ms).toBe(0);
                expect(r.cascadaMs).toBe(0);
                expect(r.respiracion.escala).toBe(1);
            }
        }
    });

    it("conserva las curvas del original", () => {
        const original = movimientoDe("experimental", "protomolecula");
        const r = aplicarMovimientoReducido(original);
        expect(r.entrada.curva).toBe(original.entrada.curva);
        expect(r.salida.curva).toBe(original.salida.curva);
    });
});
