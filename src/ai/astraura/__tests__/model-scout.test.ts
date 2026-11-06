import { describe, expect, it } from "vitest";
import { scoutModels, scoutSignature, hasNewScoutFindings, markScoutSeen, SCOUT_SIGNATURE_KEY } from "../model-scout";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const CAPS_ALTA: NeuronCapabilities = {
    platform: "macOS",
    browser: "Chrome 148",
    webgpu: true,
    webgl2: true,
    gpuRenderer: "Apple M3 Max",
    gpuVendor: "Apple",
    chromeAi: false,
    cores: 16,
    memoryGb: 64,
    installedApp: true,
};

const CAPS_MEDIA: NeuronCapabilities = {
    platform: "Windows",
    browser: "Chrome 148",
    webgpu: true,
    webgl2: true,
    gpuRenderer: "NVIDIA GeForce RTX 3060",
    gpuVendor: "NVIDIA",
    chromeAi: false,
    cores: 8,
    memoryGb: 16,
    installedApp: true,
};

const CAPS_BAJA: NeuronCapabilities = {
    platform: "Linux",
    browser: "Firefox 140",
    webgpu: false,
    webgl2: true,
    gpuRenderer: "Intel UHD Graphics 620",
    gpuVendor: "Intel",
    chromeAi: false,
    cores: 4,
    memoryGb: 8,
    installedApp: false,
};

describe("model-scout · scoutModels end-to-end con aparatos fijos", () => {
    it("gama baja: no recibe modelos que no le caben (veredicto no-cabe filtrado)", () => {
        const result = scoutModels(CAPS_BAJA, { kind: "llm" });
        const noCabe = result.best.some((r) => r.verdict === "no-cabe");
        expect(noCabe).toBe(false);
        expect(result.tier).toBe("bajo");
    });

    it("gama alta: puede ejecutar al menos los mismos modelos locales que media (sin límite)", () => {
        const alta = scoutModels(CAPS_ALTA, { kind: "llm", limit: 20 });
        const media = scoutModels(CAPS_MEDIA, { kind: "llm", limit: 20 });
        const localAlta = alta.best.filter((r) => r.spec.access === "local").map((r) => r.spec.id);
        const localMedia = media.best.filter((r) => r.spec.access === "local").map((r) => r.spec.id);
        for (const id of localMedia) {
            expect(localAlta.includes(id)).toBe(true);
        }
        expect(localAlta.length).toBeGreaterThanOrEqual(localMedia.length);
    });

    it("orden estable entre dos llamadas consecutivas", () => {
        const r1 = scoutModels(CAPS_MEDIA, { kind: "llm" });
        const r2 = scoutModels(CAPS_MEDIA, { kind: "llm" });
        expect(r1.best.map((r) => r.spec.id)).toEqual(r2.best.map((r) => r.spec.id));
    });

    it("scoutSignature solo cambia cuando cambia la selección (catálogo o hardware)", () => {
        const sig1 = scoutSignature(CAPS_MEDIA, 10);
        const sig2 = scoutSignature(CAPS_MEDIA, 10);
        expect(sig1).toBe(sig2);
        const sig3 = scoutSignature(CAPS_MEDIA, 11);
        expect(sig3).not.toBe(sig1);
        const sig4 = scoutSignature({ ...CAPS_MEDIA, memoryGb: 32 }, 10);
        expect(sig4).not.toBe(sig1);
    });

    it("hasNewScoutFindings detecta cambio de firma y markScoutSeen la marca como vista", () => {
        const sig = scoutSignature(CAPS_MEDIA, 10);
        markScoutSeen(sig);
        expect(hasNewScoutFindings(sig)).toBe(false);
        const sigNueva = scoutSignature(CAPS_MEDIA, 11);
        expect(hasNewScoutFindings(sigNueva)).toBe(true);
    });

    it("usedModelIds: deltaVsCurrent aparece solo cuando hay mejora real", () => {
        const result = scoutModels(CAPS_ALTA, { kind: "llm", usedModelIds: ["ollama-small"] });
        const current = result.current.find((r) => r.spec.id === "ollama-small");
        expect(current).toBeDefined();
        const better = result.best.find((r) => r.deltaVsCurrent);
        expect(better).toBeDefined();
        expect(typeof better!.deltaVsCurrent).toBe("string");
    });

    it("servidor siempre perfecto (requiredGb: 0, sin estTps)", () => {
        const result = scoutModels(CAPS_BAJA, { kind: "llm" });
        const server = result.best.find((r) => r.spec.access !== "local");
        expect(server).toBeDefined();
        expect(server!.verdict).toBe("perfecto");
        expect(server!.requiredGb).toBe(0);
        expect(server!.estTps).toBeUndefined();
    });
});