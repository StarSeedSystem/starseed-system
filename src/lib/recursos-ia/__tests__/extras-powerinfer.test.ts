import { describe, expect, it } from "vitest";
import { MODELOS_POWERINFER, elegirNucleoPowerInfer, isaDeProcCpuinfo, maxNCached } from "../extras-powerinfer";
import { catalogoRecursos, modeloPorId } from "../catalogo";

describe("PowerInfer · SmallThinker en el catálogo", () => {
    it("están en catalogoRecursos() con ids únicos", () => {
        const ids = MODELOS_POWERINFER.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        const cat = catalogoRecursos();
        for (const id of ids) expect(modeloPorId(id, cat), id).toBeDefined();
    });

    it("cumplen el contrato mínimo del catálogo", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
            expect(m.disco.verificado, m.id).toBe(true);
            expect(m.bits, m.id).toBe(4);
            expect(m.formato, m.id).toBe("gguf");
            expect(m.runtime, m.id).toBe("powerinfer");
            expect(m.origen, m.id).toBe("biblioteca");
            expect(m.estado, m.id).toBe("en-pruebas");
            expect(m.servidor, m.id).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        }
    });

    it("sha y bytes de los dos pesos quedan anotados en notas", () => {
        const notas4 = modeloPorId("smallthinker-4b-a06b-powerinfer")!.notas ?? "";
        const notas21 = modeloPorId("smallthinker-21b-a3b-powerinfer")!.notas ?? "";
        expect(notas4).toContain("SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf");
        expect(notas4).toContain("2.292.487.712 bytes");
        expect(notas4).toContain("defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c");
        expect(notas21).toContain("SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf");
        expect(notas21).toContain("12.144.740.608 bytes");
        expect(notas21).toContain("9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb");
    });
});

describe("maxNCached (regla del README: 768 expertos por GiB)", () => {
    it("21B con 8 GiB da 6144; 4B con 1 GiB da 768; límites inválidos a cero", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        for (const malo of [-1, 0, NaN, Infinity]) expect(maxNCached(malo), String(malo)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    const arm = "processor\t: 0\nFeatures\t: fp asimd evtstrm aes asimddp i8mm\nCPU implementer\t: 0x41\n";
    const x86 = "processor\t: 0\n flags\t\t: fpu sse2 sse4_2 avx2 avx512f\n";
    const vacio = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };

    it("ARM: la línea Features (asimd, asimddp, i8mm) marca neon, dotprod e i8mm", () => {
        expect(isaDeProcCpuinfo(arm)).toEqual({ ...vacio, neon: true, dotprod: true, i8mm: true });
    });

    it("x86: la línea flags (avx2, avx512f) marca avx2 y avx512", () => {
        expect(isaDeProcCpuinfo(x86)).toEqual({ ...vacio, avx2: true, avx512: true });
    });

    it("un texto sin línea de ISA sale vacío", () => {
        expect(isaDeProcCpuinfo("")).toEqual(vacio);
    });
});

describe("elegirNucleoPowerInfer (cuatro desenlaces)", () => {
    const todo = isaDeProcCpuinfo("Features\t: asimd asimddp i8mm\nflags\t\t: avx2 avx512f");

    it("ARM con NEON y dotprod → núcleo disperso NEON+dotprod", () => {
        expect(elegirNucleoPowerInfer(todo, "arm64")).toEqual({
            nucleo: "neon-dotprod",
            motivo: "NEON con dotprod: núcleo disperso NEON+dotprod de PowerInfer.",
        });
    });

    it("x86_64: con AVX-512 gana el núcleo avx512; sin AVX-512 pero con AVX2 → avx2", () => {
        expect(elegirNucleoPowerInfer(todo, "x86_64")).toEqual({
            nucleo: "avx512",
            motivo: "AVX-512 disponible: núcleo disperso AVX-512 de PowerInfer.",
        });
        expect(elegirNucleoPowerInfer(isaDeProcCpuinfo("flags\t\t: fpu avx2\n"), "x86_64")).toEqual({
            nucleo: "avx2",
            motivo: "AVX2 disponible: núcleo disperso AVX2 de PowerInfer.",
        });
    });

    it("lo demás (otra/wasm, ARM sin dotprod) → genérico sin ganancia esperada", () => {
        for (const arq of ["otra", "wasm"] as const) expect(elegirNucleoPowerInfer(todo, arq).nucleo, arq).toBe("generico");
        expect(elegirNucleoPowerInfer(isaDeProcCpuinfo("Features\t: asimd\n"), "arm64")).toEqual({
            nucleo: "generico",
            motivo: "sin dotprod ni AVX2: sin ganancia esperada",
        });
    });
});
