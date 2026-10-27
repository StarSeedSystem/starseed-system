import { describe, it, expect } from "vitest";

import { iconoConvertible } from "../desktop-convertir";

function icono(parcial: Partial<Parameters<typeof iconoConvertible>[0]>): Parameters<typeof iconoConvertible>[0] {
    return {
        id: "i1",
        kind: "file",
        name: "informe",
        x: 0,
        y: 0,
        size: "md",
        viewMode: "icon",
        ...parcial,
    };
}

describe("«Convertir a…» en los iconos del escritorio", () => {
    it("un archivo con URL es convertible, con su nombre", () => {
        expect(iconoConvertible(icono({ kind: "file", name: "informe.pdf", url: "https://x/f/informe.pdf" }))).toEqual({
            nombre: "informe.pdf",
            url: "https://x/f/informe.pdf",
        });
    });

    it("un archivo sin URL no se puede convertir", () => {
        expect(iconoConvertible(icono({ kind: "file", url: undefined }))).toBeNull();
    });

    it("folders, apps, widgets, enlaces y notas no se convierten", () => {
        expect(iconoConvertible(icono({ kind: "folder" }))).toBeNull();
        expect(iconoConvertible(icono({ kind: "app" }))).toBeNull();
        expect(iconoConvertible(icono({ kind: "widget" }))).toBeNull();
        expect(iconoConvertible(icono({ kind: "link", url: "https://x" }))).toBeNull();
    });
});
