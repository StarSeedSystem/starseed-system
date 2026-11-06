// @vitest-environment jsdom
/**
 * scoutSignature cableado en startup-updates (CTR1104C · Adenda 138).
 * Prueba pura: firma nueva del scout → reaparece la ventana/aviso;
 * misma firma ya vista → no reaparece.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    SCOUT_SIGNATURE_KEY,
    scoutSignature,
    hasNewScoutFindings,
    markScoutSeen,
} from "@/ai/astraura/model-scout";
import {
    catalogIds,
    catalogSignature,
    getStartupState,
    setStartupState,
    decidirArranque,
    decidirArranqueConScout,
    markUpdatesSeenConScout,
    scoutSignatureActual,
    hayNovedadesScout,
    marcarScoutVisto,
} from "@/lib/astraura/startup-updates";
import { safeGet } from "@/lib/safe-storage";

const CAPS_BASE = { platform: "macos", gpuRenderer: "Apple M1 Pro", memoryGb: 16, cores: 10, webgpu: true, chromeAi: false };
const catalogLen = () => catalogIds().length;
const buildSig = (caps = CAPS_BASE) => scoutSignature(caps, catalogLen());

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("scoutSignature + startup-updates: firma de novedades del scout", () => {
    it("firma nueva (capacidades distintas) → hasNewScoutFindings true", () => {
        expect(hasNewScoutFindings(buildSig({ ...CAPS_BASE, memoryGb: 16 }))).toBe(true);
        expect(buildSig({ ...CAPS_BASE, memoryGb: 8 })).not.toBe(buildSig({ ...CAPS_BASE, memoryGb: 16 }));
    });
    it("misma firma ya vista → hasNewScoutFindings false", () => {
        const sig = buildSig();
        markScoutSeen(sig);
        expect(hasNewScoutFindings(sig)).toBe(false);
    });
    it("firma persiste en localStorage", () => {
        const sig = buildSig();
        markScoutSeen(sig);
        expect(safeGet(SCOUT_SIGNATURE_KEY)).toBe(sig);
    });
    it("catálogo más largo cambia la firma", () => {
        expect(scoutSignature(CAPS_BASE, catalogLen() + 5)).not.toBe(buildSig());
    });
    it("hash djb2 consistente (formato catalogLen.hash)", () => {
        expect(scoutSignature({ ...CAPS_BASE, platform: "test", gpuRenderer: "bits", memoryGb: 0, cores: 0, webgpu: false }, 0)).toMatch(/^\d+\.[a-z0-9]+$/);
    });
});

describe("integración: decidirArranqueConScout y markUpdatesSeenConScout", () => {
    it("decidirArranqueConScout = decidirArranque si ya hay acción", async () => {
        setStartupState({ firstRunDone: false });
        expect(await decidirArranqueConScout()).toEqual(decidirArranque());
    });
    it("markUpdatesSeenConScout actualiza estado y marca scout", async () => {
        setStartupState({ firstRunDone: false, lastSig: "", lastCatalog: [], autoUpdate: true, strategy: "auto" });
        await markUpdatesSeenConScout({ autoUpdate: false });
        const st = getStartupState();
        expect(st.firstRunDone).toBe(true);
        expect(st.autoUpdate).toBe(false);
        expect(st.lastSig).toBe(catalogSignature());
        expect(st.lastCatalog).toEqual(catalogIds());
    });
    it("scoutSignatureActual / hayNovedadesScout / marcarScoutVisto no lanzan", async () => {
        await expect(scoutSignatureActual()).resolves.toMatch(/^\d+\.[a-z0-9]+$/);
        await expect(hayNovedadesScout()).resolves.toBeDefined();
        await expect(marcarScoutVisto()).resolves.toBeUndefined();
    });
});

describe("DecisionArranque incluye motivo novedades-scout", () => {
    it("tipo acepta motivo novedades-scout", () => {
        const d: import("@/lib/astraura/startup-updates").DecisionArranque = { accion: "aviso", motivo: "novedades-scout", modelos: 0, fuentes: 0, firma: "5.abc123" };
        expect(d.motivo).toBe("novedades-scout");
    });
});