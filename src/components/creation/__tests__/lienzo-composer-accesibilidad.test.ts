/**
 * SP092942 (2026-10-22): los botones solo-icono del Lienzo (subir, bajar y
 * quitar bloque) solo llevaban `title`, que no llega a lector de pantalla ni a
 * voz de móvil, y el input de archivos no filtraba por tipo: se podían elegir
 * documentos donde solo cabía una imagen.
 *
 * El arreglo deja el texto accesible y el filtro en funciones puras (se pueden
 * probar sin DOM) y el componente las usa en el botón y en el input.
 */
import { describe, expect, it } from "vitest";

import {
    acceptPorTipo,
    altImagenBloque,
    ariaLabelBloque,
    type AccionBloque,
} from "@/components/creation/lienzo-composer";

describe("lienzo-composer · botones solo-icono", () => {
    it("el nombre accesible dice la acción, el tipo de bloque y la posición", () => {
        expect(ariaLabelBloque("subir", "Imagen", 2)).toBe("Subir bloque de Imagen (posición 2)");
        expect(ariaLabelBloque("bajar", "Texto", 1)).toBe("Bajar bloque de Texto (posición 1)");
        expect(ariaLabelBloque("quitar", "Pizarra", 3)).toBe("Quitar bloque de Pizarra (posición 3)");
    });

    it("cada acción tiene un texto distinto (el lector no oye dos botones iguales)", () => {
        const acciones: AccionBloque[] = ["subir", "bajar", "quitar"];
        const nombres = acciones.map((a) => ariaLabelBloque(a, "Imagen", 1));
        expect(new Set(nombres).size).toBe(acciones.length);
    });

    it("el texto accesible no queda vacío aunque falte la etiqueta del bloque", () => {
        expect(ariaLabelBloque("quitar", "", 1).length).toBeGreaterThan(0);
        expect(ariaLabelBloque("quitar", "Imagen", 1)).toContain("posición 1");
    });
});

describe("lienzo-composer · imagen del bloque", () => {
    it("el texto alternativo nombra el archivo subido", () => {
        expect(altImagenBloque("amanecer.png")).toBe("Imagen adjunta: amanecer.png");
        expect(altImagenBloque("  amanecer.png  ")).toBe("Imagen adjunta: amanecer.png");
    });

    it("sin nombre el texto alternativo sigue describiendo la imagen (no es decorativa)", () => {
        expect(altImagenBloque(undefined)).toBe("Imagen adjunta a la creación");
        expect(altImagenBloque(null)).toBe("Imagen adjunta a la creación");
        expect(altImagenBloque("   ")).toBe("Imagen adjunta a la creación");
        expect(altImagenBloque("")).not.toBe("");
    });
});

describe("lienzo-composer · input de archivos", () => {
    it("un bloque de imagen solo acepta imágenes", () => {
        expect(acceptPorTipo("imagen")).toBe("image/*");
    });

    it("un bloque de archivo acepta cualquier documento", () => {
        expect(acceptPorTipo("archivo")).toBe("*/*");
    });
});
