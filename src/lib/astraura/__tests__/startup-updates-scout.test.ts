// @vitest-environment jsdom
/**
 * Integración de la firma del scout (model-scout.ts) en startup-updates.ts (CTR1104Cc).
 * Prueba pura: firma nueva → reaparece; misma firma ya vista → no.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    STARTUP_UPDATES_KEY,
    catalogIds,
    catalogSignature,
    decidirArranque,
    getStartupState,
    markUpdatesSeen,
    sellarCatalogoVisto,
    setStartupState,
} from "@/lib/astraura/startup-updates";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso, marcarAviso } from "@/lib/sync/avisos-cuenta";
import { scoutSignature, hasNewScoutFindings, markScoutSeen, SCOUT_SIGNATURE_KEY } from "@/ai/astraura/model-scout";

const NEURONA = "neurona-de-prueba";
const SIG_CATALOGO = catalogSignature();
const CATALOG_LEN = catalogIds().length;

function cuentaConAvisos(ids: Record<string, { estado: "visto" | "hecho" | "luego"; ts: number; hasta?: number }>): void {
    localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids, porNeurona: {} }));
    _reiniciarCacheAvisosParaPruebas();
}

function local(estado: Record<string, unknown>): void {
    localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify(estado));
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed.neuron.device-id", NEURONA);
    _reiniciarCacheAvisosParaPruebas();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("firma del scout (model-scout) en decidirArranque", () => {
    const capsBase = {
        platform: "macos",
        gpuRenderer: "Apple M1",
        memoryGb: 8,
        cores: 8,
        webgpu: true,
    };

    it("firma de scout nueva → decide 'ventana' con motivo 'novedades'", () => {
        // Cuenta ya configurada y catálogo visto
        cuentaConAvisos({
            "a149.sistemas.inicio": { estado: "hecho", ts: 5 },
            [`a149.catalogo.${SIG_CATALOGO}`]: { estado: "visto", ts: 6 },
        });
        local({ firstRunDone: true, lastSig: SIG_CATALOGO, lastCatalog: catalogIds() });

        // Firma de scout distinta (simula hardware o catálogo cambiado)
        const sigScoutNueva = scoutSignature(capsBase, CATALOG_LEN) + "-distinta";

        // hasNewScoutFindings devuelve true para firma nueva
        expect(hasNewScoutFindings(sigScoutNueva)).toBe(true);

        // decidirArranque debería detectar la firma de scout nueva
        // y decidir 'ventana' con motivo 'novedades'
        const d = decidirArranque(Date.now(), capsBase);
        expect(d.accion).toBe("ventana");
        expect(d.motivo).toBe("novedades");
    });

    it("misma firma de scout ya vista → decide 'nada' (al-día)", () => {
        // Cuenta ya configurada y catálogo visto
        cuentaConAvisos({
            "a149.sistemas.inicio": { estado: "hecho", ts: 5 },
            [`a149.catalogo.${SIG_CATALOGO}`]: { estado: "visto", ts: 6 },
        });
        local({ firstRunDone: true, lastSig: SIG_CATALOGO, lastCatalog: catalogIds() });

        // Marcar la firma de scout actual como vista
        const sigScoutActual = scoutSignature(capsBase, CATALOG_LEN);
        markScoutSeen(sigScoutActual);
        expect(hasNewScoutFindings(sigScoutActual)).toBe(false);

        // decidirArranque no debería abrir la ventana
        const d = decidirArranque(Date.now(), capsBase);
        expect(d.accion).toBe("nada");
        expect(d.motivo).toBe("al-dia");
    });

    it("markScoutSeen persiste la firma en localStorage", () => {
        const sig = scoutSignature(capsBase, CATALOG_LEN);
        markScoutSeen(sig);
        expect(localStorage.getItem(SCOUT_SIGNATURE_KEY)).toBe(sig);
        expect(hasNewScoutFindings(sig)).toBe(false);
    });

    it("scoutSignature cambia si cambian las capacidades del hardware", () => {
        const sig1 = scoutSignature(capsBase, CATALOG_LEN);
        const capsDistinta = { ...capsBase, memoryGb: 16 };
        const sig2 = scoutSignature(capsDistinta, CATALOG_LEN);
        expect(sig1).not.toBe(sig2);
    });

    it("scoutSignature cambia si cambia el tamaño del catálogo", () => {
        const sig1 = scoutSignature(capsBase, CATALOG_LEN);
        const sig2 = scoutSignature(capsBase, CATALOG_LEN + 1);
        expect(sig1).not.toBe(sig2);
    });
});