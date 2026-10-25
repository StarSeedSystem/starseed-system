// Pruebas del paso icono → archivo convertible (Filee en el clic derecho del
// escritorio). Solo funciones puras: sin red, sin disco y sin probar el DOM.
import { describe, expect, it } from "vitest";

import { archivoConvertibleDeIcono, type IconoResumen } from "../desktop-conversion";

describe("archivoConvertibleDeIcono", () => {
    it("devuelve el archivo con su URL para un icono de kind «file»", () => {
        const icono: IconoResumen = { kind: "file", name: "informe.pdf", url: "https://archivos.example.org/informe.pdf" };
        expect(archivoConvertibleDeIcono(icono)).toEqual({
            nombre: "informe.pdf",
            url: "https://archivos.example.org/informe.pdf",
        });
    });

    it("devuelve null para un «file» sin URL (nota o dibujo propio)", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Nota.md" })).toBeNull();
    });

    it.each(["link", "app", "widget", "folder"])("devuelve null para un icono de kind «%s» aunque tenga URL", (kind) => {
        const icono: IconoResumen = { kind, name: "algo", url: "https://archivos.example.org/archivo.md" };
        expect(archivoConvertibleDeIcono(icono)).toBeNull();
    });

    it("no se rinde ante un nombre vacío: el hook pone el suyo", () => {
        const icono: IconoResumen = { kind: "file", name: "", url: "https://archivos.example.org/a/archivo.md" };
        expect(archivoConvertibleDeIcono(icono)).toEqual({ nombre: "", url: "https://archivos.example.org/a/archivo.md" });
    });
});
