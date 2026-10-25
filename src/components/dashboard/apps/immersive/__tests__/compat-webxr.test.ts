// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type * as THREE from "three";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import { type FuncionXR } from "@/lib/xr/tipos";
import { useWebXR } from "@/components/dashboard/apps/immersive/use-webxr";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";

// XR1010AR · compat-webxr: el hook conserva su forma de retorno; las funciones
// pedidas salen del núcleo y nunca incluyen `camera-access`; un
// `NotAllowedError` de `requestSession` da el mensaje común.

describe("compat-webxr (XR1010AR)", () => {
    it("funcionesAPedir aplica la lista blanca del núcleo: nunca camera-access", () => {
        // Metemos `camera-access` a propósito fuera del vocabulario cerrado de
        // `FuncionXR`: `esFuncionXR` no la deja pasar ni de broma (§3 k).
        const funcionesSucias = [
            "local-floor", "hand-tracking", "layers", "hit-test", "camera-access",
        ] as unknown as FuncionXR[];
        const cap: CapacidadesXR = {
            plataforma: "desconocida",
            visor: false,
            modos: ["2d"],
            recomendado: "2d",
            entradas: ["voz"],
            funciones: funcionesSucias,
            ofrecerSesion: false,
            motivos: [],
            avisos: [],
        };
        const pedidas = funcionesAPedir(cap, { habitacion: false });
        const todas = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas.some((f) => f === "camera-access")).toBe(false);
        expect(pedidas.requeridas).toContain("local-floor");
        expect(pedidas.opcionales).toContain("hand-tracking");
    });

    it("mensajeErrorXR convierte NotAllowedError en mensaje común", () => {
        const err = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        const msg = mensajeErrorXR(err);
        expect(msg).toBe("Permiso denegado para entrar en realidad virtual o aumentada.");
    });

    it("mensajeErrorXR convierte NotSupportedError en mensaje común", () => {
        const err = Object.assign(new Error("no soportado"), { name: "NotSupportedError" });
        const msg = mensajeErrorXR(err);
        expect(msg).toBe("Este dispositivo no admite ese modo.");
    });

    it("mensajeErrorXR convierte InvalidStateError en mensaje común", () => {
        const err = Object.assign(new Error("ya activa"), { name: "InvalidStateError" });
        const msg = mensajeErrorXR(err);
        expect(msg).toBe("Ya hay otra sesión inmersiva abierta.");
    });
});

describe("compat-webxr · hook con navigator.xr falso (XR1010AR)", () => {
    type RInfalsificable = { isSessionSupported?(modo: string): Promise<boolean> };

    /** Instala (y desinstala al terminar) un `navigator.xr` falso de jsdom. */
    function ponerXR(falsa: Partial<RInfalsificable>): void {
        Object.defineProperty(window.navigator, "xr", {
            configurable: true,
            value: falsa as unknown,
        });
    }
    function quitarXR(): void {
        Object.defineProperty(window.navigator, "xr", { configurable: true, value: undefined });
    }

    const FORMA_RETORNO = [
        "vrSupported", "arSupported", "inSession", "mode", "error", "enter", "exit",
    ].sort();

    it("conserva su forma de retorno y detecta el soporte por modo", async () => {
        ponerXR({ isSessionSupported: async (modo) => modo === "immersive-vr" });
        const { result } = renderHook(() => useWebXR(null));
        await act(async () => { await Promise.resolve(); });
        quitarXR();
        expect(Object.keys(result.current).sort()).toEqual(FORMA_RETORNO);
        expect(result.current.vrSupported).toBe(true);
        expect(result.current.arSupported).toBe(false);
        expect(result.current.inSession).toBe(false);
        expect(result.current.mode).toBeNull();
        expect(result.current.error).toBeNull();
        expect(typeof result.current.enter).toBe("function");
        expect(typeof result.current.exit).toBe("function");
    });

    it("un NotAllowedError de requestSession da el mensaje común", async () => {
        const fallo = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        ponerXR({
            isSessionSupported: async () => true,
            requestSession: async () => {
                throw fallo;
            },
        });
        const gl = { xr: { enabled: false, setSession: async () => {} } } as unknown as THREE.WebGLRenderer;
        const { result } = renderHook(() => useWebXR(gl));
        await act(async () => { await result.current.enter("immersive-vr"); });
        quitarXR();
        expect(result.current.error).toBe(
            "Permiso denegado para entrar en realidad virtual o aumentada.",
        );
        expect(result.current.inSession).toBe(false);
        expect(result.current.mode).toBeNull();
    });
});
