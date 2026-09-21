import { describe, it, expect } from "vitest";
import {
    soporteSupertonic,
    nivelParaVoz,
    crearNivelSuptonicoDefecto,
    IDIOMAS_SUPERTONIC,
} from "@/lib/aurora/voz-starseed/supertonic";

describe("Motor Voz StarSeed · Nivel Suptónico (Supertonic)", () => {
    it("soporteSupertonic no depende del daemon ni pide GPU", () => {
        // Con WASM SIMD, sin daemon ni GPU
        const conWasm = soporteSupertonic({ wasmSimd: true, daemonLocal: false, webgpu: false });
        expect(conWasm.disponible).toBe(true);
        expect(conWasm.motivo).toBeUndefined();

        // Con runtime nativo voz-supertonic, sin daemon ni GPU
        const conNativo = soporteSupertonic({ runtimeNativo: true, daemonLocal: false, webgpu: false });
        expect(conNativo.disponible).toBe(true);
        expect(conNativo.motivo).toBeUndefined();

        // Sin runtime ni WASM SIMD
        const sinSoporte = soporteSupertonic({ wasmSimd: false, runtimeNativo: false, daemonLocal: true });
        expect(sinSoporte.disponible).toBe(false);
        expect(sinSoporte.motivo).toContain("Requiere WebAssembly SIMD");
    });

    it("nivelParaVoz prioriza suptonica cuando hay runtime", () => {
        const nivelWasm = nivelParaVoz({ supertonic: true, mobile: false, plataforma: "web" });
        expect(nivelWasm).toBe("suptonica");

        const nivelNativo = nivelParaVoz({ supertonic: true, mobile: true });
        expect(nivelNativo).toBe("suptonica");
    });

    it("sin runtime da nube en móvil y 158-local en escritorio con daemon", () => {
        // Móvil sin supertonic -> nube
        const enMovil = nivelParaVoz({ supertonic: false, mobile: true, daemonLocal: true });
        expect(enMovil).toBe("nube");

        const enPlataformaMovil = nivelParaVoz({ supertonic: false, plataforma: "movil" });
        expect(enPlataformaMovil).toBe("nube");

        // Escritorio con daemon -> 158-local
        const enEscritorioConDaemon = nivelParaVoz({
            supertonic: false,
            mobile: false,
            plataforma: "escritorio",
            daemonLocal: true,
        });
        expect(enEscritorioConDaemon).toBe("158-local");

        // Escritorio sin daemon -> nube
        const enEscritorioSinDaemon = nivelParaVoz({
            supertonic: false,
            mobile: false,
            plataforma: "escritorio",
            daemonLocal: false,
        });
        expect(enEscritorioSinDaemon).toBe("nube");

        // Casos límite
        expect(nivelParaVoz({ supertonic: false, plataforma: "tronal" })).toBe("tronal");
        expect(nivelParaVoz()).toBe("tronal");
    });

    it("crearNivelSuptonicoDefecto y catálogo de 31 idiomas", () => {
        const nivel = crearNivelSuptonicoDefecto("onnx-cpu");
        expect(nivel.vivo).toBe(true);
        expect(nivel.runtime).toBe("onnx-cpu");
        expect(nivel.modelosCargados).toContain("supertonic-es-v1");
        expect(nivel.idiomas.length).toBe(31);
        expect(IDIOMAS_SUPERTONIC).toContain("es");
        expect(IDIOMAS_SUPERTONIC).toContain("en");
    });
});
