/**
 * PowerInfer (Ola 1025R): modelos en el catálogo y funciones puras de núcleo.
 * Solo funciones puras: sin disco, sin red, sin importar `route.ts`.
 */
import { describe, expect, it } from "vitest";
import { catalogoRecursos } from "../catalogo";
import { MODELOS_POWERINFER, elegirNucleoPowerInfer, isaDeProcCpuinfo, maxNCached } from "../extras-powerinfer";

const CPUINFO_ARM = [
    "processor\t: 0",
    "BogoMIPS\t: 48.00",
    "Features\t: fp asimd evtstrm aes asimddp i8mm",
    "CPU implementer\t: 0x41",
].join("\n");

const CPUINFO_X86 = [
    "processor\t: 0",
    "vendor_id\t: GenuineIntel",
    "flags\t\t: fpu sse2 avx2 avx512f",
].join("\n");

describe("PowerInfer · catálogo", () => {
    const cat = catalogoRecursos();
    const ids = MODELOS_POWERINFER.map((m) => m.id);

    it("dos modelos con ids únicos y presentes en catalogoRecursos()", () => {
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        for (const id of ids) {
            expect(cat.filter((m) => m.id === id)).toHaveLength(1);
        }
    });

    it("contrato mínimo: capacidades, medios, RAM y disco", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
            expect(m.disco.verificado, m.id).toBe(true);
        }
    });

    it("runtime, plataformas y servidor comunes de PowerInfer", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.runtime).toBe("powerinfer");
            expect(m.formato).toBe("gguf");
            expect(m.bits).toBe(4);
            expect(m.origen).toBe("biblioteca");
            expect(m.estado).toBe("en-pruebas");
            expect(m.so).toEqual(["Linux", "Android"]);
            expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(m.aceleradoresRequeridos).toEqual(["neon", "avx2", "avx512"]);
            expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        }
    });

    it("sha y bytes del archivo real anotados en cada ficha", () => {
        expect(MODELOS_POWERINFER[0].notas).toContain("2.292.487.712 bytes");
        expect(MODELOS_POWERINFER[0].notas).toContain(
            "defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c",
        );
        expect(MODELOS_POWERINFER[1].notas).toContain("12.144.740.608 bytes");
        expect(MODELOS_POWERINFER[1].notas).toContain(
            "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb",
        );
    });
});

describe("maxNCached", () => {
    it("768 expertos por GiB, con 0 fuera de rango", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(Number.NaN)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    it("ARM: asimd → neon, asimddp → dotprod, i8mm", () => {
        expect(isaDeProcCpuinfo(CPUINFO_ARM)).toEqual({
            neon: true, dotprod: true, i8mm: true, avx2: false, avx512: false,
        });
    });

    it("x86: avx2 y avx512f en flags", () => {
        expect(isaDeProcCpuinfo(CPUINFO_X86)).toEqual({
            neon: false, dotprod: false, i8mm: false, avx2: true, avx512: true,
        });
    });
});

describe("elegirNucleoPowerInfer", () => {
    it("ARM con neon y dotprod → neon-dotprod", () => {
        expect(elegirNucleoPowerInfer(isaDeProcCpuinfo(CPUINFO_ARM), "arm64").nucleo).toBe("neon-dotprod");
    });

    it("x86_64 con avx512 → avx512 (aunque también tenga avx2)", () => {
        expect(elegirNucleoPowerInfer(isaDeProcCpuinfo(CPUINFO_X86), "x86_64").nucleo).toBe("avx512");
    });

    it("x86_64 solo con avx2 → avx2", () => {
        const isa = { neon: false, dotprod: false, i8mm: false, avx2: true, avx512: false };
        expect(elegirNucleoPowerInfer(isa, "x86_64").nucleo).toBe("avx2");
    });

    it("lo demás → generico con el motivo honesto", () => {
        const isa = { neon: true, dotprod: false, i8mm: false, avx2: false, avx512: false };
        expect(elegirNucleoPowerInfer(isa, "arm64")).toEqual({
            nucleo: "generico", motivo: "sin dotprod ni AVX2: sin ganancia esperada",
        });
        expect(elegirNucleoPowerInfer(isaDeProcCpuinfo(""), "otra").nucleo).toBe("generico");
    });
});
