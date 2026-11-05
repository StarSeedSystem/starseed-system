// @vitest-environment jsdom
/**
 * Integración de scoutSignature en el flujo de arranque.
 * 
 * §14.1: La ventana de inicio usa la firma de novedades del explorador de modelos (`scoutSignature`)
 * para decidir si reaparecerla. Mismo patrón que la firma+visita para el catálogo:
 *   - nueva firma → aviso con `novedades-scout`
 *   - misma firma ya vista → no reaparece
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    AVISO_CATALOGO_PREFIJO,
    AVISO_SISTEMAS_INICIO,
    STARTUP_UPDATES_KEY,
    catalogIds,
    catalogSignature,
    copiarEstadoLocalACuenta,
    decidirArranque,
    getStartupState,
    sellarCatalogoVisto,
    shouldShowUpdates,
} from "@/lib/astraura/startup-updates";
import { SCOUT_SIGNATURE_KEY, markScoutSeen, scoutSignature } from "@/ai/astraura/model-scout";
import { AVISOS_KEY, _reiniciarCacheAvisosParaPruebas, estadoAviso } from "@/lib/sync/avisos-cuenta";

const NEURONA = "neurona-de-prueba";
const FIRMASCOUT_BASE = catalogSignature();
const CAPS_EJEMPLO = { platform: "linux", memoryGb: 8, cores: 8, webgpu: false };

function local(estado: Record<string, unknown>): void {
    localStorage.setItem(STARTUP_UPDATES_KEY, JSON.stringify(estado));
}

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("starseed.neuron.device-id", NEURONA);
    _reiniciarCacheAvisosParaPruebas();
    localStorage.removeItem(SCOUT_SIGNATURE_KEY);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("scoutSignature en decidirArranque", () => {
    it("sin primera configuración: ventana grande independientemente de scout", () => {
        const d = decidirArranque(Date.now(), CAPS_EJEMPLO);
        expect(d).toEqual({ accion: "ventana", motivo: "primera-vez", pendientes: expect.any(Array) });
    });

    it("con configuración hecha y firma de scout nueva: aviso con esScout=true", () => {
        const firmaActual = scoutSignature(CAPS_EJEMPLO, catalogIds().length);
        localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } }, porNeurona: {} }));
        _reiniciarCacheAvisosParaPruebas();
        local({ firstRunDone: true, lastSig: catalogSignature(), autoUpdate: true });
        localStorage.removeItem(SCOUT_SIGNATURE_KEY);
        const d = decidirArranque(Date.now(), CAPS_EJEMPLO);
        expect(d.accion).toBe("aviso");
        if (d.accion === "aviso") {
            expect(d.motivo).toBe("novedades");
            expect(d.esScout).toBe(true);
            expect(d.firma).toBe(firmaActual);
        }
        expect(shouldShowUpdates()).toBe(false);
    });

    it("misma firma de scout ya vista: no reaparece", () => {
        const firmaActual = scoutSignature(CAPS_EJEMPLO, catalogIds().length);
        localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 }, [AVISO_CATALOGO_PREFIJO + catalogSignature()]: { estado: "visto", ts: 6 } }, porNeurona: {} }));
        _reiniciarCacheAvisosParaPruebas();
        localStorage.setItem(SCOUT_SIGNATURE_KEY, firmaActual);
        local({ firstRunDone: true, lastSig: catalogSignature(), autoUpdate: true });
        const d = decidirArranque(Date.now(), CAPS_EJEMPLO);
        expect(d).toEqual({ accion: "nada", motivo: "al-dia" });
    });

    it("sin capacidades (caps undefined): no llama a scoutSignature", () => {
        localStorage.setItem(AVISOS_KEY, JSON.stringify({ v: 1, ids: { [AVISO_SISTEMAS_INICIO]: { estado: "hecho", ts: 5 } }, porNeurona: {} }));
        _reiniciarCacheAvisosParaPruebas();
        local({ firstRunDone: true, lastSig: catalogSignature(), autoUpdate: true });
        const d = decidirArranque(Date.now());
        expect(d).toEqual({ accion: "nada", motivo: "al-dia" });
    });
});