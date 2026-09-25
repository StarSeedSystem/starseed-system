/**
 * El colchón de la voz en tiempo real (2026-09-24): voz continua aunque el equipo o el
 * modelo vayan más lentos que la voz.
 */
import { describe, expect, it } from "vitest";

import {
    COLCHON_MAXIMO,
    ESPERA_MAXIMA_MS,
    MEDIDAS_INICIALES,
    colchonObjetivo,
    colchonTrasCorte,
    ewma,
    leerMedidas,
    puedeSonar,
    ritmoProduccion,
} from "@/lib/aurora/colchon-voz";

describe("ritmo de producción", () => {
    it("lo marca el eslabón más lento: el motor de voz o el texto", () => {
        const rapido = { ...MEDIDAS_INICIALES, rtf: 0.3, charsPorSegTexto: 200 };
        expect(ritmoProduccion(rapido)).toBeCloseTo(1 / 0.3, 3);
        const textoLento = { ...MEDIDAS_INICIALES, rtf: 0.3, charsPorSegTexto: 8, segPorCaracter: 0.065 };
        expect(ritmoProduccion(textoLento)).toBeCloseTo(0.52, 2);
    });
});

describe("colchón al empezar", () => {
    it("si se produce más rápido que la voz, basta con la primera frase", () => {
        expect(colchonObjetivo({ ...MEDIDAS_INICIALES, rtf: 0.3 })).toBe(0);
    });

    it("si el motor va a la par o más lento, guarda audio antes de hablar", () => {
        const cargado = { ...MEDIDAS_INICIALES, rtf: 1.3, duracionTurno: 12 };
        const c = colchonObjetivo(cargado);
        expect(c).toBeGreaterThan(3);
        expect(c).toBeLessThanOrEqual(COLCHON_MAXIMO);
    });

    it("nunca espera más del máximo", () => {
        expect(colchonObjetivo({ ...MEDIDAS_INICIALES, rtf: 10, duracionTurno: 300 })).toBe(COLCHON_MAXIMO);
    });

    it("tras un corte pide más colchón, y más con cada corte", () => {
        const m = { ...MEDIDAS_INICIALES, rtf: 0.9 };
        expect(colchonTrasCorte(m, 1)).toBeGreaterThanOrEqual(1.5);
        expect(colchonTrasCorte(m, 3)).toBeGreaterThan(colchonTrasCorte(m, 1));
    });
});

describe("compuerta", () => {
    it("abre con el colchón lleno, con el texto terminado o tras la espera máxima", () => {
        expect(puedeSonar({ acumulado: 2, necesario: 3, finDeTexto: false, esperandoMs: 100 })).toBe(false);
        expect(puedeSonar({ acumulado: 3.1, necesario: 3, finDeTexto: false, esperandoMs: 100 })).toBe(true);
        expect(puedeSonar({ acumulado: 1, necesario: 3, finDeTexto: true, esperandoMs: 100 })).toBe(true);
        expect(puedeSonar({ acumulado: 1, necesario: 3, finDeTexto: false, esperandoMs: ESPERA_MAXIMA_MS })).toBe(true);
    });

    it("sin audio listo nunca abre", () => {
        expect(puedeSonar({ acumulado: 0, necesario: 0, finDeTexto: true, esperandoMs: 99_999 })).toBe(false);
    });
});

describe("medidas", () => {
    it("ewma ignora muestras raras", () => {
        expect(ewma(0.4, Number.NaN)).toBe(0.4);
        expect(ewma(0.4, 0.8, 0.5)).toBeCloseTo(0.6, 5);
    });

    it("lo guardado corrupto vuelve a los valores iniciales", () => {
        expect(leerMedidas("{roto")).toEqual(MEDIDAS_INICIALES);
        expect(leerMedidas(JSON.stringify({ rtf: -3, segPorCaracter: 0.07 })).rtf).toBe(MEDIDAS_INICIALES.rtf);
        expect(leerMedidas(JSON.stringify({ rtf: 0.9 })).rtf).toBe(0.9);
    });
});
