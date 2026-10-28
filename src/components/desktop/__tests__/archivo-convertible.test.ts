// Convertir a… (Filee) desde el escritorio · tarea CNV1023C.
// `archivoConvertibleDeIcono` decide qué iconos del escritorio son convertibles:
// solo archivos con URL real (la conversión va por esa referencia). Pura.

import { describe, it, expect } from "vitest";
import { archivoConvertibleDeIcono } from "../desktop-store";

describe("archivoConvertibleDeIcono · «Convertir a…» en el escritorio", () => {
    it("devuelve el archivo con su nombre y URL para un icono de archivo con URL", () => {
        const icono = { kind: "file" as const, url: "https://ejemplo.org/doc.pdf", name: "Informe" };
        expect(archivoConvertibleDeIcono(icono)).toEqual({
            nombre: "Informe",
            url: "https://ejemplo.org/doc.pdf",
        });
    });

    it("devuelve null para notas y archivos sin URL (no hay por dónde convertir)", () => {
        expect(archivoConvertibleDeIcono({ kind: "file" as const, name: "Nota" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "file" as const, url: "", name: "Vacío" })).toBeNull();
    });

    it("no convierte apps, widgets, folders ni enlaces web", () => {
        expect(archivoConvertibleDeIcono({ kind: "app" as const, url: "https://x", name: "App" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "widget" as const, url: "https://x", name: "Widget" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "folder" as const, url: "https://x", name: "Folder" })).toBeNull();
        expect(archivoConvertibleDeIcono({ kind: "link" as const, url: "https://x", name: "Web" })).toBeNull();
    });

    it("usa el nombre por defecto si el icono lo trae vacío", () => {
        const icono = { kind: "file" as const, url: "https://ejemplo.org/a.md", name: "" };
        expect(archivoConvertibleDeIcono(icono)).toEqual({ nombre: "archivo", url: "https://ejemplo.org/a.md" });
    });
});
