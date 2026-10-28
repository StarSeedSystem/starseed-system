import { describe, it, expect } from "vitest";
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

const DURACIONES = Object.values(DURACION);
const CURVAS = Object.values(CURVA);

describe("movimientoDe — 18 pares registro × sección", () => {
    for (const registro of REGISTROS) {
        for (const seccion of SECCIONES) {
            it(`devuelve tokens del OS para ${registro} · ${seccion}`, () => {
                const m = movimientoDe(registro, seccion);
                expect(DURACIONES).toContain(m.entrada.ms);
                expect(DURACIONES).toContain(m.salida.ms);
                expect(CURVAS).toContain(m.entrada.curva);
                expect(CURVAS).toContain(m.salida.curva);
                expect(m.salida.ms).toBeLessThan(m.entrada.ms);
                expect(m.cascadaMs).toBeGreaterThan(0);
                expect(m.cascadaMs).toBeLessThanOrEqual(240);
                expect(m.respiracion.escala).toBeGreaterThanOrEqual(1);
                expect(m.respiracion.escala).toBeLessThanOrEqual(1.03);
                expect(m.respiracion.periodoMs).toBeGreaterThanOrEqual(3500);
                expect(m.respiracion.periodoMs).toBeLessThanOrEqual(6000);
            });
        }
    }

    it("es determinista: el mismo par devuelve siempre el mismo objeto", () => {
        expect(movimientoDe("expresivo", "trinity")).toEqual(movimientoDe("expresivo", "trinity"));
        expect(movimientoDe("sobrio", "biblioteca")).toEqual(movimientoDe("sobrio", "biblioteca"));
    });

    it("las secciones difieren en ritmo: cascada y periodo cambian", () => {
        for (const registro of REGISTROS) {
            const periodos = SECCIONES.map((s) => movimientoDe(registro, s).respiracion.periodoMs);
            const cascadas = SECCIONES.map((s) => movimientoDe(registro, s).cascadaMs);
            expect(new Set(periodos).size).toBe(SECCIONES.length);
            expect(new Set(cascadas).size).toBe(SECCIONES.length);
        }
    });

    it("el sobrio nunca usa la curva elástica", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("sobrio", seccion);
            expect(m.entrada.curva).not.toBe(CURVA.elastico);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("el experimental lleva el elástico SOLO en la entrada", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("experimental", seccion);
            expect(m.entrada.curva).toBe(CURVA.elastico);
            expect(m.entrada.ms).toBe(DURACION.escena);
            expect(m.salida.curva).not.toBe(CURVA.elastico);
        }
    });

    it("el expresivo entra con la curva de aparición y a pausado", () => {
        const m = movimientoDe("expresivo", "genesis");
        expect(m.entrada.ms).toBe(DURACION.pausado);
        expect(m.entrada.curva).toBe(CURVA.entrada);
        expect(m.salida.ms).toBe(DURACION.normal);
        expect(m.salida.curva).toBe(CURVA.salida);
    });
});

describe("mapeo exacto del ADN por registro", () => {
    it("el sobrio entra a normal con suave y retira a rápido con suave", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("sobrio", seccion);
            expect(m.entrada).toEqual({ ms: DURACION.normal, curva: CURVA.suave });
            expect(m.salida).toEqual({ ms: DURACION.rapido, curva: CURVA.suave });
        }
    });

    it("el experimental retira a pausado con la curva de salida", () => {
        for (const seccion of SECCIONES) {
            const m = movimientoDe("experimental", seccion);
            expect(m.salida).toEqual({ ms: DURACION.pausado, curva: CURVA.salida });
        }
    });

    it("la amplitud de la respiración la manda el registro, no la sección", () => {
        expect(movimientoDe("sobrio", "trinity").respiracion.escala).toBe(1.01);
        expect(movimientoDe("expresivo", "trinity").respiracion.escala).toBe(1.02);
        expect(movimientoDe("experimental", "trinity").respiracion.escala).toBe(1.03);
    });

    it("el periodo de la respiración lo manda la sección, no el registro", () => {
        const conTrinity = REGISTROS.map((r) => movimientoDe(r, "trinity").respiracion.periodoMs);
        expect(new Set(conTrinity).size).toBe(1);
        const conGenesis = REGISTROS.map((r) => movimientoDe(r, "genesis").respiracion.periodoMs);
        expect(new Set(conGenesis).size).toBe(1);
    });
});

describe("aplicarMovimientoReducido", () => {
    for (const registro of REGISTROS) {
        for (const seccion of SECCIONES) {
            it(`reduce a 0 ms y escala 1 el par ${registro} · ${seccion}`, () => {
                const m = aplicarMovimientoReducido(movimientoDe(registro, seccion));
                expect(m.entrada.ms).toBe(0);
                expect(m.salida.ms).toBe(0);
                expect(m.cascadaMs).toBe(0);
                expect(m.respiracion.periodoMs).toBe(0);
                expect(m.respiracion.escala).toBe(1);
            });
        }
    }

    it("conserva las curvas para pintar el estado final", () => {
        const m = aplicarMovimientoReducido(movimientoDe("experimental", "astraura"));
        expect(m.entrada.curva).toBe(CURVA.elastico);
        expect(m.salida.curva).toBe(CURVA.salida);
    });

    it("no muta el movimiento original", () => {
        const original = movimientoDe("sobrio", "malla");
        aplicarMovimientoReducido(original);
        expect(original.entrada.ms).toBe(DURACION.normal);
        expect(original.respiracion.escala).toBe(1.01);
    });
});
