import { describe, expect, it } from "vitest";

import { enlaceConversionDeVista } from "../vista-previa";

describe("«Convertir a…» de la vista previa", () => {
    it("lleva la URL y el nombre del archivo a /convertir", () => {
        expect(enlaceConversionDeVista({ url: "https://x/y.pdf", nombre: "y.pdf" }))
            .toBe("/convertir?url=https%3A%2F%2Fx%2Fy.pdf&nombre=y.pdf");
    });

    it("sin nombre lleva solo la URL", () => {
        expect(enlaceConversionDeVista({ url: "https://x/mi nota.md" }))
            .toBe("/convertir?url=https%3A%2F%2Fx%2Fmi+nota.md");
    });

    it("ignora un nombre en blanco", () => {
        expect(enlaceConversionDeVista({ url: "https://x/y.pdf", nombre: "   " }))
            .toBe("/convertir?url=https%3A%2F%2Fx%2Fy.pdf");
    });

    it("sin URL no ofrece conversión (el texto en línea no viaja)", () => {
        expect(enlaceConversionDeVista({})).toBeNull();
        expect(enlaceConversionDeVista({ url: "" })).toBeNull();
        expect(enlaceConversionDeVista({ url: "  ", nombre: "nota.md" })).toBeNull();
        expect(enlaceConversionDeVista({ url: null, nombre: "nota.md" })).toBeNull();
    });
});
