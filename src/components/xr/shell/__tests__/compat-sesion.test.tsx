/**
 * Compatibilidad de `use-sesion-xr` con el núcleo XR (XR1010AQ · contrato §2.2).
 * jsdom y `navigator.xr` falso: sin visor, sin WebGL y sin red. Se comprueba que la lista de
 * funciones sale de `funcionesAPedir` (nunca `camera-access`, `dom-overlay` con raíz en AR),
 * que `funcionesConcedidas` refleja `enabledFeatures` y que los mensajes de error no cambian.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { mensajeErrorXR, useSesionXR } from "@/components/vivo/espacial/use-sesion-xr";

interface Peticion {
    modo: string;
    init?: XRSessionInit;
}

function renderizadorFalso(): THREE.WebGLRenderer {
    return {
        xr: {
            enabled: false,
            setReferenceSpaceType: vi.fn(),
            setSession: vi.fn(async () => undefined),
        },
        setClearAlpha: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
}

function sesionFalsa(concedidas: string[]): XRSession {
    return {
        enabledFeatures: concedidas,
        end: vi.fn(async () => undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as XRSession;
}

function instalarXR(o: { vr?: boolean; ar?: boolean; concedidas?: string[] } = {}) {
    const peticiones: Peticion[] = [];
    const sesion = sesionFalsa(o.concedidas ?? ["local-floor", "hit-test", "dom-overlay"]);
    const xr = {
        isSessionSupported: vi.fn(async (modo: string) => (modo === "immersive-vr" ? o.vr ?? true : o.ar ?? true)),
        requestSession: vi.fn(async (modo: string, init?: XRSessionInit) => {
            peticiones.push({ modo, init });
            return sesion;
        }),
    };
    Object.defineProperty(navigator, "xr", { value: xr, configurable: true });
    return { xr, sesion, peticiones };
}

beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
});

afterEach(() => {
    cleanup();
    delete (navigator as Navigator & { xr?: unknown }).xr;
});

describe("mensajeErrorXR", () => {
    it("conserva sus cinco mensajes", () => {
        expect(mensajeErrorXR({ name: "NotSupportedError" })).toBe("Este dispositivo no admite ese modo.");
        expect(mensajeErrorXR({ name: "SecurityError" })).toBe(
            "El navegador bloqueó la entrada: hace falta https y tocar el botón.",
        );
        expect(mensajeErrorXR({ name: "NotAllowedError" })).toBe(
            "Permiso denegado para entrar en realidad virtual o aumentada.",
        );
        expect(mensajeErrorXR({ name: "InvalidStateError" })).toBe("Ya hay otra sesión inmersiva abierta.");
        expect(mensajeErrorXR({ name: "Rareza" })).toBe("No se pudo entrar en VR/AR.");
    });

    it("un error con mensaje propio se respeta", () => {
        expect(mensajeErrorXR(new Error("El visor se durmió."))).toBe("El visor se durmió.");
    });
});

describe("useSesionXR · funciones pedidas", () => {
    it("en AR pide dom-overlay con la raíz y nunca camera-access", async () => {
        const { peticiones } = instalarXR();
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(renderizadorFalso(), raiz));
        await act(async () => {
            await result.current.entrar("immersive-ar");
        });
        const init = peticiones[0]?.init;
        const pedidas = [...(init?.optionalFeatures ?? []), ...(init?.requiredFeatures ?? [])];
        expect(init?.optionalFeatures).toContain("dom-overlay");
        expect(init?.optionalFeatures).toContain("hit-test");
        expect(init?.requiredFeatures).toContain("local-floor");
        expect(pedidas).not.toContain("camera-access");
    });

    it("en AR sin raíz de interfaz no pide dom-overlay", async () => {
        const { peticiones } = instalarXR();
        const { result } = renderHook(() => useSesionXR(renderizadorFalso(), null));
        await act(async () => {
            await result.current.entrar("immersive-ar");
        });
        const pedidas = [
            ...(peticiones[0]?.init?.optionalFeatures ?? []),
            ...(peticiones[0]?.init?.requiredFeatures ?? []),
        ];
        expect(pedidas).not.toContain("dom-overlay");
    });

    it("en VR conserva bounded-floor y hand-tracking", async () => {
        const { peticiones } = instalarXR();
        const { result } = renderHook(() => useSesionXR(renderizadorFalso(), null));
        await act(async () => {
            await result.current.entrar("immersive-vr");
        });
        expect(peticiones[0]?.init?.optionalFeatures).toEqual(
            expect.arrayContaining(["bounded-floor", "hand-tracking"]),
        );
        expect(peticiones[0]?.init?.requiredFeatures).toContain("local-floor");
    });
});

describe("useSesionXR · funciones concedidas", () => {
    it("refleja enabledFeatures y descarta lo que no es una función XR", async () => {
        instalarXR({ concedidas: ["local-floor", "hit-test", "dom-overlay", "camera-access"] });
        const { result } = renderHook(() => useSesionXR(renderizadorFalso(), null));
        await act(async () => {
            await result.current.entrar("immersive-vr");
        });
        expect(result.current.funcionesConcedidas).toEqual(["local-floor", "hit-test", "dom-overlay"]);
        expect(result.current.funcionesConcedidas).not.toContain("camera-access");
    });
});
