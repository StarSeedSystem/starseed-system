import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import {
    REGISTROS_MOVIMIENTO,
    SECCIONES_MOVIMIENTO,
    aplicarMovimientoReducido,
    movimientoDe,
} from "@/lib/design/registros-movimiento";

/* DAN1024B — registros de movimiento por sección sobre los tokens del OS */

const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

describe("movimientoDe", () => {
    it("devuelve los 18 pares registro×sección con tokens del OS", () => {
        expect(REGISTROS_MOVIMIENTO).toHaveLength(3);
        expect(SECCIONES_MOVIMIENTO).toHaveLength(6);
        for (const registro of REGISTROS_MOVIMIENTO) {
            for (const seccion of SECCIONES_MOVIMIENTO) {
                const m = movimientoDe(registro, seccion);
                expect(DURACIONES).toContain(m.entrada.ms);
                expect(CURVAS).toContain(m.entrada.curva);
                expect(DURACIONES).toContain(m.salida.ms);
                expect(CURVAS).toContain(m.salida.curva);
            }
        }
    });

    it("la salida siempre es más corta que la entrada", () => {
        for (const registro of REGISTROS_MOVIMIENTO) {
            for (const seccion of SECCIONES_MOVIMIENTO) {
                const m = movimientoDe(registro, seccion);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
            }
        }
    });

    it("respira entre 1 y 1,03 con periodo de 3500 a 6000 ms", () => {
        for (const registro of REGISTROS_MOVIMIENTO) {
            for (const seccion of SECCIONES_MOVIMIENTO) {
                const { respiracion } = movimientoDe(registro, seccion);
                expect(respiracion.escala).toBeGreaterThanOrEqual(1);
                expect(respiracion.escala).toBeLessThanOrEqual(1.03);
                expect(respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(respiracion.periodoMs).toBeLessThanOrEqual(6000);
            }
        }
    });

    it("el registro sobrio no usa elástico ni en entrada ni en salida", () => {
        for (const seccion of SECCIONES_MOVIMIENTO) {
            const m = movimientoDe("sobrio", seccion);
            expect(m.entrada.curva).not.toBe(CURVA.elastico);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("el registro experimental reserva el elástico para la entrada", () => {
        for (const seccion of SECCIONES_MOVIMIENTO) {
            const m = movimientoDe("experimental", seccion);
            expect(m.entrada.curva).toBe(CURVA.elastico);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("la cascada es positiva y crece con la expresividad del registro", () => {
        for (const seccion of SECCIONES_MOVIMIENTO) {
            const sobrio = movimientoDe("sobrio", seccion).cascadaMs;
            const expresivo = movimientoDe("expresivo", seccion).cascadaMs;
            const experimental = movimientoDe("experimental", seccion).cascadaMs;
            expect(sobrio).toBeGreaterThan(0);
            expect(expresivo).toBeGreaterThan(sobrio);
            expect(experimental).toBeGreaterThan(expresivo);
        }
    });

    it("devuelve copias nuevas en cada llamada", () => {
        const primera = movimientoDe("expresivo", "astraura");
        primera.entrada.ms = 1;
        primera.respiracion.escala = 1.5;
        const segunda = movimientoDe("expresivo", "astraura");
        expect(segunda.entrada.ms).not.toBe(1);
        expect(segunda.respiracion.escala).not.toBe(1.5);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja entrada, salida y cascada en 0 y la respiración quieta", () => {
        for (const registro of REGISTROS_MOVIMIENTO) {
            for (const seccion of SECCIONES_MOVIMIENTO) {
                const reducido = aplicarMovimientoReducido(movimientoDe(registro, seccion));
                expect(reducido.entrada.ms).toBe(0);
                expect(reducido.salida.ms).toBe(0);
                expect(reducido.cascadaMs).toBe(0);
                expect(reducido.respiracion.escala).toBe(1);
                expect(reducido.respiracion.periodoMs).toBe(0);
            }
        }
    });

    it("conserva las curvas del registro elegido", () => {
        const original = movimientoDe("experimental", "protomolecula");
        const reducido = aplicarMovimientoReducido(original);
        expect(reducido.entrada.curva).toBe(original.entrada.curva);
        expect(reducido.salida.curva).toBe(original.salida.curva);
    });
});
