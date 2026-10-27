import { describe, expect, it } from "vitest";
import { catalogoRecursos } from "../catalogo";
import {
    MODELOS_POWERINFER,
    elegirNucleoPowerInfer,
    isaDeProcCpuinfo,
    maxNCached,
} from "../extras-powerinfer";

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

const IDS = [
    "smallthinker-4b-a06b-powerinfer",
    "smallthinker-21b-a3b-powerinfer",
];

describe("MODELOS_POWERINFER · catálogo e ids", () => {
    it("los ids son únicos y están en catalogoRecursos()", () => {
        expect(MODELOS_POWERINFER.map((m) => m.id)).toEqual(IDS);
        expect(new Set(IDS).size).toBe(IDS.length);
        const cat = catalogoRecursos();
        for (const id of IDS) {
            expect(cat.filter((m) => m.id === id)).toHaveLength(1);
        }
    });

    it("cumplen el contrato mínimo del catálogo", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length).toBeGreaterThan(0);
            expect(m.medios.length).toBeGreaterThan(0);
            expect(m.ramMinGb).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb).not.toBeNull();
            expect(m.disco.gb as number).toBeGreaterThan(0);
            expect(m.runtime).toBe("powerinfer");
            expect(m.origen).toBe("biblioteca");
            expect(m.estado).toBe("en-pruebas");
            expect(m.formato).toBe("gguf");
            expect(m.bits).toBe(4);
            expect(m.aceleradoresRequeridos).toEqual(["neon", "avx2", "avx512"]);
            expect(m.herramientasRequeridas).toEqual(["clang-21", "cmake"]);
        }
    });

    it("el sha256 y los bytes del archivo quedan anotados", () => {
        const porId = (id: string) => MODELOS_POWERINFER.find((m) => m.id === id)!;
        const cuatro = porId("smallthinker-4b-a06b-powerinfer");
        expect(cuatro.disco.gb).toBe(2.29);
        expect(cuatro.disco.verificado).toBe(true);
        expect(cuatro.notas).toContain("2.292.487.712 bytes");
        expect(cuatro.notas).toContain("defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c");

        const veintiuno = porId("smallthinker-21b-a3b-powerinfer");
        expect(veintiuno.disco.gb).toBe(12.14);
        expect(veintiuno.disco.verificado).toBe(true);
        expect(veintiuno.almacenamiento.modo).toBe("streaming-ssd");
        expect(veintiuno.notas).toContain("12.144.740.608 bytes");
        expect(veintiuno.notas).toContain("9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb");
    });
});

describe("maxNCached", () => {
    it("768 expertos por GiB", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
    });

    it("un límite inválido no cachea nada", () => {
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
        expect(maxNCached(0)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    it("lee asimd, asimddp e i8mm en ARM", () => {
        expect(isaDeProcCpuinfo(CPUINFO_ARM)).toEqual({
            neon: true,
            dotprod: true,
            i8mm: true,
            avx2: false,
            avx512: false,
        });
    });

    it("lee avx2 y avx512f en x86", () => {
        expect(isaDeProcCpuinfo(CPUINFO_X86)).toEqual({
            neon: false,
            dotprod: false,
            i8mm: false,
            avx2: true,
            avx512: true,
        });
    });
});

describe("elegirNucleoPowerInfer", () => {
    const arm = isaDeProcCpuinfo(CPUINFO_ARM);
    const x86 = isaDeProcCpuinfo(CPUINFO_X86);

    it("ARM con NEON y dotprod usa neon-dotprod", () => {
        expect(elegirNucleoPowerInfer(arm, "arm64").nucleo).toBe("neon-dotprod");
    });

    it("x86 con AVX-512 usa avx512", () => {
        expect(elegirNucleoPowerInfer(x86, "x86_64").nucleo).toBe("avx512");
    });

    it("x86 solo con AVX2 usa avx2", () => {
        const soloAvx2 = { ...x86, avx512: false };
        expect(elegirNucleoPowerInfer(soloAvx2, "x86_64").nucleo).toBe("avx2");
    });

    it("sin dotprod ni AVX2 cae a generico", () => {
        const sinSimd = { neon: true, dotprod: false, i8mm: false, avx2: false, avx512: false };
        const salida = elegirNucleoPowerInfer(sinSimd, "arm64");
        expect(salida.nucleo).toBe("generico");
        expect(salida.motivo).toBe("sin dotprod ni AVX2: sin ganancia esperada");
    });
});
