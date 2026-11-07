// src/lib/aurora/voz-starseed/__tests__/intensidad.test.ts
/**
 * Prueba PURA de la validación de intensidad (0–1) en el motor de voz.
 * La función clampIntensity debe acotar cualquier número al rango [0, 1].
 */

import { describe, expect, it } from "vitest";
import { clampIntensity } from "../motor";

describe("clampIntensity - validación de intensidad en rango [0, 1]", () => {
    it("devuelve 0 para valores negativos", () => {
        expect(clampIntensity(-1)).toBe(0);
        expect(clampIntensity(-0.5)).toBe(0);
        expect(clampIntensity(-100)).toBe(0);
    });

    it("devuelve 2 para valores mayores que 2", () => {
        expect(clampIntensity(1.1)).toBe(1.1);
        expect(clampIntensity(2)).toBe(2);
        expect(clampIntensity(100)).toBe(2);
    });

    it("devuelve el valor sin cambios si está en [0, 1]", () => {
        expect(clampIntensity(0)).toBe(0);
        expect(clampIntensity(0.5)).toBe(0.5);
        expect(clampIntensity(1)).toBe(1);
        expect(clampIntensity(0.25)).toBe(0.25);
        expect(clampIntensity(0.75)).toBe(0.75);
    });

    it("maneja NaN devolviendo 0 (valor seguro)", () => {
        expect(clampIntensity(NaN)).toBe(0);
    });

    it("maneja Infinity devolviendo 1 (valor seguro)", () => {
        expect(clampIntensity(Infinity)).toBe(1);
        expect(clampIntensity(-Infinity)).toBe(0);
    });
});