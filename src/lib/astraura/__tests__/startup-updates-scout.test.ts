/**
 * scoutSignature cableado en startup-updates (CTR1104C · Adenda 138).
 * Prueba PURA de la decisión: firma nueva → reaparece el aviso;
 * misma firma ya vista → no reaparece. Sin storage, sin red, sin procesos.
 */
import { describe, expect, it } from "vitest";
import { scoutSignature } from "@/ai/astraura/model-scout";
import { decidirNovedadScout } from "@/lib/astraura/startup-updates";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const CAPS: NeuronCapabilities = {
    platform: "macOS",
    gpuRenderer: "Apple M1 Pro",
    memoryGb: 16,
    cores: 10,
    webgpu: true,
};

const firma = (caps: NeuronCapabilities = CAPS, catalogLen = 24): string => scoutSignature(caps, catalogLen);

describe("decidirNovedadScout: la firma del scout decide si reaparece", () => {
    it("firma nueva (distinta de la vista) → reaparece", () => {
        expect(decidirNovedadScout(firma(CAPS, 24), firma(CAPS, 25))).toBe(true);
        expect(decidirNovedadScout(firma(CAPS, 24), firma({ ...CAPS, memoryGb: 8 }, 24))).toBe(true);
    });

    it("misma firma ya vista → no reaparece", () => {
        const sig = firma();
        expect(decidirNovedadScout(sig, sig)).toBe(false);
    });

    it("sin línea base (primer arranque de este medio) no anuncia nada", () => {
        expect(decidirNovedadScout(null, firma())).toBe(false);
        expect(decidirNovedadScout(undefined, firma())).toBe(false);
        expect(decidirNovedadScout("", firma())).toBe(false);
    });
});

describe("scoutSignature: barata, estable y sensible a hardware/catálogo", () => {
    it("es determinista para las mismas capacidades y catálogo", () => {
        expect(firma()).toBe(firma());
    });

    it("cambia con la RAM, la GPU, la plataforma o el tamaño del catálogo", () => {
        const base = firma();
        expect(firma({ ...CAPS, memoryGb: 8 })).not.toBe(base);
        expect(firma({ ...CAPS, gpuRenderer: "NVIDIA RTX 4090" })).not.toBe(base);
        expect(firma({ ...CAPS, platform: "Android" })).not.toBe(base);
        expect(firma(CAPS, 25)).not.toBe(base);
    });

    it("mantiene el formato «catalogLen.hash»", () => {
        expect(firma()).toMatch(/^24\.[a-z0-9]+$/);
        expect(scoutSignature({ platform: "test", memoryGb: 0, cores: 0, webgpu: false }, 0)).toMatch(/^0\.[a-z0-9]+$/);
    });
});
