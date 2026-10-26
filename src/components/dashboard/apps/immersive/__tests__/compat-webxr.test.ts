// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type * as THREE from "three";
import type { FuncionXR } from "@/lib/xr/tipos";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { useWebXR } from "@/components/dashboard/apps/immersive/use-webxr";

// XR1010AR · compat-webxr: el hook conserva su API; las funciones del
// núcleo no piden `camera-access`; `NotAllowedError` usa el mensaje común.

describe("compat-webxr (XR1010AR)", () => {
    // `camera-access` está fuera del vocabulario cerrado: entra en la lista
    // como intruso simulado para comprobar que la lista blanca lo rechaza.
    const cap = {
        plataforma: "desconocida",
        visor: false,
        modos: ["2d"],
        recomendado: "2d",
        entradas: ["voz"],
        funciones: ["local-floor", "hand-tracking", "layers", "hit-test", "camera-access"] as unknown as FuncionXR[],
        ofrecerSesion: false,
        motivos: [],
        avisos: [],
    } satisfies CapacidadesXR;

    it("funcionesAPedir nunca incluye camera-access", () => {
        const pedidas = funcionesAPedir(cap, { habitacion: false });
        const todas: string[] = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas).not.toContain("camera-access");
        expect(todas).toContain("local-floor");
    });

    it("mensajeErrorXR da el mensaje común para los errores de requestSession", () => {
        const esperados: Record<string, string> = {
            NotAllowedError: "Permiso denegado para entrar en realidad virtual o aumentada.",
            NotSupportedError: "Este dispositivo no admite ese modo.",
            InvalidStateError: "Ya hay otra sesión inmersiva abierta.",
        };
        for (const [nombre, esperado] of Object.entries(esperados)) {
            const err = Object.assign(new Error("x"), { name: nombre });
            expect(mensajeErrorXR(err)).toBe(esperado);
        }
    });
});

describe("compat-webxr · el hook (XR1010AR)", () => {
    const MENSAJE_DENEGADO = "Permiso denegado para entrar en realidad virtual o aumentada.";

    /** `navigator.xr` falso: cuenta sesiones pedidas y deja llamada offerSession (que no debe usarse). */
    function xrFalso(rechazo?: unknown) {
        const sesion = {
            addEventListener: () => {},
            removeEventListener: () => {},
            end: async () => {},
        } as unknown as XRSession;
        return {
            isSessionSupported: vi.fn(async (m: string) => m === "immersive-vr"),
            requestSession: vi.fn(rechazo ? async () => Promise.reject(rechazo) : async () => sesion),
            offerSession: vi.fn(),
        } as unknown as XRSystem & {
            isSessionSupported: ReturnType<typeof vi.fn>;
            requestSession: ReturnType<typeof vi.fn>;
            offerSession: ReturnType<typeof vi.fn>;
        };
    }

    function glFalso() {
        return { xr: { enabled: false, setSession: vi.fn(async () => {}) } } as unknown as THREE.WebGLRenderer;
    }

    function instalar(xr: XRSystem) {
        Object.defineProperty(navigator, "xr", { value: xr, configurable: true });
    }

    it("conserva su forma de retorno y pide las funciones del núcleo, sin camera-access ni offerSession", async () => {
        const xr = xrFalso();
        instalar(xr as unknown as XRSystem);
        const { result } = renderHook(() => useWebXR(glFalso()));
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        expect(Object.keys(result.current).sort()).toEqual(
            ["arSupported", "enter", "error", "exit", "inSession", "mode", "vrSupported"]
        );
        await act(async () => { await result.current.enter("immersive-vr"); });
        const args = (xr.requestSession as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
        const init = args[1] as XRSessionInit;
        const pedidas = init.optionalFeatures ?? [];
        expect(pedidas).toContain("local-floor");
        expect(pedidas).toContain("hand-tracking");
        expect(pedidas.map(String)).not.toContain("camera-access");
        // Todo lo pedido pasa por `funcionesAPedir` (§2.2): misma lista, sin duplicados.
        const cap: CapacidadesXR = {
            plataforma: "desconocida", visor: false, modos: ["2d"], recomendado: "2d",
            entradas: ["voz"], funciones: pedidas as FuncionXR[], ofrecerSesion: false, motivos: [], avisos: [],
        };
        expect(funcionesAPedir(cap).opcionales.length + funcionesAPedir(cap).requeridas.length).toBe(pedidas.length);
        expect(xr.offerSession).not.toHaveBeenCalled();
        expect(result.current.inSession).toBe(true);
    });

    it("un NotAllowedError de requestSession da el mensaje común de use-sesion-xr", async () => {
        const err = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        instalar(xrFalso(err) as unknown as XRSystem);
        const { result } = renderHook(() => useWebXR(glFalso()));
        await waitFor(() => expect(result.current.vrSupported).toBe(true));
        await act(async () => { await result.current.enter("immersive-vr"); });
        expect(result.current.error).toBe(MENSAJE_DENEGADO);
        expect(result.current.inSession).toBe(false);
    });
});
