import { describe, it, expect } from "vitest";
import { METODOS_HF, NOTA_BITNET, cuantizacionesPara } from "../cuantizacion-hf";

describe("METODOS_HF", () => {
    it("tiene ids únicos", () => {
        const ids = METODOS_HF.map((m) => m.id);
        expect(new Set(ids).size).toBe(9);
        expect(METODOS_HF).toHaveLength(9);
    });
});

describe("cuantizacionesPara · metal", () => {
    const lista = cuantizacionesPara("metal").map((m) => m.nombre);
    it("salen GGUF, GPT-QModel, optimum-quanto y Metal", () => {
        expect(lista).toContain("GGUF (llama.cpp)");
        expect(lista).toContain("GPT-QModel");
        expect(lista).toContain("optimum-quanto");
        expect(cuantizacionesPara("metal").some((m) => m.id === "metal")).toBe(true);
    });
    it("ok antes que bitsandbytes (parcial)", () => {
        expect(lista.indexOf("GGUF (llama.cpp)")).toBeLessThan(lista.indexOf("bitsandbytes"));
    });
});

describe("cuantizacionesPara · rocm", () => {
    it("salen AWQ y GPT-QModel", () => {
        const lista = cuantizacionesPara("rocm").map((m) => m.nombre);
        expect(lista).toContain("AWQ");
        expect(lista).toContain("GPT-QModel");
        expect(lista).not.toContain("HQQ");
    });
});

describe("filtros combinados", () => {
    it("alaVuelta + peft en cuda incluye bitsandbytes y HQQ pero no GGUF", () => {
        const lista = cuantizacionesPara("cuda", { alaVuelta: true, peft: true }).map((m) => m.nombre);
        expect(lista).toContain("bitsandbytes");
        expect(lista).toContain("HQQ");
        expect(lista).not.toContain("GGUF (llama.cpp)");
    });
    it("bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
        const lista = cuantizacionesPara("cuda", { bitsMax: 2 }).map((m) => m.nombre);
        expect(lista).not.toContain("AWQ");
        expect(lista).not.toContain("bitsandbytes");
    });
});

describe("cuantizacionesPara · intel", () => {
    it("no sale ningún método sin soporte", () => {
        for (const m of cuantizacionesPara("intel")) {
            expect(m.soporte.intel).not.toBe("no");
        }
    });
});

describe("NOTA_BITNET", () => {
    it("menciona BitNet", () => {
        expect(NOTA_BITNET).toContain("BitNet");
    });
});
