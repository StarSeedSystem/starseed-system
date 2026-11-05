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
});
