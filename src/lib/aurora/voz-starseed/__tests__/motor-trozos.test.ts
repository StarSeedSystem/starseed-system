import { describe, it, expect } from "vitest";
import { trocearTexto } from "@/lib/voces/trocear";

describe("motor-trozos", () => {
    it("trocea textos largos correctamente", () => {
        const texto = "Este es un mensaje de prueba bastante largo para verificar que el troceado funciona perfectamente y divide el contenido en trozos menores o iguales al tamaño indicado sin romper palabras a la mitad ni perder trozos por el camino.";
        const trozos = trocearTexto(texto, 50);
        expect(trozos.length).toBeGreaterThan(1);
        for (const t of trozos) {
            expect(t.length).toBeLessThanOrEqual(50);
        }
    });

    it("maneja textos cortos sin trocear", () => {
        const texto = "Hola mundo";
        const trozos = trocearTexto(texto, 100);
        expect(trozos).toEqual(["Hola mundo"]);
    });
});
