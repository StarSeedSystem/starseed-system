import { describe, expect, it } from "vitest";

import { archivoDeIcono, type DesktopIcon, type DesktopIconKind } from "../desktop-store";

function icono(patch: Partial<DesktopIcon> = {}): DesktopIcon {
    return {
        id: "i-1",
        kind: "file",
        name: "Informe.pdf",
        url: "https://x/informe.pdf",
        x: 0.1,
        y: 0.2,
        size: "md",
        viewMode: "icon",
        ...patch,
    };
}

describe("archivoDeIcono · «Convertir a…» del escritorio", () => {
    it("devuelve nombre y URL de un icono de archivo", () => {
        expect(archivoDeIcono(icono())).toEqual({
            nombre: "Informe.pdf",
            url: "https://x/informe.pdf",
        });
    });

    it("limpia los espacios de la URL", () => {
        expect(archivoDeIcono(icono({ url: "  https://x/a.png  " }))?.url).toBe("https://x/a.png");
    });

    it("sin nombre usa «archivo»", () => {
        expect(archivoDeIcono(icono({ name: "" }))?.nombre).toBe("archivo");
    });

    it("sin URL no hay nada que convertir", () => {
        expect(archivoDeIcono(icono({ url: undefined }))).toBeNull();
        expect(archivoDeIcono(icono({ url: "   " }))).toBeNull();
    });

    it.each(["app", "folder", "widget", "link"] as DesktopIconKind[])(
        "un icono de tipo %s no se convierte",
        (kind) => {
            expect(archivoDeIcono(icono({ kind }))).toBeNull();
        },
    );
});
