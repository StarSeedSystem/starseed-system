import { describe, expect, it } from "vitest";

import { CURVA, DURACION } from "./movimiento";
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

const CURVAS_OS = Object.values(CURVA);
const DURACIONES_OS = Object.values(DURACION);

describe("movimientoDe", () => {
    it("los 18 pares registro × sección devuelven tokens del OS", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(DURACIONES_OS).toContain(m.entrada.ms);
                expect(DURACIONES_OS).toContain(m.salida.ms);
                expect(CURVAS_OS).toContain(m.entrada.curva);
                expect(CURVAS_OS).toContain(m.salida.curva);
                expect(m.cascadaMs).toBeGreaterThanOrEqual(0);
                expect(m.respiracion.escala).toBeGreaterThanOrEqual(1);
                expect(m.respiracion.escala).toBeLessThanOrEqual(1.03);
                expect(m.respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(m.respiracion.periodoMs).toBeLessThanOrEqual(6000);
            }
        }
    });

    it("la salida es siempre más corta que la entrada en los 18 pares", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
            }
        }
    });

    it("el elástico solo aparece en la entrada de experimental", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const m = movimientoDe(registro, seccion);
                const elasticoEnSalida = m.salida.curva === CURVA.elastico;
                expect(elasticoEnSalida).toBe(false);
                const elasticoEnEntrada = m.entrada.curva === CURVA.elastico;
                expect(elasticoEnEntrada).toBe(registro === "experimental");
            }
        }
    });

    it("el registro sobrio no usa la curva elástica", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("sobrio", seccion);
            expect(m.entrada.curva).not.toBe(CURVA.elastico);
        }
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja ms en 0 y escala en 1 en los 18 pares", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
                expect(r.entrada.ms).toBe(0);
                expect(r.salida.ms).toBe(0);
                expect(r.respiracion.escala).toBe(1);
            }
        }
    });

    it("conserva periodo, cascada y curvas del movimiento original", () => {
        const original = movimientoDe("experimental", "malla");
        const reducido = aplicarMovimientoReducido(original);
        expect(reducido.respiracion.periodoMs).toBe(original.respiracion.periodoMs);
        expect(reducido.cascadaMs).toBe(original.cascadaMs);
        expect(reducido.entrada.curva).toBe(original.entrada.curva);
        expect(reducido.salida.curva).toBe(original.salida.curva);
    });
});
