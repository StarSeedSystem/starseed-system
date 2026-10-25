/**
 * La detección de fugas: la palabra no puede colarse en un texto visible ni suelta, ni pegada a
 * otra palabra como ocurre al concatenar el autor con el intento («Beto» + «vela»).
 */
import { describe, expect, it } from "vitest";
import { contieneFuga } from "../fuga-palabra";

describe("contieneFuga", () => {
    it("detecta la palabra sola dentro de una frase", () => {
        expect(contieneFuga("La vela está en la mesa", "vela")).toBe(true);
    });

    it("detecta la palabra PEGADA a otra cuando no hay límite de palabra (Beto + vela)", () => {
        expect(contieneFuga("Betovela", "vela")).toBe(true);
        expect(contieneFuga(`Beto${"vela"}`, "vela")).toBe(true);
    });

    it("no depende de acentos ni de mayúsculas (la comparación se normaliza)", () => {
        expect(contieneFuga("Avión de la abuela", "avión")).toBe(true);
        expect(contieneFuga("AVIÓN", "avion")).toBe(true);
        expect(contieneFuga("corazón dibujado", "corazon")).toBe(true);
    });

    it("un texto que no la contiene no es fuga", () => {
        expect(contieneFuga("Los intentos aparecerán aquí.", "vela")).toBe(false);
    });

    it("texto ausente, vacío o palabra vacía: no hay fuga", () => {
        expect(contieneFuga(null, "vela")).toBe(false);
        expect(contieneFuga("", "vela")).toBe(false);
        expect(contieneFuga("  ", "vela")).toBe(false);
        expect(contieneFuga("Betovela", "")).toBe(false);
    });
});
