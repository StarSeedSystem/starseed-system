// «Convertir a…» en los iconos del escritorio (Filee): solo un icono de ARCHIVO
// con URL es convertible; si no, `null` y el menú ni lo enseña. Función pura.
import { describe, it, expect } from "vitest";

import { archivoConvertibleDeIcono } from "../desktop-store";

describe("archivoConvertibleDeIcono", () => {
    it("un icono de archivo con URL es convertible: nombre + URL", () => {
        const a = archivoConvertibleDeIcono({ kind: "file", name: "informe.pdf", url: "https://x/informe.pdf" });
        expect(a).toEqual({ nombre: "informe.pdf", url: "https://x/informe.pdf" });
    });

    it("un archivo sin URL no es convertible", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "nota.md" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "nota.md", url: "" })).toBeNull();
    });

    it("ni folders, ni apps, ni widgets, ni enlaces: solo archivos", () => {
        const url = "https://x/archivo.md";
        expect(archivoConvertibleDeIcono({ kind: "folder", name: "Docs", url })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "app", name: "Pizarra", url })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "widget", name: "Reloj", url })).toBeNull();
        // Un enlace es una página web, no un archivo a convertir.
        expect(archivoConvertibleDeIcono({ kind: "link", name: "StarSeed", url })).toBeNull();
    });

    it("con nombre vacío no finge: nombra «archivo» y conserva la URL", () => {
        const a = archivoConvertibleDeIcono({ kind: "file", name: "", url: "https://x/d.png" });
        expect(a).toEqual({ nombre: "archivo", url: "https://x/d.png" });
    });
});
