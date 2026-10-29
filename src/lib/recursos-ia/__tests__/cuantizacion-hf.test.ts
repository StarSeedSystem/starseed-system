/**
 * Pruebas del módulo de referencia de cuantización de transformers: datos completos,
 * filtrado por dispositivo y opciones, y orden por soporte. Todo puro, sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import { cuantizacionesPara, FUENTE_METODOS_HF, METODOS_HF, NOTA_BITNET } from "../cuantizacion-hf";

const ids = (dispositivo: Parameters<typeof cuantizacionesPara>[0], op?: Parameters<typeof cuantizacionesPara>[1]) =>
    cuantizacionesPara(dispositivo, op).map((m) => m.id);

describe("tabla de métodos", () => {
    it("trae los 9 métodos con ids únicos y soporte completo por dispositivo", () => {
        expect(METODOS_HF).toHaveLength(9);
        expect(new Set(METODOS_HF.map((m) => m.id)).size).toBe(9);
        for (const m of METODOS_HF) {
            expect(Object.keys(m.soporte).sort()).toEqual(["cpu", "cuda", "intel", "metal", "rocm"]);
            expect(m.bitsMin).toBeLessThanOrEqual(m.bitsMax);
            expect(m.enlace).toMatch(/^https:\/\//);
        }
    });
});

describe("cuantizacionesPara", () => {
    it("en metal: GGUF, GPT-QModel, Metal y optimum-quanto con ok antes que bitsandbytes", () => {
        const r = cuantizacionesPara("metal");
        const idx = (id: string) => r.findIndex((m) => m.id === id);
        for (const id of ["gguf", "gptqmodel", "metal-kernels", "optimum-quanto"]) expect(idx(id)).toBeGreaterThanOrEqual(0);
        expect(idx("bitsandbytes")).toBeGreaterThan(idx("gguf"));
        expect(idx("bitsandbytes")).toBeGreaterThan(idx("gptqmodel"));
        expect(idx("bitsandbytes")).toBeGreaterThan(idx("metal-kernels"));
        expect(idx("bitsandbytes")).toBeGreaterThan(idx("optimum-quanto"));
        const ok = r.slice(0, 4).every((m) => m.soporte.metal === "ok");
        expect(ok).toBe(true);
    });

    it("en rocm salen AWQ y GPT-QModel, y nada sin soporte", () => {
        const r = cuantizacionesPara("rocm");
        expect(r.map((m) => m.id)).toContain("awq");
        expect(r.map((m) => m.id)).toContain("gptqmodel");
        for (const m of r) expect(m.soporte.rocm).not.toBe("no");
    });

    it("cuda al vuelo con PEFT incluye bitsandbytes y HQQ, y deja fuera a GGUF", () => {
        const r = cuantizacionesPara("cuda", { alaVuelta: true, peft: true });
        const lista = ids("cuda", { alaVuelta: true, peft: true });
        expect(lista).toContain("bitsandbytes");
        expect(lista).toContain("hqq");
        expect(lista).not.toContain("gguf");
        for (const m of r) {
            expect(m.alaVuelta).toBe(true);
            expect(m.peft).toBe(true);
        }
    });

    it("con bitsMax 2 quedan fuera AWQ y bitsandbytes (su mínimo es 4)", () => {
        const r = cuantizacionesPara("cuda", { bitsMax: 2 });
        const lista = ids("cuda", { bitsMax: 2 });
        expect(lista).not.toContain("awq");
        expect(lista).not.toContain("bitsandbytes");
        for (const m of r) expect(m.bitsMin).toBeLessThanOrEqual(2);
    });

    it("en intel no sale ningún método sin soporte (Metal fuera, SINQ entra como parcial)", () => {
        const r = cuantizacionesPara("intel");
        const lista = ids("intel");
        expect(lista).not.toContain("metal-kernels");
        expect(lista).toContain("sinq");
        for (const m of r) expect(m.soporte.intel).not.toBe("no");
    });
});

describe("procedencia y avisos", () => {
    it("la fuente cita el commit y la nota avisa sobre BitNet", () => {
        expect(FUENTE_METODOS_HF).toContain("50e35cc");
        expect(NOTA_BITNET).toContain("BitNet");
    });
});
