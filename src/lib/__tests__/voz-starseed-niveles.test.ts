import { describe, expect, it } from "vitest";

import type { Capacidades } from "../aurora/voz-starseed/capacidades";
import { nivelPara, nivelesDisponibles, siguienteNivel } from "../aurora/voz-starseed/niveles";

/** Capacidades base (las más pobres): cada prueba solo toca lo que le importa. */
const base: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

describe("nivelPara", () => {
    it("demonio local + 8 GB de RAM → estudio", () => {
        expect(nivelPara({ ...base, daemonLocal: true, memoriaGB: 8 })).toBe("estudio");
    });

    it("demonio local + 16 GB de RAM → estudio", () => {
        expect(nivelPara({ ...base, daemonLocal: true, memoriaGB: 16 })).toBe("estudio");
    });

    it("demonio local con menos de 8 GB de RAM → alta", () => {
        expect(nivelPara({ ...base, daemonLocal: true, memoriaGB: 4 })).toBe("alta");
    });

    it("demonio local sin dato de memoria → alta", () => {
        expect(nivelPara({ ...base, daemonLocal: true })).toBe("alta");
    });

    it("escritorio con WebGPU y sin demonio → ligera", () => {
        expect(nivelPara({ ...base, webgpu: true })).toBe("ligera");
    });

    it("escritorio con WASM SIMD y sin WebGPU → ligera", () => {
        expect(nivelPara({ ...base, wasmSimd: true })).toBe("ligera");
    });

    it("móvil con WebGPU → minima (el móvil manda)", () => {
        expect(nivelPara({ ...base, movil: true, webgpu: true })).toBe("minima");
    });

    it("equipo sin nada → minima", () => {
        expect(nivelPara(base)).toBe("minima");
    });
});

describe("nivelesDisponibles", () => {
    it("siempre incluye «minima»", () => {
        const combinaciones: Capacidades[] = [
            { ...base, daemonLocal: true, memoriaGB: 8 },
            { ...base, daemonLocal: true },
            { ...base, webgpu: true },
            { ...base, wasmSimd: true },
            { ...base, movil: true, webgpu: true },
            base,
        ];
        for (const c of combinaciones) {
            expect(nivelesDisponibles(c)).toContain("minima");
        }
    });

    it("con estudio disponible ofrece los cuatro niveles", () => {
        expect(nivelesDisponibles({ ...base, daemonLocal: true, memoriaGB: 8 })).toEqual([
            "estudio",
            "alta",
            "ligera",
            "minima",
        ]);
    });

    it("con alta disponible omite estudio", () => {
        expect(nivelesDisponibles({ ...base, daemonLocal: true })).toEqual(["alta", "ligera", "minima"]);
    });

    it("con ligera disponible omite estudio y alta", () => {
        expect(nivelesDisponibles({ ...base, wasmSimd: true })).toEqual(["ligera", "minima"]);
    });

    it("sin nada ofrece solo «minima»", () => {
        expect(nivelesDisponibles(base)).toEqual(["minima"]);
    });
});

describe("siguienteNivel", () => {
    it("recorre la cadena completa y acaba en null", () => {
        expect(siguienteNivel("estudio")).toBe("alta");
        expect(siguienteNivel("alta")).toBe("ligera");
        expect(siguienteNivel("ligera")).toBe("minima");
        expect(siguienteNivel("minima")).toBeNull();
    });
});
