// @vitest-environment jsdom
/**
 * useEstadoCapas (Ola 365 · CC3): preferencia + salud viva de las capas 1.58, sin gastar
 * tráfico de más. Todo lo externo (router, disponibilidad, malla, sync) va mockeado.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    ajustes: {} as Record<string, unknown>,
    guardados: [] as Record<string, unknown>[],
    ultimaRuta: null as null | { sourceId: string; ok: boolean },
    detectar: vi.fn(),
    estadoSync: { state: "connected", lastChangeAt: null, lastKey: null } as Record<string, unknown>,
    malla: { nodes: [] as { num: number }[], self: null as null | { num: number } },
    faros: [] as unknown[],
}));

vi.mock("@/ai/astraura/router", () => ({
    ROUTE_EVENT: "starseed:astraura-route",
    getIntelligenceSettings: () => ({ ...h.ajustes }),
    saveIntelligenceSettings: (patch: Record<string, unknown>) => {
        h.guardados.push(patch);
        h.ajustes = { ...h.ajustes, ...patch };
        return h.ajustes;
    },
    lastRoute: () => h.ultimaRuta,
}));
vi.mock("@/ai/astraura/availability", () => ({ detectAvailabilitySafe: h.detectar }));
vi.mock("@/ai/astraura/mesh/use-mesh", () => ({
    useMeshState: () => h.malla,
    useNearbyBeacons: () => h.faros,
}));
vi.mock("@/lib/sync/realtime-sync", () => ({
    getRealtimeSyncStatus: () => h.estadoSync,
    onRealtimeSyncStatus: (cb: (s: unknown) => void) => {
        cb(h.estadoSync);
        return () => {};
    },
}));

import { colectivaDesde, rutaUsa158, useEstadoCapas } from "@/lib/astraura/use-estado-capas";

function visibilidad(v: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

beforeEach(() => {
    h.ajustes = {};
    h.guardados = [];
    h.ultimaRuta = null;
    h.estadoSync = { state: "connected", lastChangeAt: null, lastKey: null };
    h.malla = { nodes: [], self: null };
    h.faros = [];
    h.detectar.mockReset();
    h.detectar.mockResolvedValue([
        { source: { id: "astraura-158-local" }, ready: true },
        { source: { id: "astraura-158-nube" }, ready: false },
    ]);
    visibilidad("visible");
});
afterEach(() => vi.useRealTimers());

describe("funciones puras", () => {
    it("colectivaDesde traduce el estado de la sincronización", () => {
        expect(colectivaDesde({ state: "connected" } as never)).toBe(true);
        expect(colectivaDesde({ state: "no-session" } as never)).toBe(false);
        expect(colectivaDesde({ state: "connecting" } as never)).toBeNull();
        expect(colectivaDesde(null)).toBeNull();
    });
    it("rutaUsa158 solo cuenta rutas 1.58 que salieron bien", () => {
        expect(rutaUsa158({ sourceId: "astraura-158-local", ok: true })).toBe(true);
        expect(rutaUsa158({ sourceId: "astraura-158-local", ok: false })).toBe(false);
        expect(rutaUsa158({ sourceId: "openrouter-free", ok: true })).toBe(false);
        expect(rutaUsa158(null)).toBe(false);
    });
});

describe("useEstadoCapas", () => {
    it("por defecto el modo 1.58 y las cuatro capas están encendidas", async () => {
        const { result } = renderHook(() => useEstadoCapas());
        expect(result.current.preferencia.activo).toBe(true);
        expect(result.current.preferencia.capas).toEqual({ local: true, mesh: true, nube: true, colectiva: true });
        expect(result.current.resumen.etiqueta).toBe("1.58 · 4/4 capas");
        await waitFor(() => expect(result.current.salud.local).toBe(true));
        expect(result.current.estados.nube).toBe("sin-senal");
        expect(result.current.estados.colectiva).toBe("sincronizada");
    });

    it("cambiarCapa('nube', false) guarda capa158Nube:false y respeta el resto", async () => {
        const { result } = renderHook(() => useEstadoCapas());
        act(() => result.current.cambiarCapa("nube", false));
        expect(h.guardados.at(-1)).toMatchObject({ capa158Nube: false, capa158Local: true, astraura158Activo: true });
        expect(result.current.preferencia.capas.nube).toBe(false);
        expect(result.current.estados.nube).toBe("apagada");
    });

    it("con la pestaña oculta no sondea la disponibilidad", async () => {
        visibilidad("hidden");
        renderHook(() => useEstadoCapas());
        await act(async () => {
            await Promise.resolve();
        });
        expect(h.detectar).not.toHaveBeenCalled();
    });

    it("una ruta 1.58 reciente marca la capa local como sincronizada con el chat", async () => {
        h.ultimaRuta = { sourceId: "astraura-158-local", ok: true };
        const { result } = renderHook(() => useEstadoCapas());
        await waitFor(() => expect(result.current.estados.local).toBe("sincronizada"));
    });

    it("el evento de ruta actualiza al momento", async () => {
        const { result } = renderHook(() => useEstadoCapas());
        await waitFor(() => expect(result.current.estados.local).toBe("activa"));
        act(() => {
            window.dispatchEvent(new CustomEvent("starseed:astraura-route", { detail: { sourceId: "astraura-158-local", ok: true } }));
        });
        expect(result.current.estados.local).toBe("sincronizada");
    });

    it("con el maestro apagado no llama a detectAvailabilitySafe", async () => {
        h.ajustes = { astraura158Activo: false };
        const { result } = renderHook(() => useEstadoCapas());
        await act(async () => {
            await Promise.resolve();
        });
        expect(h.detectar).not.toHaveBeenCalled();
        expect(result.current.resumen.etiqueta).toBe("Enrutador libre");
    });

    it("vuelve a sondear cada 60 s y limpia el intervalo al desmontar", async () => {
        vi.useFakeTimers();
        const { unmount } = renderHook(() => useEstadoCapas());
        await act(async () => {
            await Promise.resolve();
        });
        expect(h.detectar).toHaveBeenCalledTimes(1);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(h.detectar).toHaveBeenCalledTimes(2);
        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(120_000);
        });
        expect(h.detectar).toHaveBeenCalledTimes(2);
    });

    it("cuenta los vecinos de la malla sin contarse a sí misma y suma los faros", () => {
        h.malla = { nodes: [{ num: 1 }, { num: 2 }], self: { num: 1 } };
        h.faros = [{}];
        const { result } = renderHook(() => useEstadoCapas());
        expect(result.current.salud.vecinosMesh).toBe(2);
        expect(result.current.estados.mesh).toBe("sincronizada");
    });

    it("relee la preferencia cuando otra superficie o neurona la guarda", () => {
        const { result } = renderHook(() => useEstadoCapas());
        act(() => {
            h.ajustes = { capa158Mesh: false };
            window.dispatchEvent(new CustomEvent("starseed:astraura-intelligence"));
        });
        expect(result.current.preferencia.capas.mesh).toBe(false);
    });
});
