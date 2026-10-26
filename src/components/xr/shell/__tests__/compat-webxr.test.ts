import { describe, it, expect } from "vitest";
import {
    useWebXR,
    peticionSesionXR,
    type WebXRState,
    type XRMode,
} from "@/components/dashboard/apps/immersive/use-webxr";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { FUNCIONES_XR } from "@/lib/xr/tipos";

// XR1010AR · compat-webxr: el hook del hub `/xr` conserva su forma de retorno; las funciones que
// pide salen del núcleo XR (`funcionesAPedir`, XR1010D) y nunca incluyen `camera-access` (§3 k);
// los errores de `requestSession` usan el mismo `mensajeErrorXR` que el resto del sistema.

describe("compat-webxr (XR1010AR)", () => {
    it("el hook conserva su forma de retorno (WebXRState)", () => {
        const forma: WebXRState = {
            vrSupported: null,
            arSupported: null,
            inSession: false,
            mode: null,
            error: null,
            enter: async () => {},
            exit: async () => {},
        };
        expect(Object.keys(forma).sort()).toEqual([
            "arSupported",
            "enter",
            "error",
            "exit",
            "inSession",
            "mode",
            "vrSupported",
        ]);
        expect(typeof useWebXR).toBe("function");
        const modo: XRMode = "immersive-vr";
        forma.mode = modo;
        expect(forma.mode).toBe("immersive-vr");
    });

    it("las funciones pedidas son las del núcleo, en ambos modos", () => {
        for (const modo of ["immersive-vr", "immersive-ar"] as const) {
            const pedidas = peticionSesionXR(modo).optionalFeatures ?? [];
            for (const funcion of ["local-floor", "bounded-floor", "hand-tracking", "layers", "hit-test"]) {
                expect(pedidas).toContain(funcion);
            }
        }
    });

    it("todo lo pedido habla el vocabulario cerrado del núcleo (sin camera-access)", () => {
        for (const modo of ["immersive-vr", "immersive-ar"] as const) {
            const pedidas = peticionSesionXR(modo).optionalFeatures ?? [];
            expect(pedidas.length).toBeGreaterThan(0);
            expect(pedidas.every((f) => (FUNCIONES_XR as readonly string[]).includes(f))).toBe(true);
            expect(pedidas).not.toContain("camera-access");
        }
    });

    it("un NotAllowedError da el mensaje común", () => {
        const err = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        expect(mensajeErrorXR(err)).toBe("Permiso denegado para entrar en realidad virtual o aumentada.");
    });

    it("los otros errores del catálogo comparten el mensaje común", () => {
        expect(mensajeErrorXR(Object.assign(new Error("no"), { name: "NotSupportedError" }))).toBe(
            "Este dispositivo no admite ese modo.",
        );
        expect(mensajeErrorXR(Object.assign(new Error("ya"), { name: "InvalidStateError" }))).toBe(
            "Ya hay otra sesión inmersiva abierta.",
        );
        expect(mensajeErrorXR(Object.assign(new Error("seguro"), { name: "SecurityError" }))).toBe(
            "El navegador bloqueó la entrada: hace falta https y tocar el botón.",
        );
    });
});
