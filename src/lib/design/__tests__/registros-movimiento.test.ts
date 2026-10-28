import { describe, it, expect } from "vitest";
import {
    movimientoDe,
    aplicarMovimientoReducido,
    RegistroMovimiento,
    SeccionMovimiento,
} from "@/lib/design/registros-movimiento";
import { DURACION, CURVA } from "@/lib/design/movimiento";

const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const SECCIONES: SeccionMovimiento[] = [
    "trinity",
    "astraura",
    "genesis",
    "malla",
    "biblioteca",
    "protomolecula",
];
const DURACIONES_OS = Object.values(DURACION);
const CURVAS_OS = Object.values(CURVA);

describe("movimientoDe", () => {
    it("los 18 pares registro × sección devuelven tokens del ADN del OS", () => {
        for (const r of REGISTROS) {
            for (const s of SECCIONES) {
                const m = movimientoDe(r, s);
                expect(DURACIONES_OS).toContain(m.entrada.ms);
                expect(DURACIONES_OS).toContain(m.salida.ms);
                expect(CURVAS_OS).toContain(m.entrada.curva);
                expect(CURVAS_OS).toContain(m.salida.curva);
            }
        }
    });

    it("la salida es siempre más corta que la entrada", () => {
        for (const r of REGISTROS) {
            for (const s of SECCIONES) {
                const m = movimientoDe(r, s);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
            }
        }
    });

    it("el elástico solo aparece en la entrada del registro experimental", () => {
        for (const r of REGISTROS) {
            for (const s of SECCIONES) {
                const m = movimientoDe(r, s);
                const elasticoEnEntrada = m.entrada.curva === CURVA.elastico;
                if (r === "experimental") expect(elasticoEnEntrada).toBe(true);
                else expect(elasticoEnEntrada).toBe(false);
                expect(m.salida.curva === CURVA.elastico).toBe(false);
            }
        }
    });

    it("la respiración cae entre 1 y 1,03 con periodo 3500-6000 ms", () => {
        for (const r of REGISTROS) {
            for (const s of SECCIONES) {
                const { respiracion } = movimientoDe(r, s);
                expect(respiracion.escala).toBeGreaterThanOrEqual(1);
                expect(respiracion.escala).toBeLessThanOrEqual(1.03);
                expect(respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(respiracion.periodoMs).toBeLessThanOrEqual(6000);
            }
        }
    });

    it("la cascada es no negativa y crece con el registro más escénico", () => {
        for (const s of SECCIONES) {
            const sobrio = movimientoDe("sobrio", s).cascadaMs;
            const experimental = movimientoDe("experimental", s).cascadaMs;
            expect(sobrio).toBeGreaterThanOrEqual(0);
            expect(experimental).toBeGreaterThan(sobrio);
        }
    });

    it("el registro experimental entra con escena y el sobrio con normal y suave", () => {
        const u = movimientoDe("experimental", "trinity");
        expect(u.entrada.ms).toBe(DURACION.escena);
        const s = movimientoDe("sobrio", "genesis");
        expect(s.entrada.ms).toBe(DURACION.normal);
        expect(s.entrada.curva).toBe(CURVA.suave);
    });
});

describe("aplicarMovimientoReducido", () => {
    it("deja todas las duraciones en 0 y la respiración en escala 1", () => {
        for (const r of REGISTROS) {
            for (const s of SECCIONES) {
                const r0 = aplicarMovimientoReducido(movimientoDe(r, s));
                expect(r0.entrada.ms).toBe(0);
                expect(r0.salida.ms).toBe(0);
                expect(r0.cascadaMs).toBe(0);
                expect(r0.respiracion.periodoMs).toBe(0);
                expect(r0.respiracion.escala).toBe(1);
            }
        }
    });

    it("conserva las curvas para aplicar el estado final de golpe", () => {
        const m = movimientoDe("experimental", "astraura");
        const r0 = aplicarMovimientoReducido(m);
        expect(r0.entrada.curva).toBe(m.entrada.curva);
        expect(r0.salida.curva).toBe(m.salida.curva);
    });

    it("no muta el movimiento original", () => {
        const m = movimientoDe("expresivo", "malla");
        const antes = { ...m.respiracion };
        aplicarMovimientoReducido(m);
        expect(m.respiracion).toEqual(antes);
        expect(m.entrada.ms).toBeGreaterThan(0);
    });
});
