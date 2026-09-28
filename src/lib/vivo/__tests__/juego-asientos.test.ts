import { describe, expect, test } from "vitest";
import { colorDePersona, etiquetaAsiento, inicialesDe } from "../juegos/asientos";

describe("presentación de asientos", () => {
    test("nombres por juego y respaldo seguro fuera de rango", () => {
        expect(etiquetaAsiento("ajedrez", 0).nombre).toBe("Blancas");
        expect(etiquetaAsiento("ajedrez", 1).nombre).toBe("Negras");
        expect(etiquetaAsiento("tres-en-raya", 1).nombre).toBe("O");
        expect(etiquetaAsiento("conecta-4", 0).nombre).toBe("Rojas");
        expect(etiquetaAsiento("ajedrez", 7).nombre).toBe("Blancas");
        expect(etiquetaAsiento("dibujo", 2).nombre).toBe("Asiento 3");
        expect(etiquetaAsiento("dibujo", 9).color).toBe(etiquetaAsiento("dibujo", 1).color);
        expect(etiquetaAsiento("dibujo", -1).color).toMatch(/^#/);
    });

    test("color estable por persona e iniciales", () => {
        expect(colorDePersona("uid-1")).toBe(colorDePersona("uid-1"));
        expect(colorDePersona("uid-1")).toMatch(/^#[0-9A-F]{6}$/);
        expect(inicialesDe("Ana García López")).toBe("AL");
        expect(inicialesDe("beto")).toBe("B");
        expect(inicialesDe("   ")).toBe("?");
        expect(inicialesDe("Álvaro")).toBe("Á");
    });
});
