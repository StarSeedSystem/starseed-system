import { describe, it, expect } from "vitest";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";
import { type EntradaXR, type FuncionXR, type ModoXR } from "@/lib/xr/tipos";
import { inicioDeSesion, type WebXRState, type XRMode } from "@/components/dashboard/apps/immersive/use-webxr";

// XR1010AR · compat-webxr: el hub /xr pide las mismas funciones que el resto del
// sistema (vía `funcionesAPedir`, §2.2), explica sus errores con el mensaje común
// (`mensajeErrorXR`) y conserva la API que ya tenía.

describe("compat-webxr (XR1010AR)", () => {
    it("la forma de retorno del hook conserva su API", () => {
        const forma: WebXRState = {
            vrSupported: null,
            arSupported: null,
            inSession: false,
            mode: null,
            error: null,
            enter: async () => {},
            exit: async () => {},
        };
        expect(Object.keys(forma).sort()).toEqual(
            ["arSupported", "enter", "error", "exit", "inSession", "mode", "vrSupported"],
        );
    });

    it("las funciones que pide vienen del núcleo y nunca incluyen camera-access", () => {
        const cap = {
            plataforma: "desconocida" as const,
            visor: false,
            modos: ["2d"] as ModoXR[],
            recomendado: "2d" as const,
            entradas: ["voz"] as EntradaXR[],
            ofrecerSesion: false,
            motivos: [],
            avisos: [],
        };
        // Un navegador puede ofrecer cualquier cadena: se simulan `camera-access`
        // y un nombre inexistente entre lo que el visor ofrece.
        const ofertas = ["local-floor", "hand-tracking", "layers", "hit-test", "camera-access", "no-existo"] as unknown as FuncionXR[];
        const pedidas = funcionesAPedir({ ...cap, funciones: ofertas });
        const todas = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas).not.toContain("camera-access");
        expect(todas).not.toContain("no-existo");
        expect(pedidas.requeridas).toEqual(["local-floor"]);
        expect(todas).toContain("hand-tracking");
    });

    it("el punto de partida de la sesión del hub: local-floor requerida y el resto opcional", () => {
        for (const modo of ["immersive-vr", "immersive-ar"] as const) {
            const inicio = inicioDeSesion(modo);
            expect(inicio.requiredFeatures).toContain("local-floor");
            expect(inicio.optionalFeatures).toContain("hand-tracking");
            expect(inicio.optionalFeatures).toContain("hit-test");
            const conjuntoCompleto = [...(inicio.requiredFeatures ?? []), ...(inicio.optionalFeatures ?? [])];
            expect(conjuntoCompleto).not.toContain("camera-access");
        }
    });

    it("un NotAllowedError da el mensaje común", () => {
        const err = Object.assign(new Error("denegado"), { name: "NotAllowedError" });
        expect(mensajeErrorXR(err)).toBe("Permiso denegado para entrar en realidad virtual o aumentada.");
    });

    it("un NotSupportedError da el mensaje común", () => {
        const err = Object.assign(new Error("no soportado"), { name: "NotSupportedError" });
        expect(mensajeErrorXR(err)).toBe("Este dispositivo no admite ese modo.");
    });

    it("un InvalidStateError da el mensaje común", () => {
        const err = Object.assign(new Error("ya activa"), { name: "InvalidStateError" });
        expect(mensajeErrorXR(err)).toBe("Ya hay otra sesión inmersiva abierta.");
    });
});
