// Tarea CNV1023C-d2b (parte 2 de 2) · «Convertir a…» (Filee) en el clic
// derecho de los iconos del escritorio. Pruebas de la función pura que decide
// si un icono del escritorio pinta el submenú de conversión; el cableado del
// menú (desktop-icon-menu.tsx) es la otra parte de la misma cadena.

import { describe, it, expect } from "vitest";
import { archivoConvertibleDeIcono } from "../desktop-store";
import type { DesktopIcon } from "../desktop-store";

function icono(extra: Partial<DesktopIcon> = {}): DesktopIcon {
    return {
        id: "ic1",
        kind: "file",
        name: "informe.pdf",
        x: 0.05,
        y: 0.05,
        size: "md",
        viewMode: "icon",
        ...extra,
    };
}

describe("archivoConvertibleDeIcono", () => {
    it("acepta un archivo con URL y devuelve su nombre y su URL", () => {
        const r = archivoConvertibleDeIcono(icono({ url: "/biblioteca/salida/informe.pdf" }));
        expect(r).not.toBeNull();
        expect(r?.nombre).toBe("informe.pdf");
        expect(r?.url).toBe("/biblioteca/salida/informe.pdf");
    });

    it("rechaza lo que no es un archivo: apps, widgets, folders y enlaces web", () => {
        expect(archivoConvertibleDeIcono(icono({ kind: "app", refId: "muestra" }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ kind: "widget", refId: "reloj" }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ kind: "folder", children: [] }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ kind: "link", url: "https://starseed-os.vercel.app" }))).toBeNull();
    });

    it("rechaza un archivo sin URL (las notas rápidas viven en el texto del icono)", () => {
        expect(archivoConvertibleDeIcono(icono({ fileKind: "note", text: "apunte", url: undefined }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ url: "   " }))).toBeNull();
    });

    it("rechaza URLs que el navegador no debe convertir", () => {
        expect(archivoConvertibleDeIcono(icono({ url: "javascript:alert(1)" }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ url: "vbscript:cosa" }))).toBeNull();
        expect(archivoConvertibleDeIcono(icono({ url: "file:///etc/hosts" }))).toBeNull();
    });

    it("recorta los espacios del nombre y da uno por defecto si viene vacío", () => {
        const r = archivoConvertibleDeIcono(icono({ name: "  canal.mp4  ", url: "https://nube.astro/canal.mp4" }));
        expect(r?.nombre).toBe("canal.mp4");
        const sinNombre = archivoConvertibleDeIcono(icono({ name: "", url: "/biblioteca/a.png" }));
        expect(sinNombre?.nombre).toBe("archivo");
    });

    it("acepta null e undefined (menú abierto sin icono) sin lanzar", () => {
        expect(archivoConvertibleDeIcono(null)).toBeNull();
        expect(archivoConvertibleDeIcono(undefined)).toBeNull();
    });
});
