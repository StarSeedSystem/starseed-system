/**
 * Pruebas de PowerInfer/SmallThinker (Ola 1025R): fichas en el catálogo, regla de caché del
 * README y núcleo por procesador. Funciones puras: sin red, sin disco, sin `node:*`.
 */
import { describe, expect, it } from "vitest";
import {
    MODELOS_POWERINFER,
    elegirNucleoPowerInfer,
    isaDeProcCpuinfo,
    maxNCached,
} from "../extras-powerinfer";
import { catalogoRecursos, modeloPorId } from "../catalogo";

/** cpuinfo de un ARM64 con dotprod e i8mm (p. ej. Snapdragon 8 Elite de OnePlus). */
const ARM_CPUINFO = [
    "processor\t: 0",
    "BogoMIPS\t: 108.00",
    "Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp ssbs i8mm",
    "CPU implementer\t: 0x51",
].join("\n");

/** cpuinfo de un x86_64 con AVX2 y AVX-512. */
const X86_CPUINFO = [
    "processor\t: 0",
    "flags\t\t: fpu vme de pse tsc msr sse sse2 pni ssse3 sse4_2 x2apic movbe popcnt aes avx f16c rdrand avx2 fsgsbase avx512f adx smap",
].join("\n");

describe("PowerInfer · SmallThinker en el catálogo", () => {
    it("dos modelos con ids únicos y presentes en catalogoRecursos()", () => {
        const ids = MODELOS_POWERINFER.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(["smallthinker-4b-a06b-powerinfer", "smallthinker-21b-a3b-powerinfer"]);
        const cat = catalogoRecursos();
        for (const id of ids) expect(modeloPorId(id, cat), id).toBeDefined();
    });

    it("contrato mínimo y ficha de PowerInfer", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
            expect(m.disco.verificado, m.id).toBe(true);
            expect(m.origen, m.id).toBe("biblioteca");
            expect(m.estado, m.id).toBe("en-pruebas");
            expect(m.runtime, m.id).toBe("powerinfer");
            expect(m.formato, m.id).toBe("gguf");
            expect(m.bits, m.id).toBe(4);
            expect(m.familia, m.id).toBe("PowerInfer/SmallThinker");
            expect(m.licencia, m.id).toBe("Apache-2.0");
            expect(m.so, m.id).toEqual(["Linux", "Android"]);
            expect(m.arquitecturas, m.id).toEqual(["arm64", "x86_64"]);
            expect(m.aceleradoresRequeridos, m.id).toEqual(["neon", "avx2", "avx512"]);
            expect(m.herramientasRequeridas, m.id).toEqual(["clang-21", "cmake"]);
            expect(m.servidor, m.id).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        }
    });

    it("sha y bytes del archivo anotados en las notas", () => {
        const [cuatro, veintiuno] = MODELOS_POWERINFER;
        expect(cuatro.notas).toContain("2.292.487.712 bytes");
        expect(cuatro.notas).toContain("defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c");
        expect(veintiuno.notas).toContain("12.144.740.608 bytes");
        expect(veintiuno.notas).toContain("9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb");
    });

    it("tamaños, parámetros y modo de almacenamiento de cada ficha", () => {
        const cuatro = modeloPorId("smallthinker-4b-a06b-powerinfer", catalogoRecursos())!;
        expect(cuatro.parametrosB).toBe(4.27);
        expect(cuatro.activosB).toBe(0.6);
        expect(cuatro.disco).toEqual({ gb: 2.29, verificado: true });
        expect(cuatro.ramMinGb).toBe(4);
        expect(cuatro.almacenamiento).toEqual({ modo: "mmap", soloLocal: true });
        expect(cuatro.upstream).toBe("https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF");
        expect(cuatro.tokSRef).toEqual([
            { equipo: "Raspberry Pi 5", tokS: 28.77 },
            { equipo: "Rockchip RK3588", tokS: 39.76 },
            { equipo: "Snapdragon 8 Elite (OnePlus 13)", tokS: 78.99 },
            { equipo: "Intel Core i9-14900", tokS: 108.17 },
        ]);
        const veintiuno = modeloPorId("smallthinker-21b-a3b-powerinfer", catalogoRecursos())!;
        expect(veintiuno.parametrosB).toBe(21.5);
        expect(veintiuno.activosB).toBe(3);
        expect(veintiuno.disco).toEqual({ gb: 12.14, verificado: true });
        expect(veintiuno.ramMinGb).toBe(8);
        expect(veintiuno.almacenamiento).toEqual({ modo: "streaming-ssd", soloLocal: true });
        expect(veintiuno.tokSRef).toEqual([
            { equipo: "Intel Core i9-14900 (limitado a 8 GB de RAM)", tokS: 20.3 },
            { equipo: "Snapdragon 8 Elite (limitado a 8 GB de RAM)", tokS: 15.5 },
            { equipo: "Rockchip RK3588 (limitado a 8 GB de RAM)", tokS: 8.56 },
        ]);
        // La idea compartida: cifras del autor, no medidas por StarSeed.
        for (const m of MODELOS_POWERINFER) expect(m.notas).toContain("NO medidas por StarSeed");
    });
});

