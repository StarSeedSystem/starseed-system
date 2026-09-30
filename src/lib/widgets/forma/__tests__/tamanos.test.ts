import { describe, expect, it } from "vitest";
import { alMenos, claseDesdeGrid, claseDesdePx, claseDispositivo } from "../tamanos";

describe("claseDesdePx", () => {
    it("por el lado menor", () => {
        expect(claseDesdePx(100, 100)).toBe("micro");
        expect(claseDesdePx(110, 110)).toBe("s");
        expect(claseDesdePx(179, 200)).toBe("s");
        expect(claseDesdePx(180, 200)).toBe("m");
        expect(claseDesdePx(300, 300)).toBe("l");
        expect(claseDesdePx(500, 480)).toBe("xl");
    });
    it("panorámico y torre por la relación", () => {
        expect(claseDesdePx(900, 300)).toBe("panoramico");
        expect(claseDesdePx(150, 400)).toBe("torre");
    });
    it("una sola fila es micro por ancha que sea (móvil, escritorio y TV)", () => {
        expect(claseDesdePx(178, 46)).toBe("micro");
        expect(claseDesdePx(1140, 65)).toBe("micro");
        expect(claseDesdePx(147, 77)).toBe("micro");
        expect(claseDesdePx(60, 300)).toBe("micro");
        expect(claseDesdePx(400, 90)).toBe("panoramico");
    });
    it("tamaño cero es micro", () => {
        expect(claseDesdePx(0, 0)).toBe("micro");
    });
    it("grid del dashboard", () => {
        expect(claseDesdeGrid(3, 3)).toBe("m");
        expect(claseDesdeGrid(12, 6)).toBe("panoramico");
    });
});

describe("claseDispositivo", () => {
    const base = { ancho: 1440, alto: 900, punteroGrueso: false, enXR: false };
    it("xr manda sobre todo", () => expect(claseDispositivo({ ...base, ancho: 400, enXR: true })).toBe("xr"));
    it("móvil, tablet, escritorio y tv", () => {
        expect(claseDispositivo({ ...base, ancho: 390 })).toBe("movil");
        expect(claseDispositivo({ ...base, ancho: 820 })).toBe("tablet");
        expect(claseDispositivo({ ...base, ancho: 1180, punteroGrueso: true })).toBe("tablet");
        expect(claseDispositivo(base)).toBe("escritorio");
        expect(claseDispositivo({ ...base, ancho: 1920, punteroGrueso: true })).toBe("tv");
    });
    it("alMenos", () => {
        expect(alMenos("l", "m")).toBe(true);
        expect(alMenos("s", "m")).toBe(false);
    });
});
