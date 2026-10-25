import { describe, expect, it } from "vitest";

import { CURVA, DURACION } from "@/lib/design/movimiento";
import {
    aplicarMovimientoReducido,
    movimientoDe,
    type RegistroMovimiento,
    type SeccionMovimiento,
} from "@/lib/design/registros-movimiento";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
    "trinity",
    "astraura",
    "genesis",
    "malla",
    "biblioteca",
    "protomolecula",
];

const DURACIONES_OS = Object.values(DURACION) as number[];
const CURVAS_OS = Object.values(CURVA) as string[];

describe("movimientoDe", () => {
    it("los 18 pares registro×sección devuelven tokens del OS", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const plan = movimientoDe(registro, seccion);
                expect(DURACIONES_OS).toContain(plan.entrada.ms);
                expect(DURACIONES_OS).toContain(plan.salida.ms);
                expect(DURACIONES_OS).toContain(plan.cascadaMs);
                expect(CURVAS_OS).toContain(plan.entrada.curva);
                expect(CURVAS_OS).toContain(plan.salida.curva);
            }
        }
    });

    it("la salida es siempre más corta que la entrada y sin elástico", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const plan = movimientoDe(registro, seccion);
                expect(plan.salida.ms).toBeLessThan(plan.entrada.ms);
                expect(plan.salida.curva).not.toBe(CURVA.elastico);
            }
        }
    });

    it("sobrio usa curva suave y jamás elástico", () => {
        for (const seccion of SECCIONES) {
            const plan = movimientoDe("sobrio", seccion);
            expect(plan.entrada.curva).toBe(CURVA.suave);
            expect([DURACION.rapido, DURACION.normal]).toContain(plan.entrada.ms);
        }
    });

    it("expresivo entra con la curva de entrada del OS", () => {
        for (const seccion of SECCIONES) {
            const plan = movimientoDe("expresivo", seccion);
            expect(plan.entrada.curva).toBe(CURVA.entrada);
            expect([DURACION.normal, DURACION.pausado]).toContain(plan.entrada.ms);
        }
    });

    it("experimental entra con escena y elástico solo en entrada", () => {
        for (const seccion of SECCIONES) {
            const plan = movimientoDe("experimental", seccion);
            expect(plan.entrada.ms).toBe(DURACION.escena);
            expect(plan.entrada.curva).toBe(CURVA.elastico);
            expect(plan.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("la respiración queda entre 1 y 1,03 con periodo de 3500 a 6000 ms", () => {
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

    it("la sección modula el plan: distintos pesos, distinta cascada", () => {
        const sobria = movimientoDe("sobrio", "genesis");
        const orbe = movimientoDe("sobrio", "astraura");
        expect(orbe.cascadaMs).toBeGreaterThan(sobria.cascadaMs);
        expect(orbe.respiracion.periodoMs).toBeLessThan(sobria.respiracion.periodoMs);
        expect(orbe.respiracion.escala).toBeGreaterThan(sobria.respiracion.escala);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja todos los ms en 0 y la escala en 1 (estado final sin moverse)", () => {
        for (const registro of REGISTROS) {
            for (const seccion of SECCIONES) {
                const reducido = aplicarMovimientoReducido(movimientoDe(registro, seccion));
                expect(reducido.entrada.ms).toBe(0);
                expect(reducido.salida.ms).toBe(0);
                expect(reducido.cascadaMs).toBe(0);
                expect(reducido.respiracion.escala).toBe(1);
            }
        }
    });

    it("conserva el periodo de respiración original", () => {
        const plan = movimientoDe("expresivo", "astraura");
        const reducido = aplicarMovimientoReducido(plan);
        expect(reducido.respiracion.periodoMs).toBe(plan.respiracion.periodoMs);
    });
});
