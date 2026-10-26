import { describe, expect, it } from "vitest";

import { archivoConvertibleDeIcono } from "../icono-escritorio";

describe("«Convertir a…» de los iconos del escritorio", () => {
    it("un archivo con URL es convertible y conserva su nombre", () => {
        expect(archivoConvertibleDeIcono({
            kind: "file",
            name: "informe.pdf",
            url: "https://x/informe.pdf",
        })).toEqual({ nombre: "informe.pdf", url: "https://x/informe.pdf" });
    });

    it("usa la pista de tipo solo cuando es un formato real", () => {
        expect(archivoConvertibleDeIcono({
            kind: "file",
            name: "Informe",
            url: "https://x/obj/123",
            fileKind: "pdf",
        })).toEqual({ nombre: "Informe", url: "https://x/obj/123", tipoMime: "pdf" });
        expect(archivoConvertibleDeIcono({
            kind: "file",
            name: "Foto",
            url: "https://x/obj/456",
            fileKind: "image",
        })).toEqual({ nombre: "Foto", url: "https://x/obj/456" });
    });

    it("no ofrece convertir folders, apps, widgets, enlaces ni archivos sin URL", () => {
        expect(archivoConvertibleDeIcono({ kind: "folder", name: "Docs", url: "https://x/a.zip" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "app", name: "Mensajes" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "widget", name: "Reloj", url: "https://x/w" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "link", name: "Web", url: "https://x/w" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Sin URL" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file", name: "Vacío", url: "   " })).toBeNull();
        expect(archivoConvertibleDeIcono(null)).toBeNull();
    });

    it("un archivo sin nombre recibe uno genérico", () => {
        expect(archivoConvertibleDeIcono({
            kind: "file",
            url: "https://x/a.docx",
        })).toEqual({ nombre: "archivo", url: "https://x/a.docx" });
    });
});
