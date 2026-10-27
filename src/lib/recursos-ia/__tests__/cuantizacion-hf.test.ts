/**
 * Pruebas de la matriz de cuantización de Transformers (módulo puro: entrada → salida).
 */
import { describe, expect, it } from "vitest";
import { METODOS_HF, NOTA_BITNET, cuantizacionesPara } from "../cuantizacion-hf";

describe("matriz de cuantización de Transformers", () => {
    it("los ids son únicos y está el método torchao con peft desconocido (null)", () => {
        const ids = METODOS_HF.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(METODOS_HF).toHaveLength(9);
        const torchao = METODOS_HF.find((m) => m.id === "torchao");
        expect(torchao?.peft).toBe(null);
        expect(torchao?.soporte.rocm).toBe("no");
    });

    it("en metal salen GGUF, GPT-QModel, optimum-quanto y Metal, con Metal (ok) antes que bitsandbytes (parcial)", () => {
        const enMetal = cuantizacionesPara("metal");
        const ids = enMetal.map((m) => m.id);
        expect(ids).toEqual(expect.arrayContaining(["gguf", "gptqmodel", "optimum-quanto", "metal"]));
        expect(ids).not.toContain("awq"); // AWQ y HQQ no soportan metal
        expect(ids.indexOf("metal")).toBeLessThan(ids.indexOf("bitsandbytes"));
        expect(enMetal.every((m) => m.soporte.metal !== "no")).toBe(true);
    });

    it("en rocm solo salen AWQ y GPT-QModel entre los de soporte entero", () => {
        const enRocm = cuantizacionesPara("rocm");
        const ids = enRocm.map((m) => m.id);
        expect(ids).toEqual(expect.arrayContaining(["awq", "gptqmodel"]));
        expect(ids).not.toContain("hqq");
        expect(ids).not.toContain("metal");
        // SINQ y bitsandbytes son parcial en rocm: detrás de los ok (AWQ, GPT-QModel).
        expect(ids.indexOf("sinq")).toBeGreaterThan(ids.indexOf("awq"));
        expect(enRocm.every((m) => m.soporte.rocm !== "no")).toBe(true);
    });

    it("con { alaVuelta: true, peft: true } en cuda entran bitsandbytes y HQQ, y no GGUF", () => {
        const enCuda = cuantizacionesPara("cuda", { alaVuelta: true, peft: true });
        const ids = enCuda.map((m) => m.id);
        expect(ids).toEqual(expect.arrayContaining(["bitsandbytes", "hqq"]));
        expect(ids).not.toContain("gguf");
        expect(ids).not.toContain("awq"); // no cuantiza al vuelo
        expect(ids).not.toContain("torchao"); // peft desconocido
        expect(enCuda.every((m) => m.alaVuelta && m.peft === true)).toBe(true);
    });

    it("{ bitsMax: 2 } deja fuera AWQ y bitsandbytes (no llega a 2 bits)", () => {
        const cortos = cuantizacionesPara("cpu", { bitsMax: 2 });
        const ids = cortos.map((m) => m.id);
        expect(ids).not.toContain("awq");
        expect(ids).not.toContain("bitsandbytes");
        // Sí entran los que admiten 2 bits o menos, y ninguno se pasa.
        expect(ids).toEqual(expect.arrayContaining(["gguf", "gptqmodel", "hqq", "optimum-quanto", "sinq"]));
        expect(cortos.every((m) => m.bitsMin <= 2)).toBe(true);
    });

    it("en intel no sale ningún método sin soporte y por nombre con ok primero", () => {
        const enIntel = cuantizacionesPara("intel");
        expect(enIntel.length).toBeGreaterThan(0);
        expect(enIntel.every((m) => m.soporte.intel !== "no")).toBe(true);
        // Los ok quedan antes que los parciales (SINQ es el único parcial en intel).
        const parciales = enIntel.filter((m) => m.soporte.intel === "parcial");
        if (parciales.length > 0) {
            expect(enIntel.indexOf(parciales[0])).toBeGreaterThan(enIntel.indexOf(enIntel[0]));
            expect(parciales.map((m) => m.id)).toEqual(["sinq"]);
        }
    });

    it("la nota de BitNet avisa de que no se cuantiza al vuelo", () => {
        expect(NOTA_BITNET).toContain("BitNet");
        expect(NOTA_BITNET).toContain("Ternary Bonsai");
        expect(NOTA_BITNET).toContain("QAT");
    });
});
