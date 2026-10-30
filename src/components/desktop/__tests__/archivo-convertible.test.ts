// CNV1023C-d2b · «Convertir a…» (Filee) en los iconos del escritorio.
// SoloFILEE con URL real es convertible: la conversión va por esa referencia.

import { describe, it, expect } from "vitest";
import { archivoConvertibleDeIcono, type DesktopIcon } from "../desktop-store";

function icono(parche: Partial<DesktopIcon>): DesktopIcon {
    return { id: "i1", kind: "file", name: "informe.pdf", x: 0.1, y: 0.1, size: "md", viewMode: "icon", ...parche };
}

describe("archivoConvertibleDeIcono", () => {
    it("devuelve nombre y URL de un archivo con URL", () => {
        expect(archivoConvertibleDeIcono(icono({ url: "https://nube/informe.pdf" }))).toEqual({
            nombre: "informe.pdf",
            url: "https://nube/informe.pdf",
        });
    });

    it("devuelve null para una nota sin URL (kind file, sin url)", () => {
        expect(archivoConvertibleDeIcono(icono({ fileKind: "note", text: "hola" }))).toBeNull();
    });

    it("devuelve null para apps, widgets, folders y enlaces", () => {
        for (const kind of ["app", "widget", "folder", "link"] as const) {
            expect(archivoConvertibleDeIcono(icono({ kind, url: "https://x/a.pdf" }))).toBeNull();
        }
    });

    it("devuelve null con esquemas que el navegador no puede leer", () => {
        for (const url of ["javascript:alert(1)", "vbscript:x", "file:///etc/passwd"]) {
            expect(archivoConvertibleDeIcono(icono({ url }))).toBeNull();
        }
    });

    it("devuelve null si el icono no existe (menú de un icono ya borrado)", () => {
        expect(archivoConvertibleDeIcono(null)).toBeNull();
        expect(archivoConvertibleDeIcono(undefined)).toBeNull();
    });

    it("usa un nombre de reserva si el icono viene sin nombre", () => {
        expect(archivoConvertibleDeIcono(icono({ name: "", url: "https://x/a.png" }))).toEqual({
            nombre: "archivo",
            url: "https://x/a.png",
        });
    });
});
