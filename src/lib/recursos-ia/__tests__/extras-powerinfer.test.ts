/**
 * Pruebas de `extras-powerinfer.ts`: fichas SmallThinker en el catálogo, caché LRU y núcleo por
 * SIMD. Solo funciones puras (sin red, sin disco, sin `node:*`, sin `vi.mock`); `globals` está
 * en false, así que se importa todo de "vitest".
 */
import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId } from "../catalogo";
import { elegirNucleoPowerInfer, isaDeProcCpuinfo, maxNCached, MODELOS_POWERINFER } from "../extras-powerinfer";

/** ARM real simplificado: Raspberry Pi 5 (Cortex-A76), con dotprod e i8mm. */
const CPUINFO_ARM = "processor\t: 0\nFeatures\t: fp asimd evtstrm aes asimddp i8mm\nCPU implementer\t: 0x41\n";

/** x86 real simplificado: solo las banderas que importan aquí. */
const CPUINFO_X86 = "processor\t: 0\nflags\t: fpu sse2 sse4_2 avx avx2 avx512f\nmodel name\t: Intel i9-14900\n";

describe("MODELOS_POWERINFER · fichas y catálogo", () => {
    it("dos modelos con ids únicos, presentes en el catálogo unificado", () => {
        expect(MODELOS_POWERINFER).toHaveLength(2);
        const ids = MODELOS_POWERINFER.map((m) => m.id);
        expect(new Set(ids).size).toBe(2);
        const cat = catalogoRecursos();
        for (const id of ids) expect(modeloPorId(id, cat), id).toBeDefined();
    });

    it("contrato mínimo y contrato exacto de las dos fichas", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades, m.id).toContain("razon");
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
            expect(m.disco.verificado, m.id).toBe(true);
            expect(m.familia, m.id).toBe("PowerInfer/SmallThinker");
            expect(m.runtime, m.id).toBe("powerinfer");
            expect(m.formato, m.id).toBe("gguf");
            expect(m.bits, m.id).toBe(4);
            expect(m.origen, m.id).toBe("biblioteca");
            expect(m.estado, m.id).toBe("en-pruebas");
            expect(m.licencia, m.id).toBe("Apache-2.0");
            expect(m.so, m.id).toEqual(["Linux", "Android"]);
            expect(m.arquitecturas, m.id).toEqual(["arm64", "x86_64"]);
            expect(m.aceleradoresRequeridos, m.id).toEqual(["neon", "avx2", "avx512"]);
            expect(m.herramientasRequeridas, m.id).toEqual(["clang-21", "cmake"]);
            expect(m.servidor, m.id).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
        }
    });

    it("4B y 21B: tamaños y parámetros MoE verificados del upstream", () => {
        const [c, g] = MODELOS_POWERINFER;
        expect(c.id).toBe("smallthinker-4b-a06b-powerinfer");
        expect(c.parametrosB).toBe(4.27);
        expect(c.activosB).toBe(0.6);
        expect(c.disco).toEqual({ gb: 2.29, verificado: true });
        expect(c.ramMinGb).toBe(4);
        expect(c.almacenamiento).toEqual({ modo: "mmap", soloLocal: true });
        expect(c.upstream).toBe("https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct-GGUF");
        expect(g.id).toBe("smallthinker-21b-a3b-powerinfer");
        expect(g.parametrosB).toBe(21.5);
        expect(g.activosB).toBe(3);
        expect(g.disco).toEqual({ gb: 12.14, verificado: true });
        expect(g.ramMinGb).toBe(8);
        expect(g.almacenamiento).toEqual({ modo: "streaming-ssd", soloLocal: true });
        expect(g.upstream).toBe("https://huggingface.co/Tiiny/SmallThinker-21BA3B-Instruct-GGUF");
    });

    it("sha256 y tamaños en bytes del upstream anotados en las notas", () => {
        const nota4 = MODELOS_POWERINFER.find((m) => m.id === "smallthinker-4b-a06b-powerinfer")!.notas ?? "";
        const nota21 = MODELOS_POWERINFER.find((m) => m.id === "smallthinker-21b-a3b-powerinfer")!.notas ?? "";
        expect(nota4).toContain("defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c");
        expect(nota4).toContain("2.292.487.712 bytes");
        expect(nota4).toContain("SmallThinker-4B-A0.6B-Instruct.Q4_0.powerinfer.gguf");
        expect(nota21).toContain("9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb");
        expect(nota21).toContain("12.144.740.608 bytes");
        expect(nota21).toContain("SmallThinker-21B-A3B-Instruct.Q4_0.powerinfer.gguf");
    });
});

describe("maxNCached · caché LRU de expertos", () => {
    it("768 expertos por GiB libre, con los relojes del README", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
    });

    it("0 ante límites inválidos (no finito o ≤ 0)", () => {
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
        expect(maxNCached(Infinity)).toBe(0);
        expect(maxNCached(0)).toBe(0);
    });
});

describe("isaDeProcCpuinfo · SIMD con dotprod e i8mm", () => {
    it("ARM: asimd, asimddp e i8mm en la línea Features", () => {
        expect(isaDeProcCpuinfo(CPUINFO_ARM)).toEqual({
            neon: true, dotprod: true, i8mm: true, avx2: false, avx512: false,
        });
    });

    it("x86: avx2 y avx512f en la línea flags", () => {
        expect(isaDeProcCpuinfo(CPUINFO_X86)).toEqual({
            neon: false, dotprod: false, i8mm: false, avx2: true, avx512: true,
        });
    });

    it("sin campos ni texto: todo falso", () => {
        expect(isaDeProcCpuinfo("")).toEqual({
            neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false,
        });
    });
});

describe("elegirNucleoPowerInfer · los cuatro desenlaces", () => {
    const arm = isaDeProcCpuinfo(CPUINFO_ARM);
    const x86 = isaDeProcCpuinfo(CPUINFO_X86);
    const niUna = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };

    it("arm64 con NEON y dotprod ⇒ neon-dotprod", () => {
        expect(elegirNucleoPowerInfer(arm, "arm64")).toEqual({
            nucleo: "neon-dotprod",
            motivo: "NEON con dotprod (asimd y asimddp): núcleo disperso ARM más ancho",
        });
    });

    it("x86_64 con AVX-512 ⇒ avx512 (antes que avx2)", () => {
        expect(elegirNucleoPowerInfer(x86, "x86_64")).toEqual({
            nucleo: "avx512",
            motivo: "AVX-512 (avx512f): núcleo disperso x86 de 512 bits",
        });
    });

    it("x86_64 solo con AVX2 ⇒ avx2", () => {
        expect(elegirNucleoPowerInfer({ ...niUna, avx2: true }, "x86_64")).toEqual({
            nucleo: "avx2",
            motivo: "AVX2 sin AVX-512: núcleo disperso x86 de 256 bits",
        });
    });

    it("sin dotprod ni AVX2 ⇒ generico, con el motivo del contrato", () => {
        expect(elegirNucleoPowerInfer(niUna, "arm64")).toEqual({
            nucleo: "generico",
            motivo: "sin dotprod ni AVX2: sin ganancia esperada",
        });
        expect(elegirNucleoPowerInfer(x86, "arm64").nucleo).toBe("generico");
    });
});
