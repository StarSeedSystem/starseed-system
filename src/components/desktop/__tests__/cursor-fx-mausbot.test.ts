/**
 * Cursor del Mausbot en el OS (MBT1027I): el analizador de la opción persistida, el
 * data URI del diseño activo y la punta (hotspot) del cuerpo. Solo funciones puras:
 * sin red, sin disco y sin montar componentes.
 */
import { describe, it, expect } from "vitest";
import { analizarCursorOption, cursorPreviewUri, puntaDeCursor } from "../cursor-fx";

const PREFIJO_DATA_URI = "data:image/svg+xml;charset=utf-8,";

function svgDe(uri: string | null): string {
    expect(uri).not.toBeNull();
    const texto = uri ?? "";
    expect(texto.startsWith(PREFIJO_DATA_URI)).toBe(true);
    return decodeURIComponent(texto.slice(PREFIJO_DATA_URI.length));
}

describe("analizarCursorOption", () => {
    it("acepta y conserva la opción «mausbot»", () => {
        expect(analizarCursorOption("mausbot")).toBe("mausbot");
    });

    it("conserva los cursores clásicos del OS", () => {
        expect(analizarCursorOption("system")).toBe("system");
        expect(analizarCursorOption("starseed-triangle")).toBe("starseed-triangle");
        expect(analizarCursorOption("orb")).toBe("orb");
    });

    it("conserva los cuerpos de fábrica y los diseños propios del Mausbot", () => {
        expect(analizarCursorOption("mausbot-cursor")).toBe("mausbot-cursor");
        expect(analizarCursorOption("mausbot-blob")).toBe("mausbot-blob");
        expect(analizarCursorOption("mausbot-diseno-mi-diseno")).toBe("mausbot-diseno-mi-diseno");
    });

    it("cae al puntero del sistema ante basura o cuerpos desconocidos", () => {
        for (const valor of [undefined, null, 42, "", "  ", "mausbot-", "mausbot-inexistente", "neon"]) {
            expect(analizarCursorOption(valor)).toBe("system");
        }
    });
});

describe("data URI del cursor del Mausbot", () => {
    it("«mausbot» pinta el diseño activo como SVG pequeño con svgADataUrl", () => {
        const svg = svgDe(cursorPreviewUri("mausbot"));
        expect(svg).toContain("<svg");
        expect(svg).toContain('width="32"');
        expect(svg).toContain('height="32"');
        expect(svg).toContain("<linearGradient");
    });

    it("lleva el cuerpo y el degradado del diseño, sin cara", () => {
        const svg = svgDe(cursorPreviewUri("mausbot"));
        expect(svg).toContain('fill="url(#g)"');
        expect(svg).toContain("#9FE6B5");
        expect(svg).not.toContain("mausbot-ojos");
        expect(svg).not.toContain("mausbot-boca");
    });

    it("«mausbot» coincide con el cuerpo por defecto de fábrica", () => {
        expect(cursorPreviewUri("mausbot")).toBe(cursorPreviewUri("mausbot-cursor"));
    });

    it("cada cuerpo produce un data URI distinto", () => {
        const cursor = cursorPreviewUri("mausbot-cursor");
        const ameba = cursorPreviewUri("mausbot-blob");
        expect(cursor).not.toBe(ameba);
        expect(svgDe(cursor)).not.toBe(svgDe(ameba));
    });

    it("el puntero del sistema no pinta data URI", () => {
        expect(cursorPreviewUri("system")).toBeNull();
    });
});

describe("punta (hotspot) del cursor del Mausbot", () => {
    it("sale del `anchor` del cuerpo y cae dentro del SVG de 32", () => {
        for (const opcion of ["mausbot", "mausbot-cursor", "mausbot-blob", "mausbot-star"] as const) {
            const { x, y } = puntaDeCursor(opcion);
            expect(Number.isInteger(x)).toBe(true);
            expect(Number.isInteger(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(32);
            expect(y).toBeLessThan(32);
        }
    });

    it("el cuerpo «cursor» apunta a su ancla (12, 15)", () => {
        expect(puntaDeCursor("mausbot")).toEqual({ x: 12, y: 15 });
        expect(puntaDeCursor("mausbot-cursor")).toEqual({ x: 12, y: 15 });
    });
});
