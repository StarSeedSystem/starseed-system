import { describe, it, expect } from "vitest";
import { DURACION, CURVA } from "../movimiento";
import {
    movimientoDe,
    aplicarMovimientoReducido,
    type RegistroMovimiento,
    type SeccionMovimiento,
} from "../registros-movimiento";

/* DAN1024B-d1 — registros de movimiento (sobrio, expresivo, experimental)
 * por sección, sobre los tokens del OS. Los 18 pares, el contrato de cada
 * registro y el movimiento reducido. */

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
    "trinity",
    "astraura",
    "genesis",
    "malla",
    "biblioteca",
    "protomolecula",
];
const PARES = REGISTROS.flatMap((registro) =>
    SECCIONES.map((seccion) => [registro, seccion] as const),
);
const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

describe("movimientoDe · los 18 pares", () => {
    it("son exactamente 18: 3 registros por 6 secciones", () => {
        expect(PARES).toHaveLength(18);
    });

    it("devuelven tokens del OS en entrada, salida y cascada", () => {
        for (const [registro, seccion] of PARES) {
            const m = movimientoDe(registro, seccion);
            expect(DURACIONES).toContain(m.entrada.ms);
            expect(DURACIONES).toContain(m.salida.ms);
            expect(DURACIONES).toContain(m.cascadaMs);
            expect(CURVAS).toContain(m.entrada.curva);
            expect(CURVAS).toContain(m.salida.curva);
        }
    });

    it("la salida siempre es más corta que la entrada", () => {
        for (const [registro, seccion] of PARES) {
            const m = movimientoDe(registro, seccion);
            expect(m.salida.ms).toBeLessThan(m.entrada.ms);
        }
    });

    it("la respiración va de 1 a 1.03, con periodo de 3500 a 6000 ms", () => {
        for (const [registro, seccion] of PARES) {
            const m = movimientoDe(registro, seccion);
            expect(m.respiracion.escala).toBeGreaterThanOrEqual(1);
            expect(m.respiracion.escala).toBeLessThanOrEqual(1.03);
            expect(m.respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
            expect(m.respiracion.periodoMs).toBeLessThanOrEqual(6000);
        }
    });

    it("la voz de cada registro es la del contrato, en todas las secciones", () => {
        for (const seccion of SECCIONES) {
            expect(movimientoDe("sobrio", seccion).entrada).toEqual({
                ms: DURACION.normal,
                curva: CURVA.suave,
            });
            expect(movimientoDe("expresivo", seccion).entrada).toEqual({
                ms: DURACION.pausado,
                curva: CURVA.entrada,
            });
            expect(movimientoDe("experimental", seccion).entrada).toEqual({
                ms: DURACION.escena,
                curva: CURVA.elastico,
            });
        }
    });

    it("el elástico solo aparece en la entrada experimental; el sobrio jamás", () => {
        for (const [registro, seccion] of PARES) {
            const m = movimientoDe(registro, seccion);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
            if (registro === "sobrio") {
                expect(m.entrada.curva).not.toBe(CURVA.elastico);
            }
        }
    });

    it("devuelve copias nuevas: mutar el resultado no cambia los tokens", () => {
        const a = movimientoDe("expresivo", "astraura");
        a.entrada.ms = 9999;
        a.respiracion.escala = 9;
        const b = movimientoDe("expresivo", "astraura");
        expect(b.entrada.ms).toBe(DURACION.pausado);
        expect(b.respiracion.escala).toBeLessThanOrEqual(1.03);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja los 18 pares en 0 ms y sin respiración", () => {
        for (const [registro, seccion] of PARES) {
            const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
            expect(r.entrada.ms).toBe(0);
            expect(r.salida.ms).toBe(0);
            expect(r.cascadaMs).toBe(0);
            expect(r.respiracion.escala).toBe(1);
            expect(r.respiracion.periodoMs).toBe(0);
        }
    });

    it("no muta el movimiento original", () => {
        const m = movimientoDe("experimental", "malla");
        aplicarMovimientoReducido(m);
        expect(m.entrada.ms).toBe(DURACION.escena);
        expect(m.respiracion.escala).toBe(1.03);
    });
});
