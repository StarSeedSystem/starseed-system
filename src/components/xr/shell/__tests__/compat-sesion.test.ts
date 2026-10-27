// @vitest-environment jsdom
/**
 * XR1010AQ · `use-sesion-xr.ts` delega la lista de funciones en el núcleo (XR1010D), guarda lo
 * concedido y conserva `mensajeErrorXR` y su API pública. `navigator.xr` se inyecta a mano: sin
 * visor, sin red y sin WebGL de verdad.
 */
import type * as THREE from "three";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mensajeErrorXR, useSesionXR } from "@/components/vivo/espacial/use-sesion-xr";

type XRFalsa = {
    isSessionSupported(modo: string): Promise<boolean>;
    requestSession(modo: string, init?: XRSessionInit): Promise<XRSession>;
};

/** Lo mínimo de `THREE.WebGLRenderer` que toca el hook: `gl.xr` y el alfa de AR. */
function rendererFalso() {
    return {
        xr: { enabled: false, setReferenceSpaceType: vi.fn(), setSession: vi.fn(async () => undefined) },
        setClearAlpha: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
}

/** Sesión falsa: un `EventTarget` real (el hook escucha `end`) más `end()` y `enabledFeatures`. */
function sesionFalsa(concedidas?: string[]) {
    const sesion = new EventTarget() as EventTarget & { end: () => Promise<void>; enabledFeatures?: string[] };
    sesion.end = vi.fn(async () => undefined);
    if (concedidas) sesion.enabledFeatures = concedidas;
    return sesion as unknown as XRSession;
}

/** Inyecta `navigator.xr` falso; devuelve las peticiones hechas a `requestSession`. */
function inyectarXR(o: { vr?: boolean; ar?: boolean; concedidas?: string[] } = {}) {
    const pedidas: XRSessionInit[] = [];
    const sesion = sesionFalsa(o.concedidas);
    const xr: XRFalsa = {
        isSessionSupported: async (modo) => (modo === "immersive-vr" ? o.vr !== false : o.ar !== false),
        requestSession: async (_modo, init) => {
            pedidas.push({ ...init });
            return sesion;
        },
    };
    Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
    return { pedidas, sesion };
}

beforeEach(() => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    delete (navigator as Navigator & { xr?: XRFalsa }).xr;
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
describe("useSesionXR · compatibilidad XR1010AQ", () => {
    it("mensajeErrorXR conserva sus cinco mensajes", () => {
        const casos: Array<[unknown, string]> = [
            [{ name: "NotSupportedError" }, "Este dispositivo no admite ese modo."],
            [{ name: "SecurityError" }, "El navegador bloqueó la entrada: hace falta https y tocar el botón."],
            [{ name: "NotAllowedError" }, "Permiso denegado para entrar en realidad virtual o aumentada."],
            [{ name: "InvalidStateError" }, "Ya hay otra sesión inmersiva abierta."],
            [new Error("No se pudo entrar en VR/AR."), "No se pudo entrar en VR/AR."],
        ];
        for (const [error, esperado] of casos) expect(mensajeErrorXR(error)).toBe(esperado);
    });

    it("en AR pide dom-overlay con la raíz de interfaz y nunca camera-access", async () => {
        const { pedidas } = inyectarXR({ ar: true });
        const raiz = document.createElement("div");
        const { result } = renderHook(() => useSesionXR(rendererFalso(), raiz));
        await act(async () => { await result.current.entrar("immersive-ar"); });
        const init = pedidas[0] as XRSessionInit & { domOverlay?: { root: Element } };
        const todas = [...(init.optionalFeatures ?? []), ...(init.requiredFeatures ?? [])];
        expect(todas).toContain("dom-overlay");
        expect(init.domOverlay?.root).toBe(raiz);
        expect(todas).not.toContain("camera-access");
        expect(init.requiredFeatures).toContain("local-floor");
        expect(result.current.modo).toBe("immersive-ar");
    });

    it("en VR la lista sale del núcleo: local-floor requerida y nada de camera-access", async () => {
        const { pedidas } = inyectarXR({ vr: true });
        const { result } = renderHook(() => useSesionXR(rendererFalso(), null));
        await act(async () => { await result.current.entrar("immersive-vr"); });
        const init = pedidas[0];
        const todas = [...(init.optionalFeatures ?? []), ...(init.requiredFeatures ?? [])];
        expect(init.requiredFeatures).toEqual(["local-floor"]);
        expect(init.optionalFeatures).toEqual(["bounded-floor", "hand-tracking"]);
        expect(todas).not.toContain("camera-access");
        expect(todas).not.toContain("dom-overlay");
    });

    it("funcionesConcedidas refleja enabledFeatures y se limpia al salir", async () => {
        const { result } = renderHook(() => useSesionXR(rendererFalso(), null));
        expect(result.current.funcionesConcedidas).toBeUndefined();
        inyectarXR({ vr: true, concedidas: ["local-floor", "hand-tracking", "magia-negra"] });
        await act(async () => { await result.current.entrar("immersive-vr"); });
        expect(result.current.funcionesConcedidas).toEqual(["local-floor", "hand-tracking"]);
        await act(async () => { await result.current.salir(); });
        expect(result.current.funcionesConcedidas).toBeUndefined();
    });

    it("un NotAllowedError por falta de gesto se explica con el mensaje común", async () => {
        const rechazo = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        Object.defineProperty(navigator, "xr", {
            configurable: true,
            value: {
                isSessionSupported: async () => true,
                requestSession: async () => Promise.reject(rechazo),
            } satisfies XRFalsa,
        });
        const { result } = renderHook(() => useSesionXR(rendererFalso(), null));
        await act(async () => { await result.current.entrar("immersive-vr"); });
        expect(result.current.error).toBe(mensajeErrorXR(rechazo));
        expect(result.current.activa).toBe(false);
        expect(result.current.modo).toBeNull();
    });
});
