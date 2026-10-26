import { describe, it, expect } from "vitest";
import {
    DESKTOP_TOP_INSET,
    posicionCentradaVentana,
    recolocarVentanaEnPantalla,
} from "@/components/desktop/desktop-store";

describe("posicionCentradaVentana", () => {
    it("centra en un escritorio grande", () => {
        const g = posicionCentradaVentana(1920, 1080, 760, 520);
        expect(g.x).toBeCloseTo((1920 - 760) / 2);
        expect(g.y).toBeCloseTo((1080 - 520) / 2);
    });

    it("respeta el margen mínimo de 16 px en teléfono", () => {
        const g = posicionCentradaVentana(400, 700, 380, 400);
        expect(g.x).toBeGreaterThanOrEqual(16);
        expect(g.x + g.w).toBeLessThanOrEqual(400);
    });

    it("no invaden la banda de la barra superior", () => {
        const g = posicionCentradaVentana(1280, 600, 760, 520);
        expect(g.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });
});

describe("recolocarVentanaEnPantalla", () => {
    it("respeta una posición guardada visible tal cual", () => {
        const r = { x: 200, y: 300, w: 500, h: 300 };
        expect(recolocarVentanaEnPantalla(r, 1280, 800)).toMatchObject({ x: 200, y: 300 });
    });

    it("recoloca una ventana que quedó fuera por la derecha", () => {
        const r = { x: 2000, y: 300, w: 500, h: 300 };
        const g = recolocarVentanaEnPantalla(r, 1280, 800);
        expect(g.x + g.w).toBeLessThanOrEqual(1280);
        expect(g.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });

    it("recoloca una ventana que quedó por debajo del viewport", () => {
        const r = { x: 100, y: 1200, w: 500, h: 300 };
        const g = recolocarVentanaEnPantalla(r, 1280, 700);
        expect(g.y + g.h).toBeLessThanOrEqual(700);
    });
});
