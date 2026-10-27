/**
 * Pruebas de los registros de movimiento (Ola 1024D · DAN1024B).
 *
 * Solo se prueba la función pura `movimientoDe` y su versión reducida: no hay
 * red, disco ni reloj. Los 18 pares registro × sección deben devolver tokens
 * que existan en `movimiento.ts`, con la salida más corta que la entrada y una
 * respiración dentro de los rangos acordados.
 */

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
    "trinity", "astraura", "genesis", "malla", "biblioteca", "protomolecula",
];

const PARES = REGISTROS.flatMap((registro) =>
    SECCIONES.map((seccion) => [registro, seccion] as const),
);

const VALORES_DURACION = Object.values(DURACION);
const VALORES_CURVA = Object.values(CURVA);

describe("movimientoDe", () => {
    it("cubre exactamente los 18 pares registro × sección", () => {
        expect(PARES).toHaveLength(18);
    });

    it.each(PARES)(
        "«%s» en «%s» devuelve tokens del OS y salida más corta",
        (registro, seccion) => {
            const m = movimientoDe(registro, seccion);
            expect(VALORES_DURACION).toContain(m.entrada.ms);
            expect(VALORES_DURACION).toContain(m.salida.ms);
            expect(VALORES_CURVA).toContain(m.entrada.curva);
            expect(VALORES_CURVA).toContain(m.salida.curva);
            expect(m.entrada.ms).toBeGreaterThan(0);
            expect(m.salida.ms).toBeGreaterThan(0);
            expect(m.salida.ms).toBeLessThan(m.entrada.ms);
            expect(Number.isInteger(m.cascadaMs)).toBe(true);
            expect(m.cascadaMs).toBeGreaterThanOrEqual(0);
            expect(m.respiracion.escala).toBeGreaterThanOrEqual(1);
            expect(m.respiracion.escala).toBeLessThanOrEqual(1.03);
            expect(m.respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
            expect(m.respiracion.periodoMs).toBeLessThanOrEqual(6000);
        },
    );
});

describe("carácter de cada registro", () => {
    it("el sobrio usa normal/suave y nunca el elástico", () => {
        const m = movimientoDe("sobrio", "trinity");
        expect(m.entrada).toEqual({ ms: DURACION.normal, curva: CURVA.suave });
        expect([m.entrada.curva, m.salida.curva]).not.toContain(CURVA.elastico);
    });

    it("el expresivo entra con pausado/entrada", () => {
        expect(movimientoDe("expresivo", "astraura").entrada).toEqual({
            ms: DURACION.pausado,
            curva: CURVA.entrada,
        });
    });

    it("el experimental usa escena/elástico solo en la entrada", () => {
        const m = movimientoDe("experimental", "protomolecula");
        expect(m.entrada).toEqual({ ms: DURACION.escena, curva: CURVA.elastico });
        expect(m.salida.curva).not.toBe(CURVA.elastico);
    });
});

describe("pulso por sección", () => {
    it("cada sección aporta cascada y respiración propias", () => {
        const vistos = SECCIONES.map((s) => movimientoDe("sobrio", s));
        expect(new Set(vistos.map((m) => m.cascadaMs)).size).toBeGreaterThan(1);
        expect(
            new Set(vistos.map((m) => m.respiracion.periodoMs)).size,
        ).toBeGreaterThan(1);
    });

    it("el registro alarga la cascada sin cambiar la respiración", () => {
        const sobrio = movimientoDe("sobrio", "malla");
        const experimental = movimientoDe("experimental", "malla");
        expect(experimental.cascadaMs).toBeGreaterThan(sobrio.cascadaMs);
        expect(experimental.respiracion).toEqual(sobrio.respiracion);
    });

    it("es determinista: la misma pareja devuelve lo mismo", () => {
        expect(movimientoDe("expresivo", "genesis")).toEqual(
            movimientoDe("expresivo", "genesis"),
        );
    });
});

describe("aplicarMovimientoReducido", () => {
    it.each(PARES)("«%s» en «%s» deja ms en 0 y la escala en 1", (registro, seccion) => {
        const r = aplicarMovimientoReducido(movimientoDe(registro, seccion));
        expect(r.entrada.ms).toBe(0);
        expect(r.salida.ms).toBe(0);
        expect(r.cascadaMs).toBe(0);
        expect(r.respiracion.escala).toBe(1);
    });

    it("conserva curvas y periodo para el estado final", () => {
        const original = movimientoDe("expresivo", "biblioteca");
        const r = aplicarMovimientoReducido(original);
        expect(r.entrada.curva).toBe(original.entrada.curva);
        expect(r.salida.curva).toBe(original.salida.curva);
        expect(r.respiracion.periodoMs).toBe(original.respiracion.periodoMs);
    });
});
