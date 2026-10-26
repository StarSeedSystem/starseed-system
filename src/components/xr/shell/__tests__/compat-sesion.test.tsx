/**
 * Compatibilidad del hook viejo `useSesionXR` con el núcleo XR (XR1010AQ).
 * jsdom con `navigator.xr` falso: sin visor, sin WebGL y sin red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type * as THREE from "three";
import { mensajeErrorXR, useSesionXR } from "../../../vivo/espacial/use-sesion-xr";

const h = vi.hoisted(() => {
    const sesion = {
        end: vi.fn(async () => undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        enabledFeatures: [] as string[],
    };
    return {
        peticion: null as { modo: string; init?: XRSessionInit } | null,
        sesion,
        gl: {
            xr: {
                enabled: false,
                setReferenceSpaceType: vi.fn(),
                setSession: vi.fn(async () => undefined),
            },
            setClearAlpha: vi.fn(),
        },
    };
});

const gl = h.gl as unknown as THREE.WebGLRenderer;

const xrFalso = {
    isSessionSupported: vi.fn(async () => true),
    requestSession: vi.fn(async (modo: string, init?: XRSessionInit) => {
        h.peticion = { modo, init };
        return h.sesion as unknown as XRSession;
    }),
};

function todas(init?: XRSessionInit): string[] {
    return [...(init?.optionalFeatures ?? []), ...(init?.requiredFeatures ?? [])];
}

beforeEach(() => {
    h.peticion = null;
    h.sesion.enabledFeatures = [];
    h.sesion.end.mockClear();
    h.sesion.addEventListener.mockClear();
    h.gl.xr.enabled = false;
    h.gl.xr.setReferenceSpaceType.mockClear();
    h.gl.xr.setSession.mockClear();
    h.gl.setClearAlpha.mockClear();
    xrFalso.isSessionSupported.mockClear();
    xrFalso.requestSession.mockClear();
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "xr", { value: xrFalso, configurable: true });
});

afterEach(() => {
    cleanup();
    delete (navigator as Navigator & { xr?: unknown }).xr;
});

describe("mensajeErrorXR", () => {
    it("conserva sus cinco mensajes, incluido el gesto denegado", () => {
        const casos: Array<[unknown, string]> = [
            [{ name: "NotSupportedError" }, "Este dispositivo no admite ese modo."],
            [{ name: "SecurityError" }, "El navegador bloqueó la entrada: hace falta https y tocar el botón."],
            [{ name: "NotAllowedError" }, "Permiso denegado para entrar en realidad virtual o aumentada."],
            [{ name: "InvalidStateError" }, "Ya hay otra sesión inmersiva abierta."],
            [new Error("otra cosa"), "otra cosa"],
        ];
        for (const [error, esperado] of casos) expect(mensajeErrorXR(error)).toBe(esperado);
        expect(mensajeErrorXR({})).toBe("No se pudo entrar en VR/AR.");
    });
});

describe("useSesionXR", () => {
    it("en AR pide dom-overlay con su raíz y nunca camera-access", async () => {
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(gl, raiz));
        await act(async () => {
            await result.current.entrar("immersive-ar");
        });
        const init = h.peticion?.init as XRSessionInit & { domOverlay?: { root: Element } };
        expect(h.peticion?.modo).toBe("immersive-ar");
        expect(init.optionalFeatures).toContain("dom-overlay");
        expect(todas(init)).toContain("local-floor");
        expect(todas(init)).not.toContain("camera-access");
        expect(init.domOverlay?.root).toBe(raiz);
    });

    it("en VR no pide dom-overlay (solo existe en AR de mano) ni camera-access", async () => {
        const { result } = renderHook(() => useSesionXR(gl, document.createElement("div")));
        await act(async () => {
            await result.current.entrar("immersive-vr");
        });
        const init = h.peticion?.init;
        expect(h.peticion?.modo).toBe("immersive-vr");
        expect(todas(init)).not.toContain("camera-access");
        expect(todas(init)).not.toContain("dom-overlay");
    });

    it("funcionesConcedidas refleja enabledFeatures (filtrado al vocabulario cerrado)", async () => {
        h.sesion.enabledFeatures = ["local-floor", "dom-overlay", "camera-access", "inventada"];
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(gl, raiz));
        await act(async () => {
            await result.current.entrar("immersive-ar");
        });
        expect(result.current.funcionesConcedidas).toEqual(["local-floor", "dom-overlay"]);
        await act(async () => {
            await result.current.salir();
        });
        expect(result.current.funcionesConcedidas).toBeUndefined();
    });
});
