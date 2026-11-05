import { describe, it, expect } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";

describe("motor por trozos - lógica de troceado", () => {
    it("debe partir textos largos respetando fronteras", () => {
        const textoLargo = "Esta es una frase larga. ".repeat(20);
        const trozos = trocearTexto(textoLargo, 200);

        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(200);
        }
    });

    it("nube (500): un texto de 1500 chars produce 3-4 trozos", () => {
        const texto1500 = "Esta es una frase de prueba para medir el troceado. ".repeat(30);
        expect(texto1500.length).toBeGreaterThanOrEqual(1500);

        const trozos = trocearTexto(texto1500.slice(0, 1500), 500);

        expect(trozos.length).toBeGreaterThanOrEqual(3);
        expect(trozos.length).toBeLessThanOrEqual(4);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(500);
            expect(trozo.length).toBeGreaterThan(0);
        }
    });

    it("sistema (200): un texto de 1500 chars produce ~8 trozos", () => {
        const texto1500 = "Esta es una frase de prueba para medir el troceado. ".repeat(30);
        expect(texto1500.length).toBeGreaterThanOrEqual(1500);

        const trozos = trocearTexto(texto1500.slice(0, 1500), 200);

        expect(trozos.length).toBeGreaterThanOrEqual(7);
        expect(trozos.length).toBeLessThanOrEqual(11);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(200);
            expect(trozo.length).toBeGreaterThan(0);
        }
    });

    it("respeta fronteras de frase (puntuación fuerte + espacio)", () => {
        const texto = "Primera frase. Segunda frase. Tercera frase más larga para probar. Cuarta.";
        const trozos = trocearTexto(texto, 40);

        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(40);
            expect(trozo.trim()).toBe(trozo);
        }
        const unido = trozos.join(" ");
        expect(unido).toContain("Primera frase.");
        expect(unido).toContain("Segunda frase.");
    });

    it("respeta fronteras de coma si no hay frases", () => {
        const texto = "Uno, dos, tres, cuatro, cinco, seis, siete, ocho, nueve, diez";
        const trozos = trocearTexto(texto, 25);

        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(25);
        }
    });

    it("corta por espacio si no hay puntuación", () => {
        const texto = "uno dos tres cuatro cinco seis siete ocho nueve diez once doce";
        const trozos = trocearTexto(texto, 20);

        expect(trozos.length).toBeGreaterThan(1);
        for (const trozo of trozos) {
            expect(trozo.length).toBeLessThanOrEqual(20);
        }
    });

    it("no corta palabras a la mitad cuando hay espacio", () => {
        const texto = "palabralarguísima palabraotra más";
        const trozos = trocearTexto(texto, 15);

        for (const trozo of trozos) {
            expect(trozo).not.toMatch(/palabralarguísim$/);
            expect(trozo).not.toMatch(/^a más$/);
        }
    });

    it("texto vacío devuelve array vacío", () => {
        expect(trocearTexto("", 200)).toEqual([]);
        expect(trocearTexto("   ", 200)).toEqual([]);
    });

    it("texto menor que max devuelve un solo trozo", () => {
        const trozos = trocearTexto("Hola mundo", 200);
        expect(trozos).toEqual(["Hola mundo"]);
    });

    it("normaliza espacios múltiples", () => {
        const trozos = trocearTexto("Hola    mundo   prueba", 10);
        const unido = trozos.join(" ");
        expect(unido).not.toMatch(/\s{2,}/);
    });

    it("nube: orden de trozos secuencial para 1500 chars", () => {
        const base = "Fragmento de texto para comprobar el orden. ";
        const texto = base.repeat(25);
        const trozos = trocearTexto(texto.slice(0, 1500), 500);

        let pos = 0;
        for (const trozo of trozos) {
            const idx = texto.indexOf(trozo, pos);
            expect(idx).toBeGreaterThanOrEqual(pos);
            pos = idx + trozo.length;
        }
    });

    it("sistema: orden de trozos secuencial para 1500 chars", () => {
        const base = "Fragmento de texto para comprobar el orden. ";
        const texto = base.repeat(25);
        const trozos = trocearTexto(texto.slice(0, 1500), 200);

        let pos = 0;
        for (const trozo of trozos) {
            const idx = texto.indexOf(trozo, pos);
            expect(idx).toBeGreaterThanOrEqual(pos);
            pos = idx + trozo.length;
        }
    });
});