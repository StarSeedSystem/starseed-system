/**
 * XR1010AQ · el hook viejo de la escena compartida delega en el núcleo puro:
 * `funcionesAPedir` para pedir y `refinarFunciones` para guardar lo concedido.
 * WebXR se inyecta con un `navigator.xr` falso: sin visor, sin red y sin WebGL.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type * as THREE from "three";
import { mensajeErrorXR, useSesionXR } from "../../../vivo/espacial/use-sesion-xr";

interface Peticion {
    modo: string;
    init: XRSessionInit & { domOverlay?: { root: Element } };
}

function instalarXR(enabledFeatures: string[]) {
    const peticiones: Peticion[] = [];
    const sesion = {
        enabledFeatures,
        end: vi.fn(async () => undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    const xr = {
        isSessionSupported: vi.fn(async () => true),
        requestSession: vi.fn(async (modo: string, init: Peticion["init"]) => {
            peticiones.push({ modo, init });
            return sesion;
        }),
    };
    Object.defineProperty(navigator, "xr", { value: xr, configurable: true });
    return { peticiones, sesion };
}

function glFalso(): THREE.WebGLRenderer {
    return {
        xr: { enabled: false, setReferenceSpaceType: vi.fn(), setSession: vi.fn(async () => undefined) },
        setClearAlpha: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
}

const todasLasPedidas = (init: Peticion["init"]): string[] => [
    ...(init.optionalFeatures ?? []),
    ...(init.requiredFeatures ?? []),
];

beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
});
afterEach(() => {
    cleanup();
    Reflect.deleteProperty(navigator, "xr");
});

describe("mensajeErrorXR", () => {
    it("conserva sus cinco mensajes, incluido NotAllowedError por falta de gesto", () => {
        const casos: Array<[unknown, string]> = [
            [{ name: "NotSupportedError" }, "Este dispositivo no admite ese modo."],
            [{ name: "SecurityError" }, "El navegador bloqueó la entrada: hace falta https y tocar el botón."],
            [{ name: "NotAllowedError" }, "Permiso denegado para entrar en realidad virtual o aumentada."],
            [{ name: "InvalidStateError" }, "Ya hay otra sesión inmersiva abierta."],
            [Object.assign(new Error("algo falló"), { name: "Raro" }), "algo falló"],
        ];
        for (const [error, esperado] of casos) expect(mensajeErrorXR(error)).toBe(esperado);
        expect(mensajeErrorXR(null)).toBe("No se pudo entrar en VR/AR.");
    });
});

describe("useSesionXR", () => {
    it("la sesión de AR con raíz de interfaz pide dom-overlay y nunca camera-access", async () => {
        const { peticiones } = instalarXR(["local-floor", "hit-test", "dom-overlay"]);
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(glFalso(), raiz));

        await act(async () => {
            await result.current.entrar("immersive-ar");
        });

        expect(peticiones).toHaveLength(1);
        expect(peticiones[0].modo).toBe("immersive-ar");
        expect(peticiones[0].init.optionalFeatures).toContain("dom-overlay");
        expect(todasLasPedidas(peticiones[0].init)).not.toContain("camera-access");
        expect(peticiones[0].init.requiredFeatures).toContain("local-floor");
        expect(result.current.error).toBeNull();
    });

    it("sin raíz de interfaz no pide dom-overlay, y en VR tampoco", async () => {
        const { peticiones } = instalarXR(["local-floor"]);
        const { result } = renderHook(() => useSesionXR(glFalso(), null));

        await act(async () => {
            await result.current.entrar("immersive-ar");
        });
        await act(async () => {
            await result.current.entrar("immersive-vr");
        });

        expect(peticiones[0].init.domOverlay).toBeUndefined();
        expect(todasLasPedidas(peticiones[0].init)).not.toContain("dom-overlay");
        expect(todasLasPedidas(peticiones[1].init)).toEqual(
            expect.arrayContaining(["local-floor", "bounded-floor", "hand-tracking"]),
        );
    });

    it("funcionesConcedidas refleja enabledFeatures y descarta lo que no es función XR", async () => {
        const { peticiones } = instalarXR(["local-floor", "dom-overlay", "camera-access", "inventada"]);
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(glFalso(), raiz));

        expect(result.current.funcionesConcedidas).toBeUndefined();
        await act(async () => {
            await result.current.entrar("immersive-ar");
        });

        expect(peticiones).toHaveLength(1);
        expect(result.current.activa).toBe(true);
        expect(result.current.funcionesConcedidas).toEqual(["local-floor", "dom-overlay"]);
    });
});
