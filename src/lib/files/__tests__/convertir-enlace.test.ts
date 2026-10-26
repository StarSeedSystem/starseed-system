// ════════════════════════════════════════════════════════════════════════════
// «Convertir a…» (Filee) de la vista previa — pruebas del enlace puro.
// Solo funciones puras: sin red, sin disco y sin renderizar componentes.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";

import { enlaceConvertirA, type ArchivoPrevisualizado } from "../convertir-enlace";

const archivo = (sobre: Partial<ArchivoPrevisualizado>): ArchivoPrevisualizado => sobre;

describe("«Convertir a…» de la vista previa", () => {
    it("lleva la URL y el nombre del archivo a /convertir", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/hoja.pdf", name: "hoja.pdf" }), "pdf")).toBe(
            "/convertir?url=https%3A%2F%2Fn%2Fhoja.pdf&nombre=hoja.pdf",
        );
    });

    it("codifica los espacios del nombre", () => {
        const enlace = enlaceConvertirA(archivo({ url: "https://n/a.jpg", name: "mi foto.jpg" }), "image");
        expect(enlace).toContain("&nombre=mi+foto.jpg");
    });

    it("sin nombre lo deja fuera: la página lo saca de la URL", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/hoja.pdf" }), "pdf")).toBe(
            "/convertir?url=https%3A%2F%2Fn%2Fhoja.pdf",
        );
    });

    it("cualquier archivo con URL se puede convertir (Filee son 255 formatos)", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/modelo.glb" }), "model3d")).toContain("url=");
        expect(enlaceConvertirA(archivo({ url: "https://n/informe.docx" }), "generic")).toContain("url=");
        expect(enlaceConvertirA(archivo({ url: "https://n/nota.md" }), "markdown")).toContain("url=");
        expect(enlaceConvertirA(archivo({ url: "https://n/canción.flac", name: "canción.flac" }), "audio")).toContain("url=");
    });

    it("un enlace web o una app no se convierten", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/seccion" }), "link")).toBeNull();
        expect(enlaceConvertirA(archivo({ url: "https://n/app.js", name: "app.js" }), "app")).toBeNull();
    });

    it("sin URL real (contenido en línea) no hay nada que convertir", () => {
        expect(enlaceConvertirA(archivo({ name: "nota.md", url: null }), "markdown")).toBeNull();
        expect(enlaceConvertirA(archivo({ name: "suelto" }), "generic")).toBeNull();
    });

    it("un URL vacío no produce un enlace roto", () => {
        expect(enlaceConvertirA(archivo({ url: "" }), "pdf")).toBeNull();
    });
});
