/**
 * Pruebas de REGISTROS DE MOVIMIENTO (DAN1024B, parte 1).
 * Los 18 pares registro × sección devuelven tokens del OS, con salida más
 * corta que la entrada y respiración viva; el modo reducido aplana todo.
 */

import { describe, expect, it } from "vitest";

import { CURVA, DURACION } from "../movimiento";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type RegistroMovimiento,
    type SeccionMovimiento,
} from "./registros-movimiento";

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
    it("los 18 pares devuelven duraciones y curvas del OS", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(Object.values(DURACION)).toContain(m.entrada.ms);
                expect(Object.values(DURACION)).toContain(m.salida.ms);
                expect(Object.values(CURVA)).toContain(m.entrada.curva);
                expect(Object.values(CURVA)).toContain(m.salida.curva);
            }
        }
    });

    it("la salida siempre es más corta que la entrada", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
            }
        }
    });

    it("el experimental usa el elástico solo en la entrada", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("experimental", seccion);
            expect(m.entrada.curva).toBe(CURVA.elastico);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("la respiración vive entre escala 1 y 1,03 con periodo 3500-6000 ms", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const { respiracion } = movimientoDe(registro, seccion);
                expect(respiracion.escala).toBeGreaterThanOrEqual(1);
                expect(respiracion.escala).toBeLessThanOrEqual(1.03);
                expect(respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(respiracion.periodoMs).toBeLessThanOrEqual(6000);
            }
        }
    });

    it("la cascada respeta el tope del registro", () => {
        expect(movimientoDe("sobrio", "genesis").cascadaMs).toBe(120);
        expect(movimientoDe("expresivo", "genesis").cascadaMs).toBe(240);
        expect(movimientoDe("experimental", "genesis").cascadaMs).toBe(360);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja las duraciones en 0 y la escala en 1 en los 18 pares", () => {
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
});
