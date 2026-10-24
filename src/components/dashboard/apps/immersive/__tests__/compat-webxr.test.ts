// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import type { FuncionXR } from "@/lib/xr/tipos";
import { useWebXR } from "../use-webxr";

// XR1010AR · compat-webxr: el hook conserva su API; las funciones pedidas son las
// del núcleo y nunca incluyen `camera-access`; `NotAllowedError` usa el mensaje
// común del resto del sistema en vez de un texto propio. Sin red, sin WebGL: la
// sesión y el renderer se inyectan con la forma mínima que el hook usa.

/** `CapacidadesXR` de mentira; `camera-access` se cuela a propósito para vigilar la lista blanca. */
function capacidadesDePrueba(funciones: readonly string[]): Parameters<typeof funcionesAPedir>[0] {
    const coladas = funciones as unknown as FuncionXR[];
    return {
        plataforma: "desconocida",
        visor: true,
        modos: ["3d-pantalla"],
        recomendado: "3d-pantalla",
        entradas: ["voz"],
        funciones: [...coladas],
        ofrecerSesion: false,
        motivos: [],
        avisos: [],
    };
}

/** `navigator.xr` falso de jsdom: `isSessionSupported` contesta y `requestSession` se espía. */
function installXR(): {
    requestSession: ReturnType<typeof vi.fn<(mode: string, init: XRSessionInit) => Promise<object>>>;
} {
    const session = {
        end: vi.fn(async () => undefined),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    };
    const requestSession = vi.fn(async (_mode: string, _init: XRSessionInit) => session);
    Object.defineProperty(navigator, "xr", {
        configurable: true,
        value: {
            isSessionSupported: vi.fn(async (mode: string) => mode === "immersive-vr"),
            requestSession,
        },
    });
    return { requestSession };
}

/** `gl` mínimo suficiente para que el hook conecte la sesión (forma real de three). */
const gl = { xr: { enabled: false, setSession: vi.fn(async () => undefined) } } as unknown as THREE.WebGLRenderer;

let XR: ReturnType<typeof installXR>;

beforeEach(() => {
    XR = installXR();
});
afterEach(() => {
    cleanup();
    Reflect.deleteProperty(navigator, "xr");
});

describe("compat-webxr (XR1010AR) · funciones del núcleo", () => {
    it("funcionesAPedir (XR1010D) nunca incluye camera-access", () => {
        const pedidas = funcionesAPedir(
            capacidadesDePrueba(["local-floor", "hand-tracking", "layers", "hit-test", "camera-access"]),
            { habitacion: false },
        );
        const todas = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas).not.toContain("camera-access");
        expect(todas).toContain("local-floor");
    });

    it("el hub pide el conjunto del núcleo en VR y en AR, sin plane-detection ni cámara", async () => {
        const { result } = renderHook(() => useWebXR(gl));
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        await act(async () => { await result.current.enter("immersive-vr"); });
        expect(XR.requestSession).toHaveBeenCalledTimes(1);
        const initVR = XR.requestSession.mock.calls[0][1];
        expect(initVR.optionalFeatures).toEqual(["local-floor", "bounded-floor", "hand-tracking", "layers"]);
        await act(async () => { await result.current.enter("immersive-ar"); });
        const initAR = XR.requestSession.mock.calls[1][1];
        expect(initAR.optionalFeatures).toEqual([
            "local-floor", "bounded-floor", "hand-tracking", "layers", "hit-test",
        ]);
    });
});

describe("compat-webxr (XR1010AR) · forma de retorno conservada", () => {
    it("expone vrSupported, arSupported, inSession, mode, error, enter y exit", async () => {
        const { result } = renderHook(() => useWebXR(gl));
        expect(Object.keys(result.current).sort()).toEqual([
            "arSupported", "enter", "error", "exit", "inSession", "mode", "vrSupported",
        ]);
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        expect(result.current.arSupported).toBe(false);
        expect(result.current.inSession).toBe(false);
        expect(typeof result.current.enter).toBe("function");
        expect(typeof result.current.exit).toBe("function");
    });

    it("una sesión creada deja inSession=true y mode correcto; exit la cierra", async () => {
        const { result } = renderHook(() => useWebXR(gl));
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        await act(async () => { await result.current.enter("immersive-vr"); });
        expect(result.current.inSession).toBe(true);
        expect(result.current.mode).toBe("immersive-vr");
        await act(async () => { await result.current.exit(); });
        expect(result.current.inSession).toBe(false);
        expect(result.current.mode).toBe(null);
    });
});

describe("compat-webxr (XR1010AR) · mensajes comunes", () => {
    it("NotAllowedError al abrir sesión da el mensaje común, no un texto propio", async () => {
        const rechazo = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        XR.requestSession.mockRejectedValueOnce(rechazo);
        const { result } = renderHook(() => useWebXR(gl));
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        await act(async () => { await result.current.enter("immersive-vr"); });
        expect(result.current.error).toBe(mensajeErrorXR(rechazo));
        expect(result.current.error).toBe("Permiso denegado para entrar en realidad virtual o aumentada.");
        expect(result.current.inSession).toBe(false);
    });

    it("mensajeErrorXR traduce los demás errores conocidos igual que el resto del OS", () => {
        expect(mensajeErrorXR(Object.assign(new Error("x"), { name: "NotSupportedError" })))
            .toBe("Este dispositivo no admite ese modo.");
        expect(mensajeErrorXR(Object.assign(new Error("x"), { name: "SecurityError" })))
            .toBe("El navegador bloqueó la entrada: hace falta https y tocar el botón.");
        expect(mensajeErrorXR(Object.assign(new Error("x"), { name: "InvalidStateError" })))
            .toBe("Ya hay otra sesión inmersiva abierta.");
    });
});
