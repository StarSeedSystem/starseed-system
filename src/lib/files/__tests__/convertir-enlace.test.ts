// ════════════════════════════════════════════════════════════════════════════
// «Convertir a…» (Filee) de la vista previa — pruebas del enlace puro.
// Solo funciones puras: sin red, sin disco, sin componentes renderizados.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";

import type { FileLike } from "@/components/files/file-preview";

import { enlaceConvertirA } from "../convertir-enlace";

const archivo = (sobre: Partial<FileLike>): FileLike => sobre;

describe("«Convertir a…» de la vista previa", () => {
    it("construye el enlace con la URL y el nombre del archivo", () => {
        const enlace = enlaceConvertirA(
            archivo({ url: "https://n/hoja.pdf", name: "hoja.pdf" }),
            "pdf",
        );
        expect(enlace).toBe("/convertir?url=https%3A%2F%2Fn%2Fhoja.pdf&nombre=hoja.pdf");
    });

    it("con espacios en el nombre los codifica bien", () => {
        const enlace = enlaceConvertirA(
            archivo({ url: "https://n/a.jpg", name: "mi foto.jpg" }),
            "image",
        );
        expect(enlace).toContain("&nombre=mi+foto.jpg");
    });

    it("sin nombre lo deja fuera: /convertir lo saca de la URL", () => {
        const enlace = enlaceConvertirA(archivo({ url: "https://n/hoja.pdf" }), "pdf");
        expect(enlace).toBe("/convertir?url=https%3A%2F%2Fn%2Fhoja.pdf");
    });

    it("cualquier formato con URL se puede convertir (Filee son 255)", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/modelo.glb" }), "model3d")).toBeTruthy();
        expect(enlaceConvertirA(archivo({ url: "https://n/sonido.opus" }), "generic")).toBeTruthy();
    });

    it("a un enlace web no le aplica convertir", () => {
        expect(enlaceConvertirA(archivo({ url: "https://n/seccion" }), "link")).toBeNull();
    });

    it("a una app (programa que se abre) tampoco", () => {
        expect(
            enlaceConvertirA(archivo({ url: "https://n/app.js", launchHref: "/app" }), "app"),
        ).toBeNull();
    });

    it("sin URL real (contenido en línea) no hay nada que convertir", () => {
        expect(enlaceConvertirA(archivo({ content: "# nota" }), "markdown")).toBeNull();
    });
});
