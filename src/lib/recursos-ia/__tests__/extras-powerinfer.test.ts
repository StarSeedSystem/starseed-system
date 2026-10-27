import { describe, it, expect } from "vitest";
import { catalogoRecursos } from "../catalogo";
import { Arquitectura } from "../tipos";
import {
    maxNCached,
    isaDeProcCpuinfo,
    elegirNucleoPowerInfer,
    MODELOS_POWERINFER,
} from "../extras-powerinfer";

describe("PowerInfer extras", () => {
    describe("MODELOS_POWERINFER", () => {
        it("tiene dos modelos SmallThinker con ids y propiedades esperadas", () => {
            expect(MODELOS_POWERINFER).toHaveLength(2);
            expect(MODELOS_POWERINFER[0].id).toBe("smallthinker-4b-a06b-powerinfer");
            expect(MODELOS_POWERINFER[0].nombre).toBe("SmallThinker 4B-A0.6B (PowerInfer)");
            expect(MODELOS_POWERINFER[0].origen).toBe("biblioteca");
            expect(MODELOS_POWERINFER[0].estado).toBe("en-pruebas");
            expect(MODELOS_POWERINFER[0].runtime).toBe("powerinfer");
            expect(MODELOS_POWERINFER[0].formato).toBe("gguf");
            expect(MODELOS_POWERINFER[0].bits).toBe(4);
            expect(MODELOS_POWERINFER[0].capacidades).toEqual(["texto", "razon"]);
            expect(MODELOS_POWERINFER[0].arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(MODELOS_POWERINFER[0].so).toEqual(["Linux", "Android"]);
            expect(MODELOS_POWERINFER[0].ramMinGb).toBe(4);
            expect(MODELOS_POWERINFER[0].almacenamiento.modo).toBe("mmap");
            expect(MODELOS_POWERINFER[0].almacenamiento.soloLocal).toBe(true);
            expect(MODELOS_POWERINFER[0].servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });

            expect(MODELOS_POWERINFER[1].id).toBe("smallthinker-21b-a3b-powerinfer");
            expect(MODELOS_POWERINFER[1].nombre).toBe("SmallThinker 21B-A3B (PowerInfer)");
            expect(MODELOS_POWERINFER[1].origen).toBe("biblioteca");
            expect(MODELOS_POWERINFER[1].estado).toBe("en-pruebas");
            expect(MODELOS_POWERINFER[1].runtime).toBe("powerinfer");
            expect(MODELOS_POWERINFER[1].formato).toBe("gguf");
            expect(MODELOS_POWERINFER[1].bits).toBe(4);
            expect(MODELOS_POWERINFER[1].capacidades).toEqual(["texto", "razon"]);
            expect(MODELOS_POWERINFER[1].arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(MODELOS_POWERINFER[1].so).toEqual(["Linux", "Android"]);
            expect(MODELOS_POWERINFER[1].ramMinGb).toBe(8);
            expect(MODELOS_POWERINFER[1].almacenamiento.modo).toBe("streaming-ssd");
            expect(MODELOS_POWERINFER[1].almacenamiento.soloLocal).toBe(true);
            expect(MODELOS_POWERINFER[1].servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        });
    });

    describe("maxNCached", () => {
        it("calcula correctamente el número de tokens en caché", () => {
            expect(maxNCached(8)).toBe(6144);
            expect(maxNCached(1)).toBe(768);
            expect(maxNCached(-1)).toBe(0);
            expect(maxNCached(NaN)).toBe(0);
            expect(maxNCached(0)).toBe(0);
            expect(maxNCached(Infinity)).toBe(0);
            expect(maxNCached(null as unknown as number)).toBe(0);
            expect(maxNCached(undefined as unknown as number)).toBe(0);
        });
    });

    describe("isaDeProcCpuinfo", () => {
        it("detecta características ARM (asimd, dotprod/i8mm)", () => {
            const cpuinfoArm = "Processor : ARMv7\nFeatures: fp asimd evtstrm aes asimddp i8mm";
            const result = isaDeProcCpuinfo(cpuinfoArm);
            expect(result.neon).toBe(true);
            expect(result.dotprod).toBe(true);
            expect(result.i8mm).toBe(true);
            expect(result.avx2).toBe(false);
            expect(result.avx512).toBe(false);
        });

        it("detecta características x86 (avx2, avx512f)", () => {
            const cpuinfoX86 = "model name : Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz\nflags : fpu sse2 avx2 avx512f";
            const result = isaDeProcCpuinfo(cpuinfoX86);
            expect(result.neon).toBe(false);
            expect(result.dotprod).toBe(false);
            expect(result.i8mm).toBe(false);
            expect(result.avx2).toBe(true);
            expect(result.avx512).toBe(true);
        });

        it("devuelve falsos para características ausentes", () => {
            const result = isaDeProcCpuinfo("Processor : ARM\nNo features here");
            expect(result.neon).toBe(false);
            expect(result.dotprod).toBe(false);
            expect(result.i8mm).toBe(false);
            expect(result.avx2).toBe(false);
            expect(result.avx512).toBe(false);
        });
    });

    describe("elegirNucleoPowerInfer", () => {
        it("arm64 con neon y dotprod => neon-dotprod", () => {
            const isa = { neon: true, dotprod: true, i8mm: false, avx2: false, avx512: false };
            const arq: Arquitectura = "arm64";
            const result = elegirNucleoPowerInfer(isa, arq);
            expect(result.nucleo).toBe("neon-dotprod");
            expect(result.motivo).toContain("arm64 con soporte neon y dotprod");
        });

        it("x86_64 con avx512 => avx512", () => {
            const isa = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: true };
            const arq: Arquitectura = "x86_64";
            const result = elegirNucleoPowerInfer(isa, arq);
            expect(result.nucleo).toBe("avx512");
            expect(result.motivo).toContain("x86_64 con soporte avx512");
        });

        it("x86_64 con avx2 => avx2", () => {
            const isa = { neon: false, dotprod: false, i8mm: false, avx2: true, avx512: false };
            const arq: Arquitectura = "x86_64";
            const result = elegirNucleoPowerInfer(isa, arq);
            expect(result.nucleo).toBe("avx2");
            expect(result.motivo).toContain("x86_64 con soporte avx2");
        });

        it("lo demás => generico con motivo sin dotprod ni AVX2", () => {
            const isa = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };
            const arq: Arquitectura = "arm64";
            const result = elegirNucleoPowerInfer(isa, arq);
            expect(result.nucleo).toBe("generico");
            expect(result.motivo).toContain("sin dotprod ni AVX2");
        });
    });

    describe("contrato mínimo en catálogo", () => {
        it("todos los modelos del catálogo cumplen el contrato mínimo", () => {
            const cat = catalogoRecursos();
            for (const m of cat) {
                expect(m.capacidades.length, m.id).toBeGreaterThan(0);
                expect(m.medios.length, m.id).toBeGreaterThan(0);
                expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
                expect(m.disco.gb === null || m.disco.gb > 0, m.id).toBe(true);
            }
        });
    });
});