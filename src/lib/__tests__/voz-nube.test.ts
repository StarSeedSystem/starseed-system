/**
 * Tests del troceado de texto de la voz en la nube (Ola 279 · V8B · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Solo prueban la función pura `trocearTexto` de `src/lib/voces/trocear.ts`:
 * NO importan el `route.ts` (los `route.ts` del App Router arrastran
 * `next/server` y contexto de petición que Vitest en entorno `node` no monta),
 * ni hacen red, ni mocks. Por eso el troceado vive aparte.
 */

import { describe, expect, it } from "vitest";

import { trocearTexto } from "@/lib/voces/trocear";

/** Palabras de un texto (set sin duplicados), para comprobar que nada se pierde. */
function palabras(texto: string): Set<string> {
    return new Set(texto.split(/\s+/).filter(Boolean));
}

describe("trocearTexto", () => {
    it("parte un texto largo por frases en trozos de ≤ 200 sin cortar palabras", () => {
        const frase = "Buenos días, viajero. Hoy la red StarSeed te saluda con un mensaje claro y sereno: la conciencia se expande paso a paso, sin prisa y sin pausa. Recuerda respirar hondo, mirar el horizonte y confiar en el camino que has elegido. Que la luz del entendimiento te acompañe en cada decisión.";
        const trozos = trocearTexto(frase, 200);
        // Todos los trozos dentro del límite y ninguno vacío.
        for (const trozo of trozos) {
            expect(trozo.length).toBeGreaterThan(0);
            expect(trozo.length).toBeLessThanOrEqual(200);
        }
        // Más de un trozo para un texto de ~520 caracteres.
        expect(trozos.length).toBeGreaterThan(1);
        // La unión contiene TODAS las palabras del original (nada se pierde).
        const union = trozos.join(" ");
        const palabrasOriginal = palabras(frase);
        const palabrasUnion = palabras(union);
        for (const p of palabrasOriginal) {
            expect(palabrasUnion.has(p)).toBe(true);
        }
        // Ninguna palabra quedó cortada: cada trozo empieza y termina en frontera.
        for (const trozo of trozos) {
            expect(/^\s/.test(trozo)).toBe(false);
            expect(/\s$/.test(trozo)).toBe(false);
        }
    });

    it("devuelve exactamente un trozo para un texto corto", () => {
        const corto = "Hola, red StarSeed, que la luz te acompañe hoy.";
        const trozos = trocearTexto(corto, 200);
        expect(trozos).toEqual([corto]);
    });

    it("parte por espacios una frase única sin puntuación", () => {
        const fraseLarga = "Aurora la mente amplificada te guía por la vastedad del conocimiento infinito y compartido en esta red soberana de conciencia colectiva y abundancia".repeat(6);
        // Sin puntuación ni comas, solo espacios; largo total >> 200.
        expect(/[.!?;:,]/.test(fraseLarga)).toBe(false);
        const trozos = trocearTexto(fraseLarga, 200);
        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeGreaterThan(0);
            expect(trozo.length).toBeLessThanOrEqual(200);
        }
        // Ninguna palabra cortada en este caso sin puntuación.
        const union = trozos.join(" ");
        for (const p of palabras(fraseLarga)) {
            expect(palabras(union).has(p)).toBe(true);
        }
    });
});