describe("maxNCached (el README trae 768 expertos por GiB de RAM)", () => {
    it("8 GiB → 6144 · 1 GiB → 768 · no finito o ≤ 0 → 0", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
        expect(maxNCached(Infinity)).toBe(0);
    });
});

describe("isaDeProcCpuinfo", () => {
    it("ARM: la línea Features trae asimd, asimddp e i8mm", () => {
        expect(isaDeProcCpuinfo(ARM_CPUINFO)).toEqual({
            neon: true,
            dotprod: true,
            i8mm: true,
            avx2: false,
            avx512: false,
        });
    });

    it("x86_64: la línea flags trae avx2 y avx512f", () => {
        expect(isaDeProcCpuinfo(X86_CPUINFO)).toEqual({
            neon: false,
            dotprod: false,
            i8mm: false,
            avx2: true,
            avx512: true,
        });
    });

    it("NEON sin dotprod: asimd sí, asimddp no (no hay match dentro de asimdhp)", () => {
        const isa = isaDeProcCpuinfo("Features\t: fp asimd evtstrm aes asimdhp");
        expect(isa.neon).toBe(true);
        expect(isa.dotprod).toBe(false);
        expect(isa.i8mm).toBe(false);
    });

    it("sin líneas de ISA: todo false", () => {
        expect(isaDeProcCpuinfo("processor\t: 0\nmodelo desconocido")).toEqual({
            neon: false,
            dotprod: false,
            i8mm: false,
            avx2: false,
            avx512: false,
        });
    });
});

describe("elegirNucleoPowerInfer", () => {
    const isaArm = isaDeProcCpuinfo(ARM_CPUINFO);
    const isaX86 = isaDeProcCpuinfo(X86_CPUINFO);
    const soloAvx2 = { neon: false, dotprod: false, i8mm: false, avx2: true, avx512: false };

    it("arm64 con NEON y dotprod → neon-dotprod", () => {
        expect(elegirNucleoPowerInfer(isaArm, "arm64")).toEqual({
            nucleo: "neon-dotprod",
            motivo: "ARM con NEON y dotprod (asimddp): el núcleo disperso más rápido.",
        });
    });

    it("x86_64 con AVX-512 → avx512 (y sin él, con AVX2 → avx2)", () => {
        expect(elegirNucleoPowerInfer(isaX86, "x86_64").nucleo).toBe("avx512");
        expect(elegirNucleoPowerInfer(soloAvx2, "x86_64").nucleo).toBe("avx2");
    });

    it("lo demás → generico con el motivo exacto del README", () => {
        const sinDotprod = isaDeProcCpuinfo("Features\t: fp asimd evtstrm aes");
        const r = elegirNucleoPowerInfer(sinDotprod, "arm64");
        expect(r.nucleo).toBe("generico");
        expect(r.motivo).toBe("sin dotprod ni AVX2: sin ganancia esperada");
        // NEON con dotprod pero en otra arquitectura: sin núcleo especial.
        expect(elegirNucleoPowerInfer(isaArm, "otra").nucleo).toBe("generico");
        expect(elegirNucleoPowerInfer(soloAvx2, "arm64").nucleo).toBe("generico");
    });
});
