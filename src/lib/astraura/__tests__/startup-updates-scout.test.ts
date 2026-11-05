// @vitest-environment jsdom
/**
 * Firma de novedades del SCOUT (Adenda 138 · llmfit).
 *
 * Prueba el cableado de `scoutSignature`/`hasNewScoutFindings`/`markScoutSeen`
 * en `startup-updates.ts` — mismo patrón firma+visto que el catálogo.
 *  · firma nueva → reaparece (aviso/ventana según `hasBetter`)
 *  · misma firma ya vista → no reaparece
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    SCOUT_SIGNATURE_KEY,
    SCOUT_SEEN_KEY,
    STARTUP_UPDATES_KEY,
    scoutSignature,
    hasNewScoutFindings,
    markScoutSeen,
    hayNovedadesScout,
    marcarScoutVisto,
    getStartupState,
    setStartupState,
    decidirArranque,
    catalogIds,
    catalogSignature,
} from "@/lib/astraura/startup-updates";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas } from "@/lib/sync/avisos-cuenta";
import { AVISO_SISTEMAS_INICIO, AVISO_CATALOGO_PREFIJO } from "@/lib/astraura/startup-updates";
import type { NeuronCapabilities } from "@/lib/neurons/neurons";

const NEURONA = "neurona-de-prueba";
const CATALOG_LEN = 24; // LLM + voz

const CAPS_BASE: NeuronCapabilities = {
    platform: "macos",
    gpuRenderer: "Apple M3 Pro",
    memoryGb: 18,
    cores: 12,
    webgpu: true,
    gpuVendor: "Apple",
    webgl2: true,
    chromeAi: false,
    ollama: false,
    lmstudio: false,
    installedApp: false,
    browser: "chrome",
};

function cuentaConAvisos(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

function local(estado: Record<string, unknown>): void {
    localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify(estado));
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed.neuron.device-id", "neurona-de-prueba");
    _reiniciarCacheAvisosParaPruebas();
    vi.useFakeTimers({ now: new Date("2026-11-05T12:00:00Z") });
});

afterEach(() => {
    vi.useRealTimers();
});

function setScoutSeen(sig: string): void {
    safeSet(SCOUT_SIGNATURE_KEY, sig);
}

function setScoutSeenLocal(sig: string): void {
    safeSet(SCOUT_SEEN_KEY, sig);
}

describe("scoutSignature — firma estable del hardware+catálogo", () => {
    it("devuelve firma determinista para mismas caps y catálogo", () => {
        const s1 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        const s2 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        expect(s1).toBe(s2);
        expect(s1).toMatch(/^\d+\.[a-z0-9]+$/);
    });

    it("cambia si cambia el tamaño del catálogo", () => {
        const s1 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        const s2 = scoutSignature(CAPS_BASE, CATALOG_LEN + 1);
        expect(s1).not.toBe(s2);
    });

    it("cambia si cambia la RAM", () => {
        const s1 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        const s2 = scoutSignature({ ...CAPS_BASE, memoryGb: 32 }, CATALOG_LEN);
        expect(s1).not.toBe(s2);
    });

    it("cambia si cambia la GPU", () => {
        const s1 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        const s2 = scoutSignature({ ...CAPS_BASE, gpuRenderer: "NVIDIA RTX 4090" }, CATALOG_LEN);
        expect(s1).not.toBe(s2);
    });

    it("cambia si cambia WebGPU", () => {
        const s1 = scoutSignature(CAPS_BASE, CATALOG_LEN);
        const s2 = scoutSignature({ ...CAPS_BASE, webgpu: false }, CATALOG_LEN);
        expect(s1).not.toBe(s2);
    });

    it("no lanza con caps incompletas", () => {
        expect(() => scoutSignature({} as NeuronCapabilities, CATALOG_LEN)).not.toThrow();
        expect(() => scoutSignature(null as any, CATALOG_LEN)).not.toThrow();
    });
});

describe("hasNewScoutFindings / markScoutSeen — patrón firma+visto (clave SCOUT_SIGNATURE_KEY)", () => {
    it("sin firma guardada → hay novedades (true)", () => {
        const sig = scoutSignature(CAPS_BASE, CATALOG_LEN);
        expect(hasNewScoutFindings(sig)).toBe(true);
    });

    it("misma firma ya vista → NO hay novedades (false)", () => {
        const sig = scoutSignature(CAPS_BASE, CATALOG_LEN);
        setScoutSeen(sig);
        expect(hasNewScoutFindings(sig)).toBe(false);
    });

    it("firma distinta a la vista → hay novedades (true)", () => {
        const sigOld = scoutSignature(CAPS_BASE, CATALOG_LEN);
        setScoutSeen(sigOld);
        const sigNew = scoutSignature({ ...CAPS_BASE, memoryGb: 32 }, CATALOG_LEN);
        expect(hasNewScoutFindings(sigNew)).toBe(true);
    });

    it("markScoutSeen marca la firma como vista", () => {
        const sig = scoutSignature(CAPS_BASE, CATALOG_LEN);
        expect(hasNewScoutFindings(sig)).toBe(true);
        markScoutSeen(sig);
        expect(hasNewScoutFindings(sig)).toBe(false);
    });

    it("no lanza aunque localStorage falle", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });
        expect(() => markScoutSeen("test")).not.toThrow();
        expect(() => hasNewScoutFindings("test")).not.toThrow();
        vi.restoreAllMocks();
    });
});

describe("hayNovedadesScout / marcarScoutVisto — API de startup-updates (clave SCOUT_SEEN_KEY local)", () => {
    it("sin firma guardada → hay novedades (true)", () => {
        expect(hayNovedadesScout(CAPS_BASE, CATALOG_LEN)).toBe(true);
    });

    it("misma firma ya vista localmente → NO hay novedades (false)", () => {
        const sig = scoutSignature(CAPS_BASE, CATALOG_LEN);
        setScoutSeenLocal(sig);
        // hayNovedadesScout usa SCOUT_SIGNATURE_KEY (model-scout), no SCOUT_SEEN_KEY
        // Así que para probar la integración completa usamos marcarScoutVisto
        marcarScoutVisto(CAPS_BASE, CATALOG_LEN);
        expect(hayNovedadesScout(CAPS_BASE, CATALOG_LEN)).toBe(false);
    });

    it("firma distinta a la vista → hay novedades (true)", () => {
        marcarScoutVisto(CAPS_BASE, CATALOG_LEN);
        expect(hayNovedadesScout({ ...CAPS_BASE, memoryGb: 32 }, CATALOG_LEN)).toBe(true);
    });

    it("marcarScoutVisto marca en ambas claves", () => {
        const sig = scoutSignature(CAPS_BASE, CATALOG_LEN);
        expect(hasNewScoutFindings(sig)).toBe(true);
        marcarScoutVisto(CAPS_BASE, CATALOG_LEN);
        expect(hasNewScoutFindings(sig)).toBe(false);
        expect(safeGet(SCOUT_SEEN_KEY)).toBe(sig);
    });

    it("no lanza aunque localStorage falle", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });
        expect(() => marcarScoutVisto(CAPS_BASE, CATALOG_LEN)).not.toThrow();
        expect(() => hayNovedadesScout(CAPS_BASE, CATALOG_LEN)).not.toThrow();
        vi.restoreAllMocks();
    });
});

describe("decidirArranque — integra hallazgos del scout", () => {
    beforeEach(() => {
        // Configurar estado base: firstRunDone + catálogo VISTO (firma real coincidente)
        const sigReal = catalogSignature(); // firma real del catálogo actual
        cuentaConAvisos({
            [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 },
            [AVISO_CATALOGO_PREFIJO + sigReal]: { estado: "visto", ts: 6 },
        });
        local({ firstRunDone: true, lastSig: sigReal, lastCatalog: catalogIds(), autoUpdate: true, strategy: "auto" });
    });

    it("SIN caps: no comprueba scout → nada (al-dia)", () => {
        const d = decidirArranque();
        expect(d.accion).toBe("nada");
        expect(d.motivo).toBe("al-dia");
    });

    it("CON caps y scout SIN novedades → nada (al-dia)", () => {
        // Marcar scout como visto (usar misma longitud de catálogo que decideArranque)
        const catalogLen = catalogIds().length;
        marcarScoutVisto(CAPS_BASE, catalogLen);
        const d = decidirArranque(Date.now(), CAPS_BASE);
        expect(d.accion).toBe("nada");
        expect(d.motivo).toBe("al-dia");
    });

    it("CON caps y scout CON novedades → aviso (novedades-scout)", () => {
        // NO marcar scout como vista → hay novedades
        const d = decidirArranque(Date.now(), CAPS_BASE);
        expect(d.accion).toBe("aviso");
        expect(d.motivo).toBe("novedades-scout");
    });

    it("scout novedades + firstRunDone false → ventana (primera-vez tiene prioridad)", () => {
        cuentaConAvisos({}); // sin primera vez en la cuenta
        local({ firstRunDone: false, autoUpdate: true, strategy: "auto" });
        const d = decidirArranque(Date.now(), CAPS_BASE);
        expect(d.accion).toBe("ventana");
        expect(d.motivo).toBe("primera-vez");
    });

    it("scout novedades + config pendiente (voz) → ventana (pendiente tiene prioridad)", () => {
        const sigReal = catalogSignature();
        cuentaConAvisos({
            [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 },
            [AVISO_CATALOGO_PREFIJO + sigReal]: { estado: "visto", ts: 6 },
        });
        local({ firstRunDone: true, lastSig: sigReal, lastCatalog: catalogIds(), autoUpdate: false, strategy: "auto" });
        const d = decidirArranque(Date.now(), CAPS_BASE);
        expect(d.accion).toBe("ventana");
        expect(d.motivo).toBe("pendiente");
    });
});