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
const PARES = REGISTROS.flatMap((registro) =>
    SECCIONES.map((seccion) => ({ registro, seccion })),
);
const MS_DEL_OS = Object.values(DURACION) as number[];
const CURVAS_DEL_OS = Object.values(CURVA) as string[];

describe("registros-movimiento", () => {
    it("resuelve los 18 pares con tokens del OS", () => {
        expect(PARES).toHaveLength(18);
        for (const { registro, seccion } of PARES) {
            const r = movimientoDe(registro, seccion);
            expect(MS_DEL_OS).toContain(r.entrada.ms);
            expect(MS_DEL_OS).toContain(r.salida.ms);
            expect(MS_DEL_OS).toContain(r.cascadaMs);
            expect(CURVAS_DEL_OS).toContain(r.entrada.curva);
            expect(CURVAS_DEL_OS).toContain(r.salida.curva);
        }
    });

    it("la salida siempre es más corta que la entrada", () => {
        for (const { registro, seccion } of PARES) {
            const r = movimientoDe(registro, seccion);
            expect(r.salida.ms).toBeLessThan(r.entrada.ms);
        }
    });

    it("la respiración se queda entre 1 y 1,03 con periodo de 3,5 a 6 s", () => {
        for (const { registro, seccion } of PARES) {
            const { respiracion } = movimientoDe(registro, seccion);
            expect(respiracion.escala).toBeGreaterThanOrEqual(1);
            expect(respiracion.escala).toBeLessThanOrEqual(1.03);
            expect(respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
            expect(respiracion.periodoMs).toBeLessThanOrEqual(6000);
        }
    });

    it("sobrio va suave y sin elástico; expresivo usa pausado + entrada", () => {
        const sobrio = movimientoDe("sobrio", "genesis");
        expect(sobrio.entrada).toEqual({ ms: DURACION.normal, curva: CURVA.suave });
        expect(sobrio.salida.curva).not.toBe(CURVA.elastico);

        const expresivo = movimientoDe("expresivo", "genesis");
        expect(expresivo.entrada).toEqual({ ms: DURACION.pausado, curva: CURVA.entrada });
        expect(expresivo.salida.curva).not.toBe(CURVA.elastico);
    });

    it("experimental reserva el elástico solo para la entrada", () => {
        for (const seccion of SECCIONES) {
            const r = movimientoDe("experimental", seccion);
            expect(r.entrada).toEqual({ ms: DURACION.escena, curva: CURVA.elastico });
            expect(r.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("la sección cambia cascada y respiración sin cambiar la entrada", () => {
        const a = movimientoDe("expresivo", "astraura");
        const b = movimientoDe("expresivo", "genesis");
        expect(a.entrada).toEqual(b.entrada);
        expect(a.cascadaMs).not.toBe(b.cascadaMs);
        expect(a.respiracion).not.toEqual(b.respiracion);
    });

    it("con movimiento reducido deja ms y cascada en 0 y la escala en 1", () => {
        for (const { registro, seccion } of PARES) {
            const normal = movimientoDe(registro, seccion);
            const reducido = aplicarMovimientoReducido(normal);
            expect(reducido.entrada.ms).toBe(0);
            expect(reducido.salida.ms).toBe(0);
            expect(reducido.cascadaMs).toBe(0);
            expect(reducido.respiracion.escala).toBe(1);
            expect(reducido.entrada.curva).toBe(normal.entrada.curva);
            expect(reducido.salida.curva).toBe(normal.salida.curva);
            expect(reducido.respiracion.periodoMs).toBe(normal.respiracion.periodoMs);
        }
    });
});
