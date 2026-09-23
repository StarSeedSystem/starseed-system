import { describe, expect, it } from "vitest";
import { frasesParaVoz, vozDePersona } from "@/lib/aurora/voz-rt";

describe("frasesParaVoz", () => {
    it("vacío → nada", () => {
        expect(frasesParaVoz("")).toEqual([]);
        expect(frasesParaVoz("   ")).toEqual([]);
    });

    it("la primera frase sale sola para que el primer audio llegue pronto", () => {
        const f = frasesParaVoz("Hola, soy Astraura. Te cuento lo que he visto hoy en la malla. Todo en orden.");
        expect(f[0]).toBe("Hola, soy Astraura.");
        expect(f.join(" ")).toBe("Hola, soy Astraura. Te cuento lo que he visto hoy en la malla. Todo en orden.");
    });

    it("junta los trozos muy cortos con el siguiente", () => {
        const f = frasesParaVoz("Sí. Claro. Vale, lo hago ahora mismo y te aviso cuando termine.");
        expect(f[0].startsWith("Sí. Claro.")).toBe(true);
    });

    it("ninguna frase pasa del máximo y no se pierde texto", () => {
        const larga = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(" ") + ", y otra cosa más al final";
        const f = frasesParaVoz(larga, 120);
        for (const x of f) expect(x.length).toBeLessThanOrEqual(121);
        expect(f.join(" ").replace(/\s+/g, " ")).toBe(larga);
    });
});

describe("vozDePersona", () => {
    it("cada personalidad suena siempre igual", () => {
        expect(vozDePersona("astraura")).toBe("F1");
        expect(vozDePersona("Hermes")).toBe("M2");
        expect(vozDePersona("desconocida")).toBe("F1");
    });
});
