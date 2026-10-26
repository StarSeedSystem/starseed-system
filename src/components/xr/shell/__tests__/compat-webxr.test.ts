// @vitest-environment jsdom
/**
 * XR1010AR · compat-webxr: el hook del hub `/xr` (`use-webxr.ts`) conserva su API y se alinea
 * con el resto del sistema XR. Pruebas con `navigator.xr` falso inyectado en el navigator de jsdom.
 */
import type * as THREE from "three";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWebXR } from "@/components/dashboard/apps/immersive/use-webxr";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";

const MENSAJE_PERMISO = "Permiso denegado para entrar en realidad virtual o aumentada.";

/** Lo mínimo de `THREE.WebGLRenderer` que el hook toca: `gl.xr`. */
const rendererFalso = () =>
    ({ xr: { enabled: false, setSession: vi.fn().mockResolvedValue(undefined) } }) as unknown as THREE.WebGLRenderer;

/** Sesión falsa: EventTarget real (para el evento `end`) más `end()`. */
const sesionFalsa = () => {
    const sesion = new EventTarget() as EventTarget & { end: () => Promise<void> };
    sesion.end = vi.fn().mockResolvedValue(undefined);
    return sesion;
};

type XRFalsa = {
    isSessionSupported(modo: string): Promise<boolean>;
    requestSession(modo: string, init?: XRSessionInit): Promise<XRSession>;
    offerSession?(modo: string, init?: XRSessionInit): Promise<XRSession>;
};

/** Inyecta `navigator.xr` falso; devuelve los espías de `requestSession`/`offerSession`. */
function inyectarXR(o: { vr?: boolean; ar?: boolean; rechazo?: () => unknown }) {
    const pedidas: XRSessionInit[] = [];
    const verificar = vi.fn((modo: string) => Promise.resolve(modo === "immersive-vr" ? o.vr === true : o.ar === true));
    const sesion = sesionFalsa();
    const requestSession = vi.fn((_modo: string, init?: XRSessionInit) => {
        pedidas.push({ ...init });
        if (o.rechazo && pedidas.length === 1) return Promise.reject(o.rechazo());
        return Promise.resolve(sesion as XRSession);
    });
    const offerSession = vi.fn(() => Promise.resolve(sesion as XRSession));
    const xr: XRFalsa = { isSessionSupported: verificar, requestSession, offerSession };
    const navegador = navigator as Navigator & { xr?: XRFalsa };
    Object.defineProperty(navegador, "xr", { configurable: true, value: xr });
    return { xr, requestSession, offerSession, pedidas };
}

beforeEach(() => {
    const navegador = navigator as Navigator & { xr?: XRFalsa };
    delete navegador.xr;
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("useWebXR · compatibilidad XR1010AR", () => {
    it("conserva su forma de retorno y degrada sin WebXR", async () => {
        const { result } = renderHook(() => useWebXR(rendererFalso()));
        expect(Object.keys(result.current).sort()).toEqual(
            ["arSupported", "enter", "error", "exit", "inSession", "mode", "vrSupported"],
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.vrSupported).toBe(false);
        expect(result.current.arSupported).toBe(false);
        expect(result.current.inSession).toBe(false);
        expect(result.current.mode).toBeNull();
    });

    it("comprueba VR/AR del navigator falso y entra sin llamar a offerSession", async () => {
        const { requestSession, offerSession, pedidas } = inyectarXR({ vr: true, ar: false });
        const gl = rendererFalso();
        const { result } = renderHook(() => useWebXR(gl));
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.vrSupported).toBe(true);
        expect(result.current.arSupported).toBe(false);

        await act(async () => {
            await result.current.enter("immersive-vr");
        });
        expect(requestSession).toHaveBeenCalledTimes(1);
        expect(offerSession).not.toHaveBeenCalled();
        expect(pedidas[0].optionalFeatures).toEqual([
            "local-floor", "bounded-floor", "hand-tracking", "layers", "hit-test",
        ]);
        expect(result.current.inSession).toBe(true);
        expect(result.current.mode).toBe("immersive-vr");
        expect(gl.xr.enabled).toBe(true);
    });

    it("las funciones pedidas son las del núcleo y nunca incluyen camera-access", async () => {
        const { pedidas } = inyectarXR({ vr: true });
        const { result } = renderHook(() => useWebXR(rendererFalso()));
        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.enter("immersive-vr");
        });
        const pedidasPlanas = [...(pedidas[0].optionalFeatures ?? []), ...(pedidas[0].requiredFeatures ?? [])];
        expect(pedidasPlanas).toContain("local-floor");
        expect(pedidasPlanas).not.toContain("camera-access");
    });

    it("un NotAllowedError de requestSession da el mensaje común (mensajeErrorXR)", async () => {
        const rechazo = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        const { requestSession } = inyectarXR({ vr: true, rechazo: () => rechazo });
        const gl = rendererFalso();
        const { result } = renderHook(() => useWebXR(gl));
        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.enter("immersive-vr");
        });
        expect(requestSession).toHaveBeenCalledTimes(1);
        expect(result.current.error).toBe(MENSAJE_PERMISO);
        expect(result.current.error).toBe(mensajeErrorXR(rechazo));
        expect(result.current.inSession).toBe(false);
        expect(result.current.mode).toBeNull();
        expect(gl.xr.enabled).toBe(false);
    });
});
