import { describe, expect, it } from "vitest";
import {
    MODELOS_POWERINFER,
    elegirNucleoPowerInfer,
    isaDeProcCpuinfo,
    maxNCached,
} from "../extras-powerinfer";
import { catalogoRecursos } from "../catalogo";

const CATALOGO = catalogoRecursos();
const IDS = MODELOS_POWERINFER.map((m) => m.id);

describe("PowerInfer · catálogo", () => {
    it("ids únicos y presentes en el catálogo", () => {
        expect(new Set(IDS).size).toBe(IDS.length);
        for (const id of IDS) expect(CATALOGO.some((m) => m.id === id), id).toBe(true);
    });

    it("contrato mínimo de cada modelo", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb, m.id).toBeGreaterThan(0);
        }
    });

    it("los dos SmallThinker declaran el runtime y su origen", () => {
        for (const m of MODELOS_POWERINFER) {
            expect(m.runtime).toBe("powerinfer");
            expect(m.formato).toBe("gguf");
            expect(m.bits).toBe(4);
            expect(m.familia).toBe("PowerInfer/SmallThinker");
            expect(m.origen).toBe("biblioteca");
            expect(m.estado).toBe("en-pruebas");
            expect(m.capacidades).toEqual(["texto", "razon"]);
            expect(m.licencia).toBe("Apache-2.0");
            expect(m.so).toEqual(["Linux", "Android"]);
            expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
            expect(m.aceleradoresRequeridos).toEqual(["neon", "avx2", "avx512"]);
            expect(m.herramientasRequeridas).toEqual(["clang-21", "cmake"]);
            expect(m.medios).toEqual(["nativo", "servidor"]);
            expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8794/v1" });
            expect(m.almacenamiento.soloLocal).toBe(true);
        }
        expect(MODELOS_POWERINFER[0].almacenamiento.modo).toBe("mmap");
        expect(MODELOS_POWERINFER[1].almacenamiento.modo).toBe("streaming-ssd");
    });

    it("sha256 y bytes reales anotados en las notas", () => {
        const archivos = [
            { id: IDS[0], bytes: "2292487712", sha: "defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c" },
            { id: IDS[1], bytes: "12144740608", sha: "9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb" },
        ];
        for (const a of archivos) {
            const m = MODELOS_POWERINFER.find((x) => x.id === a.id)!;
            expect(m.notas).toContain(a.bytes);
            expect(m.notas).toContain(a.sha);
            expect(m.disco.verificado).toBe(true);
        }
    });
});

describe("PowerInfer · reglas del procesador", () => {
    it("maxNCached: 768 expertos por GiB, y cero sin límite válido", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(Number.NaN)).toBe(0);
    });

    it("lee Features de ARM y flags de x86", () => {
        const arm = isaDeProcCpuinfo("Features\t: fp asimd evtstrm aes asimddp i8mm");
        expect(arm).toEqual({ neon: true, dotprod: true, i8mm: true, avx2: false, avx512: false });
        const x86 = isaDeProcCpuinfo("flags\t\t: fpu sse2 avx2 avx512f");
        expect(x86).toEqual({ neon: false, dotprod: false, i8mm: false, avx2: true, avx512: true });
    });

    it("elige núcleo en los cuatro desenlaces", () => {
        const vacia = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };
        expect(elegirNucleoPowerInfer({ ...vacia, neon: true, dotprod: true }, "arm64").nucleo).toBe("neon-dotprod");
        expect(elegirNucleoPowerInfer({ ...vacia, avx512: true }, "x86_64").nucleo).toBe("avx512");
        expect(elegirNucleoPowerInfer({ ...vacia, avx2: true }, "x86_64").nucleo).toBe("avx2");
        const generico = elegirNucleoPowerInfer({ ...vacia, neon: true }, "arm64");
        expect(generico.nucleo).toBe("generico");
        expect(generico.motivo).toBe("sin dotprod ni AVX2: sin ganancia esperada");
    });
});
