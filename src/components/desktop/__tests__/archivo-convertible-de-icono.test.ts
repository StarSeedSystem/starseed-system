import { describe, expect, it } from "vitest";

import { archivoConvertibleDeIcono } from "../desktop-store";

describe("«Convertir a…» del clic derecho de los iconos", () => {
    it("un archivo con URL absoluta se puede convertir", () => {
        expect(
            archivoConvertibleDeIcono({ kind: "file", name: "Informe.pdf", url: "https://cdn.x/informe.pdf" }),
        ).toEqual({ nombre: "Informe.pdf", url: "https://cdn.x/informe.pdf" });
    });

    it("también una URL de la propia neurona (ruta relativa)", () => {
        expect(
            archivoConvertibleDeIcono({ kind: "file", name: "foto.heic", url: "/archivos/foto.heic" }),
        ).toEqual({ nombre: "foto.heic", url: "/archivos/foto.heic" });
    });

    it("un archivo sin URL no ofrece convertir (p. ej. una nota)", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Ideas" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Ideas", url: "   " })).toBeNull();
    });

    it("no convierte esquemas ajenos (solo http(s) o ruta de la neurona)", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x", url: "javascript:alert(1)" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x", url: "blob:https://x/y" })).toBeNull();
    });

    it("solo archivos: enlaces, carpetas, apps y widgets no pasan por Filee", () => {
        expect(archivoConvertibleDeIcono({ kind: "link", name: "Web", url: "https://x" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "folder", name: "Docs" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "app", name: "Mensajes" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "widget", name: "Reloj" })).toBeNull();
    });

    it("un nombre vacío cae a «archivo» para que el submenú tenga etiqueta", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "  ", url: "https://x/a.png" })).toEqual({
            nombre: "archivo",
            url: "https://x/a.png",
        });
    });
});
