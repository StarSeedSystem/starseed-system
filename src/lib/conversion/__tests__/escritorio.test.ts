import { describe, expect, it } from "vitest";

import { archivoConvertibleDeIcono } from "../escritorio";

describe("archivoConvertibleDeIcono", () => {
    it("un archivo con URL y formato conocido es convertible", () => {
        const a = archivoConvertibleDeIcono({ kind: "file", name: "informe", url: "https://x.test/fotos/informe.md" });
        expect(a).toEqual({ nombre: "informe", url: "https://x.test/fotos/informe.md" });
    });

    it("reconoce el formato por el nombre aunque la URL no traiga extensión", () => {
        const a = archivoConvertibleDeIcono({ kind: "file", name: "cancion.mp3", url: "https://x.test/d/55" });
        expect(a).toEqual({ nombre: "cancion.mp3", url: "https://x.test/d/55" });
    });

    it("un icono de enlace a un PDF se convierte también", () => {
        const a = archivoConvertibleDeIcono({ kind: "link", name: "tesis.pdf", url: "https://x.test/tesis.pdf" });
        expect(a).not.toBeNull();
    });

    it("sin URL no hay nada que convertir", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "nota.md" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "nota.md", url: "   " })).toBeNull();
    });

    it("lo que no es archivo ni enlace se descarta", () => {
        expect(archivoConvertibleDeIcono({ kind: "folder", name: "fotos", url: "https://x.test/a.pdf" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "app", name: "convertir", url: "https://x.test/a.pdf" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "widget", name: "reloj", url: "https://x.test/a.pdf" })).toBeNull();
    });

    it("una URL sin extensión ni nombre con formato no se convierte", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "portal", url: "https://x.test/inicio" })).toBeNull();
    });

    it("una URL rota devuelve null en vez de lanzar", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "a.pdf", url: "https://x.test:puertomalo/" })).toBeNull();
    });
});
