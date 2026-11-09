// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

describe("permisoCamara (función pura)", () => {
    it("mapea concedido → granted", async () => {
        const { permisoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        expect(permisoCamara("concedido")).toBe("granted");
    });
    it("mapea denegado → denied", async () => {
        const { permisoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        expect(permisoCamara("denegado")).toBe("denied");
    });
    it("mapea preguntar → prompt", async () => {
        const { permisoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        expect(permisoCamara("preguntar")).toBe("prompt");
    });
    it("mapea no-disponible → desconocido", async () => {
        const { permisoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        expect(permisoCamara("no-disponible")).toBe("desconocido");
    });
});

describe("useEstadoCamara (hook)", () => {
    const enumerateDevicesMock = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        vi.doMock("@/lib/aurora/senses/request-permission", () => ({
            consultarPermiso: vi.fn(),
        }));
        Object.defineProperty(navigator, "mediaDevices", {
            value: { enumerateDevices: enumerateDevicesMock },
            configurable: true,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("con consultarPermiso 'denegado' y 2 videoinput → { comprobando: false, camaras: 2, permiso: 'denied' }", async () => {
        const { consultarPermiso } = await import("@/lib/aurora/senses/request-permission");
        vi.mocked(consultarPermiso).mockResolvedValue("denegado");
        enumerateDevicesMock.mockResolvedValue([
            { kind: "videoinput", deviceId: "1", label: "Camera 1", groupId: "g1" },
            { kind: "videoinput", deviceId: "2", label: "Camera 2", groupId: "g1" },
            { kind: "audioinput", deviceId: "3", label: "Mic", groupId: "g2" },
        ]);

        const { useEstadoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        const { result } = renderHook(() => useEstadoCamara());

        await waitFor(() => expect(result.current.comprobando).toBe(false));

        expect(result.current).toEqual({ comprobando: false, camaras: 2, permiso: "denied" });
        expect(vi.mocked(consultarPermiso)).toHaveBeenCalledWith("camara");
    });

    it("si consultarPermiso rechaza → permiso 'desconocido'", async () => {
        const { consultarPermiso } = await import("@/lib/aurora/senses/request-permission");
        vi.mocked(consultarPermiso).mockRejectedValue(new Error("fallo"));
        enumerateDevicesMock.mockResolvedValue([]);

        const { useEstadoCamara } = await import("@/components/dashboard/widgets/camera-quick-widget");
        const { result } = renderHook(() => useEstadoCamara());

        await waitFor(() => expect(result.current.comprobando).toBe(false));

        expect(result.current.permiso).toBe("desconocido");
        expect(vi.mocked(consultarPermiso)).toHaveBeenCalledWith("camara");
    });
});