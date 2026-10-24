import { describe, it, expect } from "vitest";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";

// XR1010AR · compat-webxr: el hook conserva su API; las funciones del
// núcleo no piden `camera-access`; `NotAllowedError` usa el mensaje común.

describe("compat-webxr (XR1010AR)", () => {
    it("funcionesAPedir nunca incluye camera-access", () => {
        const cap = {
            plataforma: "desconocida" as const,
            visor: false,
            modos: ["2d"],
            recomendado: "2d" as const,
            entradas: ["voz"],
            funciones: ["local-floor", "hand-tracking", "layers", "hit-test", "camera-access"] as const,
            ofrecerSesion: false,
            motivos: [],
            avisos: [],
        };
        const pedidas = funcionesAPedir(cap, { habitacion: false });
        const todas = [...pedidas.requeridas, ...pedidas.opcionales];
        expect(todas).not.toContain("camera-access" as any);
        expect(todas).toContain("local-floor");
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
