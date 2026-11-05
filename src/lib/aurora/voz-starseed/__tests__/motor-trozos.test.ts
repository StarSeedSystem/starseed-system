/**
 * Pruebas PURAS del troceado de texto en el motor de voz StarSeed (Ola 1105 · VOZ).
 * Contrato: funciones puras, sin red, sin disco, sin procesos lanzados.
 * Importar solo `describe`, `it`, `expect` de vitest (`globals: false`).
 */

import { describe, expect, it } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";

/** Palabras de un texto (set sin duplicados), para comprobar que nada se pierde. */
function palabras(texto: string): Set<string> {
    return new Set(texto.split(/\s+/).filter(Boolean));
}

describe("motor de voz · troceo para nube", () => {
    it("trocea un texto largo por frases en trozos de ≤ 500 sin cortar palabras", () => {
        const frase =
            "Buenos días, viajero. Hoy la red StarSeed te saluda con un mensaje claro y sereno: la conciencia se expande paso a paso, sin prisa y sin pausa. Recuerda respirar hondo, mirar el horizonte y confiar en el camino que has elegido. Que la luz del entendimiento te acompañe en cada decisión. El sistema Aurora refuerza el aprendizaje continuo y la expansión consciente del conocimiento en todas las esferas. Cada neurona de la red contribuye al crecimiento colectivo y la voz del sistema se proyecta armónicamente través de la malla de conexiones entre dispositivos, creando un flujo sostenido de información sensorial que nutre la conciencia compartida de la comunidad StarSeed en su totalidad sin excepción alguna.";
        const trozos = trocearTexto(frase, 500);
        // Todos los trozos dentro del límite y ninguno vacío.
        for (const trozo of trozos) {
            expect(trozo.length).toBeGreaterThan(0);
            expect(trozo.length).toBeLessThanOrEqual(500);
        }
        // Texto largo (> 500 chars) produce varios trozos.
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

    it("devuelve exactamente un trozo para un texto corto dentro de límite", () => {
        const corto = "Hola, red StarSeed, que la luz te acompañe hoy.";
        const trozos = trocearTexto(corto, 500);
        expect(trozos).toEqual([corto]);
    });

    it("parte por espacios una frase única sin puntuación usando límite 500", () => {
        const fraseLarga =
            "Aurora la mente amplificada te guía por la vastedad del conocimiento infinito y compartido en esta red soberana de conciencia colectiva y abundancia".repeat(6);
        // Sin puntuación ni comas, solo espacios; largo total >> 500.
        expect(/[.!?;:,]/.test(fraseLarga)).toBe(false);
        const trozos = trocearTexto(fraseLarga, 500);
        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeGreaterThan(0);
            expect(trozo.length).toBeLessThanOrEqual(500);
        }
        // Ninguna palabra cortada en este caso sin puntuación.
        const union = trozos.join(" ");
        for (const p of palabras(fraseLarga)) {
            expect(palabras(union).has(p)).toBe(true);
        }
    });
});