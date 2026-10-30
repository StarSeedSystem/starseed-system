import { describe, expect, it } from "vitest";
import {
    MODELOS_POWERINFER,
    elegirNucleoPowerInfer,
    isaDeProcCpuinfo,
    maxNCached,
    type IsaProcesador,
} from "../extras-powerinfer";
import { catalogoRecursos } from "../catalogo";

const SHA_4B = "defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c";
const SHA_21B = "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb";
const CPUINFO_ARM =
    "processor : 0\nHardware : Qualcomm Snapdragon 8 Elite\nFeatures : fp asimd evtstrm aes sha1 sha2 crc32 asimddp i8mm";
const CPUINFO_X86 =
    "flags : fpu sse2 avx cdqw ssse3 sse4_1 sse4_2 movbe popcnt aes xsave avx_f16c rdrand avx2 avx512f";

describe("PowerInfer · SmallThinker en el catálogo", () => {
    it("los dos modelos entran en catalogoRecursos(), sin ids duplicados", () => {
        const ids = MODELOS_POWERINFER.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            const enCatalogo = catalogoRecursos().find((m) => m.id === id);
            expect(enCatalogo, id).toBeDefined();
            expect(enCatalogo?.runtime, id).toBe("powerinfer");
        }
    });

    it("cumplen el contrato mínimo del catálogo", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
        }
    });

    it("SmallThinker 4B-A0.6B: ficha y SHA del archivo verificado", () => {
        const m = MODELOS_POWERINFER.find((x) => x.id === "smallthinker-4b-a06b-powerinfer")!;
        expect(m.disco).toEqual({ gb: 2.29, verificado: true });
        expect(m.parametrosB).toBe(4.27);
        expect(m.activosB).toBe(0.6);
        expect(m.almacenamiento).toEqual({ modo: "mmap", soloLocal: true });
        expect(m.ramMinGb).toBe(4);
        expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        expect(m.aceleradoresRequeridos).toEqual(["neon", "avx2", "avx512"]);
        expect(m.herramientasRequeridas).toEqual(["clang-21", "cmake"]);
        expect(m.tokSRef).toContainEqual({ equipo: "Intel i9-14900", tokS: 108.17 });
        expect(m.notas).toContain("2292487712");
        expect(m.notas).toContain(SHA_4B);
        expect(m.notas).toMatch(/1\.58 primero/);
    });

    it("SmallThinker 21B-A3B: ficha, modo limitado y SHA del archivo verificado", () => {
        const m = MODELOS_POWERINFER.find((x) => x.id === "smallthinker-21b-a3b-powerinfer")!;
        expect(m.disco).toEqual({ gb: 12.14, verificado: true });
        expect(m.parametrosB).toBe(21.5);
        expect(m.activosB).toBe(3);
        expect(m.almacenamiento).toEqual({ modo: "streaming-ssd", soloLocal: true });
        expect(m.ramMinGb).toBe(8);
        expect(m.tokSRef).toContainEqual({ equipo: "RK3588", tokS: 8.56 });
        expect(m.notas).toContain("12144740608");
        expect(m.notas).toContain(SHA_21B);
        expect(m.notas).toMatch(/≥ 8 GB de RAM libre/);
        expect(m.notas).toMatch(/no medidas por StarSeed/);
    });
});

describe("maxNCached (768 expertos por GiB de caché LRU)", () => {
    it("valores del README; un límite no válido no mete nada en caché", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
        expect(maxNCached(Infinity)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    it("ARM («Features») y x86 («flags»)", () => {
        expect(isaDeProcCpuinfo(CPUINFO_ARM)).toEqual({ neon: true, dotprod: true, i8mm: true, avx2: false, avx512: false });
        expect(isaDeProcCpuinfo(CPUINFO_X86)).toEqual({ neon: false, dotprod: false, i8mm: false, avx2: true, avx512: true });
    });

    it("«asimd» no cuenta como «asimddp», y un cpuinfo sin líneas de ISA da todo falso", () => {
        const soloAsimd = isaDeProcCpuinfo("Features : fp asimd");
        expect(soloAsimd.neon).toBe(true);
        expect(soloAsimd.dotprod).toBe(false);
        expect(soloAsimd.i8mm).toBe(false);
        expect(isaDeProcCpuinfo("processor : 0")).toEqual({
            neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false,
        });
    });
});

describe("elegirNucleoPowerInfer", () => {
    const isa = (cambios: Partial<IsaProcesador> = {}): IsaProcesador => ({
        neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false, ...cambios,
    });

    it("los cuatro desenlaces", () => {
        expect(elegirNucleoPowerInfer(isa({ neon: true, dotprod: true }), "arm64").nucleo).toBe("neon-dotprod");
        expect(elegirNucleoPowerInfer(isa({ avx512: true }), "x86_64").nucleo).toBe("avx512");
        expect(elegirNucleoPowerInfer(isa({ avx2: true }), "x86_64").nucleo).toBe("avx2");
        const r = elegirNucleoPowerInfer(isa(), "x86_64");
        expect(r.nucleo).toBe("generico");
        expect(r.motivo).toBe("sin dotprod ni AVX2: sin ganancia esperada");
        // Instrucciones de otra arquitectura no sirven: generico con el mismo motivo.
        expect(elegirNucleoPowerInfer(isa({ avx2: true }), "arm64")).toEqual(r);
        expect(elegirNucleoPowerInfer(isa({ neon: true }), "arm64")).toEqual(r);
    });
});
