import { describe, it, expect } from "vitest";
import { archivoConvertibleDeIcono } from "../desktop-store";

describe("«Convertir a…» de los iconos del escritorio", () => {
    it("acepta un archivo con URL y conserva su nombre", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Informe.pdf", url: "https://x/informe.pdf" }))
            .toEqual({ nombre: "Informe.pdf", url: "https://x/informe.pdf" });
    });

    it("limpia espacios y pone un nombre si el icono no lo trae", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "  ", url: "  https://x/a.png  " }))
            .toEqual({ nombre: "archivo", url: "https://x/a.png" });
    });

    it("no ofrece convertir folders, apps, widgets, enlaces ni iconos sin URL", () => {
        expect(archivoConvertibleDeIcono({ kind: "folder", name: "Carpeta", url: "https://x/a.zip" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "app", name: "Aurora" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Nota.txt" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Vacío.pdf", url: "   " })).toBeNull();
        expect(archivoConvertibleDeIcono(null)).toBeNull();
    });

    it("rechaza esquemas que no se pueden leer y acepta los del propio OS", () => {
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x", url: "javascript:alert(1)" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x", url: "file:///etc/passwd" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x.md", url: "/archivos/x.md" }))
            .toEqual({ nombre: "x.md", url: "/archivos/x.md" });
        expect(archivoConvertibleDeIcono({ kind: "file", name: "x.png", url: "blob:https://x/123" }))
            .toEqual({ nombre: "x.png", url: "blob:https://x/123" });
    });
});
