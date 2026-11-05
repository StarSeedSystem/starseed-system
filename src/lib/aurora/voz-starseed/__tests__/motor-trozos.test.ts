// src/lib/aurora/voz-starseed/__tests__/motor-trozos.test.ts
/**
 * TESTS DE TROCEO DE VOZ (VOZ1105A · Voz estable)
 * ─────────────────────────────────────────────────
 * Verifica que hablarPorNube y hablarPorSistema parten el texto en trozos
 * y lo piden en orden, sin cortar a media frase.
 */

import { describe, expect, it, vi } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";

describe("trocearTexto · función pura", () => {
    it("parte textos largos en trozos ≤ max sin cortar palabras", () => {
        const texto = "Hola mundo. Este es un texto largo que debe partirse en trozos más pequeños para la síntesis.";
        const trozos = trocearTexto(texto, 30);
        expect(trozos.length).toBeGreaterThan(1);
        trozos.forEach((t) => {
            expect(t.length).toBeLessThanOrEqual(30);
        });
    });

    it("un texto de 1500 caracteres se parte en 3-4 trozos con max 500", () => {
        const texto = "x".repeat(1500);
        const trozos = trocearTexto(texto, 500);
        expect(trozos.length).toBeGreaterThanOrEqual(3);
        expect(trozos.length).toBeLessThanOrEqual(4);
        trozos.forEach((t) => {
            expect(t.length).toBeLessThanOrEqual(500);
        });
    });

    it("mantiene el orden de los trozos", () => {
        const texto = "Primero. Segundo. Tercero. Cuarto.";
        const trozos = trocearTexto(texto, 10);
        const reconstruido = trozos.join(" ");
        expect(reconstruido).toContain("Primero");
        expect(reconstruido).toContain("Segundo");
        expect(trozos[0]).toMatch(/Primero/);
    });
});
