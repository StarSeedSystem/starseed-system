import { describe, expect, it } from "vitest";
import { catalogoRecursos } from "../catalogo";
import { elegirNucleoPowerInfer, isaDeProcCpuinfo, maxNCached, MODELOS_POWERINFER } from "../extras-powerinfer";

/** cpuinfo de una Raspberry Pi 5 (ARM: línea «Features» con asimd, asimddp e i8mm). */
const CPUINFO_ARM = `
processor	: 0
Features	: fp asimd evtstrm aes pmull sha1 sha2 crc32 asimddp i8mm
CPU implementer	: 0x41
Hardware	: Raspberry Pi 5 Model C Rev 1.0
`;

/** cpuinfo de un Intel con AVX2 y AVX-512 (x86: línea «flags»). */
const CPUINFO_X86 = `
processor	: 0
flags		: fpu sse sse2 monitor ssse3 fma sse4_1 sse4_2 avx2 avx512f
model name	: Intel(R) Core(TM) i9-14900
`;

/** cpuinfo de una CPU x86 solo con AVX2. */
const CPUINFO_X86_AVX2 = `
processor	: 0
flags		: fpu sse2 sse4_2 avx2
`;

describe("SmallThinker vía PowerInfer · fichas", () => {
    const cat = catalogoRecursos();
    const ids = MODELOS_POWERINFER.map((m) => m.id);
    const ficha = (id: string) => cat.find((m) => m.id === id);

    it("ids únicos y presentes en catalogoRecursos()", () => {
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(ficha(id), id).toBeDefined();
    });

    it("contrato mínimo en todos los modelos", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb !== null && m.disco.gb > 0, m.id).toBe(true);
        }
    });

    it("SmallThinker 4B-A0.6B: ficha completa con sha y bytes anotados", () => {
        const m = ficha("smallthinker-4b-a06b-powerinfer")!;
        expect(m.origen).toBe("biblioteca");
        expect(m.estado).toBe("en-pruebas");
        expect(m.runtime).toBe("powerinfer");
        expect(m.formato).toBe("gguf");
        expect(m.bits).toBe(4);
        expect(m.capacidades).toEqual(["texto", "razon"]);
        expect(m.familia).toBe("PowerInfer/SmallThinker");
        expect(m.licencia).toBe("Apache-2.0");
        expect(m.so).toEqual(["Linux", "Android"]);
        expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
        expect(m.aceleradoresRequeridos).toEqual(["neon", "avx2", "avx512"]);
        expect(m.herramientasRequeridas).toEqual(["clang-21", "cmake"]);
        expect(m.medios).toEqual(["nativo", "servidor"]);
        expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        expect(m.parametrosB).toBe(4.27);
        expect(m.activosB).toBe(0.6);
        expect(m.disco).toEqual({ gb: 2.29, verificado: true });
        expect(m.ramMinGb).toBe(4);
        expect(m.almacenamiento).toEqual({ modo: "mmap", soloLocal: true });
        expect(m.notas).toContain("SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf");
        expect(m.notas).toContain("2.292.487.712");
        expect(m.notas).toContain("defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c");
        expect(m.notas).toMatch(/1,4 GB/);
        expect(m.tokSRef).toContainEqual({ equipo: "Raspberry Pi 5 (autor: sin límite de memoria)", tokS: 28.77 });
        expect(m.tokSRef).toContainEqual({ equipo: "RK3588 (autor: sin límite de memoria)", tokS: 39.76 });
        expect(m.tokSRef).toContainEqual({ equipo: "Snapdragon 8 Elite · OnePlus 13 (autor: sin límite de memoria)", tokS: 78.99 });
        expect(m.tokSRef).toContainEqual({ equipo: "Intel i9-14900 (autor: sin límite de memoria)", tokS: 108.17 });
    });

    it("SmallThinker 21B-A3B: streaming-ssd con límite de RAM, sha y bytes anotados", () => {
        const m = ficha("smallthinker-21b-a3b-powerinfer")!;
        expect(m.parametrosB).toBe(21.5);
        expect(m.activosB).toBe(3);
        expect(m.disco).toEqual({ gb: 12.14, verificado: true });
        expect(m.ramMinGb).toBe(8);
        expect(m.almacenamiento).toEqual({ modo: "streaming-ssd", soloLocal: true });
        expect(m.notas).toContain("SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf");
        expect(m.notas).toContain("12.144.740.608");
        expect(m.notas).toContain("9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb");
        expect(m.notas).toMatch(/1,4 GB/);
        expect(m.tokSRef).toContainEqual({ equipo: "Intel i9-14900 (autor: limitado a 8 GB de RAM)", tokS: 20.3 });
        expect(m.tokSRef).toContainEqual({ equipo: "Snapdragon 8 Elite (autor: limitado a 8 GB de RAM)", tokS: 15.5 });
        expect(m.tokSRef).toContainEqual({ equipo: "RK3588 (autor: limitado a 8 GB de RAM)", tokS: 8.56 });
    });
});

describe("maxNCached (regla del README de PowerInfer)", () => {
    it("768 expertos por GiB, redondeado; 0 si el límite no vale", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    it("ARM: Features con asimd, asimddp e i8mm", () => {
        expect(isaDeProcCpuinfo(CPUINFO_ARM)).toEqual({
            neon: true,
            dotprod: true,
            i8mm: true,
            avx2: false,
            avx512: false,
        });
    });

    it("x86: flags con avx2 y avx512f", () => {
        expect(isaDeProcCpuinfo(CPUINFO_X86)).toEqual({
            neon: false,
            dotprod: false,
            i8mm: false,
            avx2: true,
            avx512: true,
        });
    });

    it("x86 solo AVX2 y cpuinfo sin líneas features/flags", () => {
        expect(isaDeProcCpuinfo(CPUINFO_X86_AVX2)).toMatchObject({ avx2: true, avx512: false, neon: false });
        expect(isaDeProcCpuinfo("")).toMatchObject({
            neon: false,
            dotprod: false,
            i8mm: false,
            avx2: false,
            avx512: false,
        });
    });
});

describe("elegirNucleoPowerInfer", () => {
    const arm = isaDeProcCpuinfo(CPUINFO_ARM);
    const x86 = isaDeProcCpuinfo(CPUINFO_X86);
    const x86avx2 = isaDeProcCpuinfo(CPUINFO_X86_AVX2);

    it("los cuatro desenlaces", () => {
        expect(elegirNucleoPowerInfer(arm, "arm64")).toEqual({
            nucleo: "neon-dotprod",
            motivo: "NEON con dotprod: núcleo disperso del paquete smallthinker.",
        });
        expect(elegirNucleoPowerInfer(x86, "x86_64").nucleo).toBe("avx512");
        expect(elegirNucleoPowerInfer(x86avx2, "x86_64").nucleo).toBe("avx2");
        expect(elegirNucleoPowerInfer(x86avx2, "arm64")).toEqual({
            nucleo: "generico",
            motivo: "sin dotprod ni AVX2: sin ganancia esperada",
        });
    });
});
