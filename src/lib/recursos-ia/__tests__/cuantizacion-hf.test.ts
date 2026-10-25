import { describe, expect, it } from "vitest";
import type { Procesador } from "../tipos";
import {
    METODOS_HF,
    NOTA_BITNET,
    cuantizacionesPara,
    dispositivoDe,
} from "../cuantizacion-hf";

describe("matriz de cuantización de transformers", () => {
    it("ids únicos en los 9 métodos", () => {
        expect(METODOS_HF).toHaveLength(9);
        expect(new Set(METODOS_HF.map((m) => m.id)).size).toBe(9);
    });

    it("en metal salen los que soporta y ok antes que parcial", () => {
        const metal = cuantizacionesPara("metal");
        const ids = metal.map((m) => m.id);
        expect(ids).toContain("gguf-llamacpp");
        expect(ids).toContain("gptqmodel");
        expect(ids).toContain("optimum-quanto");
        expect(ids).toContain("metal-apple-silicon");

        const okIds = metal.filter((m) => m.soporte.metal === "ok").map((m) => m.id);
        const primerosOk = okIds.findIndex((id) => id === "bitsandbytes");
        expect(primerosOk).toBe(-1);
        expect(metal.findIndex((m) => m.id === "bitsandbytes")).toBeGreaterThan(
            metal.findIndex((m) => m.id === "gptqmodel"),
        );
    });

    it("en rocm salen AWQ y GPT-QModel", () => {
        const rocm = cuantizacionesPara("rocm").map((m) => m.id);
        expect(rocm).toContain("awq");
        expect(rocm).toContain("gptqmodel");
    });

    it("al vuelo con peft en cuda: bitsandbytes y HQQ sí, GGUF no", () => {
        const cuda = cuantizacionesPara("cuda", { alaVuelta: true, peft: true }).map((m) => m.id);
        expect(cuda).toContain("bitsandbytes");
        expect(cuda).toContain("hqq");
        expect(cuda).not.toContain("gguf-llamacpp");
    });

    it("bitsMax 2 deja fuera AWQ y bitsandbytes", () => {
        const acotado = cuantizacionesPara("cpu", { bitsMax: 2 }).map((m) => m.id);
        expect(acotado).not.toContain("awq");
        expect(acotado).not.toContain("bitsandbytes");
        expect(acotado).toContain("gptqmodel");
    });

    it("en intel nada del resultado tiene soporte no", () => {
        const intel = cuantizacionesPara("intel");
        expect(intel.length).toBeGreaterThan(0);
        expect(intel.every((m) => m.soporte.intel !== "no")).toBe(true);
    });

    it("la nota de BitNet lo menciona", () => {
        expect(NOTA_BITNET).toContain("BitNet");
    });
});

describe("dispositivoDe: del procesador del inventario a la tabla", () => {
    const procesador = (p: Partial<Procesador>): Procesador => ({
        id: "n:cpu",
        neuronaId: "n",
        tipo: "cpu",
        nombre: "CPU",
        aceleradores: [],
        runtimes: [],
        via: "local",
        disponible: true,
        fuente: "detectado",
        ...p,
    });

    it("la GPU de Apple Silicon con Metal cae en «metal»", () => {
        expect(dispositivoDe(procesador({ tipo: "gpu", nombre: "Apple M1 GPU", aceleradores: ["metal", "metal4"] }))).toBe("metal");
    });

    it("CUDA y ROCm salen de los aceleradores de la GPU", () => {
        expect(dispositivoDe(procesador({ tipo: "gpu", nombre: "RTX 3060", aceleradores: ["cuda", "vulkan"] }))).toBe("cuda");
        expect(dispositivoDe(procesador({ tipo: "gpu", nombre: "Radeon", aceleradores: ["rocm"] }))).toBe("rocm");
    });

    it("una CPU de Linux y un servidor declarado quedan en «cpu»", () => {
        expect(dispositivoDe(procesador({ so: "Linux", arquitectura: "x86_64", aceleradores: ["avx2"] }))).toBe("cpu");
        expect(dispositivoDe(procesador({ tipo: "servidor", via: "internet" }))).toBe("cpu");
    });

    it("webgpu, npu y antena no cuadran con ninguna columna", () => {
        expect(dispositivoDe(procesador({ tipo: "webgpu", aceleradores: ["webgpu", "wasm-simd"] }))).toBeNull();
        expect(dispositivoDe(procesador({ tipo: "npu", aceleradores: ["ane", "coreml"] }))).toBeNull();
        expect(dispositivoDe(procesador({ via: "antena" }))).toBeNull();
    });

    it("la sugerencia para el dispositivo nunca trae métodos con soporte «no»", () => {
        const metal = dispositivoDe(procesador({ tipo: "gpu", aceleradores: ["metal4"] }));
        expect(metal && cuantizacionesPara(metal).every((m) => m.soporte[metal] !== "no")).toBe(true);
    });
});
