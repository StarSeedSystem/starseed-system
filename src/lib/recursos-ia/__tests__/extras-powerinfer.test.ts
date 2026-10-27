import { describe, expect, it } from "vitest";
import { catalogoRecursos, modeloPorId } from "../catalogo";
import {
    elegirNucleoPowerInfer,
    isaDeProcCpuinfo,
    maxNCached,
    MODELOS_POWERINFER,
} from "../extras-powerinfer";

describe("extras-powerinfer", () => {
    it("ids únicos y presentes en catalogoRecursos()", () => {
        const ids = MODELOS_POWERINFER.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        const cat = catalogoRecursos();
        for (const id of ids) {
            expect(modeloPorId(id, cat), id).toBeDefined();
        }
    });

    it("contrato mínimo", () => {
        const cat = catalogoRecursos();
        for (const m of MODELOS_POWERINFER) {
            expect(m.capacidades.length).toBeGreaterThan(0);
            expect(m.medios.length).toBeGreaterThan(0);
            expect(m.ramMinGb).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb).toBeGreaterThan(0);
            expect(modeloPorId(m.id, cat)).toBeDefined();
        }
    });

    it("sha y bytes anotados", () => {
        const m4 = MODELOS_POWERINFER.find((m) => m.id === "smallthinker-4b-a06b-powerinfer")!;
        const m21 = MODELOS_POWERINFER.find((m) => m.id === "smallthinker-21b-a3b-powerinfer")!;
        expect(m4.notas).toMatch(/defec76c786476ac0e00baed53e181ec595a203bed9d8318611a291245b5149c/);
        expect(m4.notas).toMatch(/2\.292\.487\.712/);
        expect(m21.notas).toMatch(/9bb2ad80adf5f64cb953570690cf1aee13de87661eef65f073224c9a3afe4ccb/);
        expect(m21.notas).toMatch(/12\.144\.740\.608/);
    });

    it("maxNCached", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
    });

    it("isaDeProcCpuinfo", () => {
        const arm = isaDeProcCpuinfo("Features: fp asimd evtstrm aes asimddp i8mm");
        expect(arm.neon).toBe(true);
        expect(arm.dotprod).toBe(true);
        expect(arm.i8mm).toBe(true);
        expect(arm.avx2).toBe(false);
        expect(arm.avx512).toBe(false);

        const x86 = isaDeProcCpuinfo("flags: fpu sse2 avx2 avx512f");
        expect(x86.neon).toBe(false);
        expect(x86.dotprod).toBe(false);
        expect(x86.i8mm).toBe(false);
        expect(x86.avx2).toBe(true);
        expect(x86.avx512).toBe(true);
    });

    it("elegirNucleoPowerInfer", () => {
        expect(elegirNucleoPowerInfer({ neon: true, dotprod: true, avx2: false, avx512: false }, "arm64")).toEqual({
            nucleo: "neon-dotprod",
            motivo: "ARM64 con NEON+dotprod",
        });
        expect(elegirNucleoPowerInfer({ neon: true, dotprod: false, avx2: false, avx512: true }, "x86_64")).toEqual({
            nucleo: "avx512",
            motivo: "x86_64 con AVX-512",
        });
        expect(elegirNucleoPowerInfer({ neon: false, dotprod: false, avx2: true, avx512: false }, "x86_64")).toEqual({
            nucleo: "avx2",
            motivo: "x86_64 con AVX2",
        });
        expect(elegirNucleoPowerInfer({ neon: false, dotprod: false, avx2: false, avx512: false }, "x86_64")).toEqual({
            nucleo: "generico",
            motivo: "sin dotprod ni AVX2: sin ganancia esperada",
        });
    });
});
