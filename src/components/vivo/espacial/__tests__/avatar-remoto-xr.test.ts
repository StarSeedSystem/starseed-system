/**
 * Ayudas puras del conector de avatares por nivel (XR1010Z): nivel por eco y rango por cercanía
 * (§3 h). Sin red ni canvas: `vi.mock` no hace falta (nada de three se ejecuta aquí).
 */
import { describe, it, expect } from "vitest";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";
import { nivelDeEscena, rangoCercania } from "../avatar-remoto-xr";

function meta(clave: string, desde: number): MetaAvatar {
    return { clave, uid: null, nombre: clave, color: "#7C5CFF", modo: "3d", editor: false, desde };
}

describe("nivelDeEscena", () => {
    it("eco (equipo modesto) → mínima: orbe + manos", () => {
        expect(nivelDeEscena(true)).toBe("minima");
    });
    it("sin eco → media: VRM ligero", () => {
        expect(nivelDeEscena(false)).toBe("media");
    });
});

describe("rangoCercania", () => {
    const pos = (c: string): [number, number, number] | null => (c === "sinnada" ? null : c === "cerca" ? [0, 0, 0] : [9, 9, 9]);
    const otros = [meta("cerca", 3), meta("sinnada", 1), meta("lejos", 2)];

    it("el más cercano gana el rango 0; sin pose, el orden de llegada", () => {
        const r = rangoCercania({ pos: [0, 0, 0] }, otros, (a) => pos(a.clave));
        expect(r.get("cerca")).toBe(0);
        // la persona sin pose cae delante por su `desde` (1), el lejano detrás (243)
        expect(r.get("sinnada")).toBe(1);
        expect(r.get("lejos")).toBe(2);
    });
    it("sin cámara: orden de llegada (desde)", () => {
        const r = rangoCercania(null, otros, (a) => pos(a.clave));
        expect(r.get("sinnada")).toBe(0);
        expect(r.get("lejos")).toBe(1);
        expect(r.get("cerca")).toBe(2);
    });
    it("persona nueva sin cámara nueva: la que acabó de entrar manda en el cupo", () => {
        const r = rangoCercania({ pos: [0, 0, 0] }, otros, () => null);
        // todas sin pose: queda el orden de llegada → para el cupo de VRM nadie gana por cercanía
        expect(r.get("cerca")).toBe(2);
    });
});
