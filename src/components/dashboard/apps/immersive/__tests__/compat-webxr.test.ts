import { describe, it, expect } from "vitest";
import type { FuncionXR } from "@/lib/xr/tipos";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import { funcionesAPedir } from "@/components/xr/shell/aplicar-perfil";
import { mensajeErrorXR } from "@/components/vivo/espacial/use-sesion-xr";

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
