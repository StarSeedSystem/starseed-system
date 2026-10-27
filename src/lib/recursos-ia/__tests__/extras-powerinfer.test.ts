import { describe, it, expect } from "vitest";
import { MODELOS_POWERINFER, maxNCached, isaDeProcCpuinfo, elegirNucleoPowerInfer } from "../extras-powerinfer";
import { catalogoRecursos } from "../catalogo";

describe("PowerInfer Extras", () => {
    it("debería tener modelos con campos obligatorios y únicos", () => {
        const ids = new Set<string>();
        const catalogo = catalogoRecursos();
        for (const m of MODELOS_POWERINFER) {
            expect(m.id).toBeDefined();
            expect(ids.has(m.id)).toBe(false);
            ids.add(m.id);
            expect(m.capacidades.length).toBeGreaterThan(0);
            expect(m.medios.length).toBeGreaterThan(0);
            expect(m.ramMinGb).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb).toBeGreaterThan(0);
            
            const enCatalogo = catalogo.find((c) => c.id === m.id);
            expect(enCatalogo).toBeDefined();
        }
    });

    it("maxNCached", () => {
        expect(maxNCached(8)).toBe(6144);
        expect(maxNCached(1)).toBe(768);
        expect(maxNCached(-1)).toBe(0);
        expect(maxNCached(NaN)).toBe(0);
    });

    it("isaDeProcCpuinfo", () => {
        const arm = "Features: fp asimd evtstrm aes asimddp i8mm";
        const resArm = isaDeProcCpuinfo(arm);
        expect(resArm.neon).toBe(true);
        expect(resArm.dotprod).toBe(true);
        expect(resArm.i8mm).toBe(true);
        
        const x86 = "flags: fpu sse2 avx2 avx512f";
        const resX86 = isaDeProcCpuinfo(x86);
        expect(resX86.avx2).toBe(true);
        expect(resX86.avx512).toBe(true);
    });

    it("elegirNucleoPowerInfer", () => {
        const armOk = { neon: true, dotprod: true, i8mm: true, avx2: false, avx512: false };
        expect(elegirNucleoPowerInfer(armOk, "arm64").nucleo).toBe("neon-dotprod");
        
        const x86Avx512 = { neon: false, dotprod: false, i8mm: false, avx2: true, avx512: true };
        expect(elegirNucleoPowerInfer(x86Avx512, "x86_64").nucleo).toBe("avx512");
        
        const x86Avx2 = { neon: false, dotprod: false, i8mm: false, avx2: true, avx512: false };
        expect(elegirNucleoPowerInfer(x86Avx2, "x86_64").nucleo).toBe("avx2");
        
        const base = { neon: false, dotprod: false, i8mm: false, avx2: false, avx512: false };
        expect(elegirNucleoPowerInfer(base, "arm64").nucleo).toBe("generico");
    });
});
