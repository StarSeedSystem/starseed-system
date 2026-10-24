import { describe, it, expect } from "vitest";
import { posicionVentanaAbierta, DESKTOP_TOP_INSET } from "@/components/desktop/desktop-store";

// Ventana 760x520 en pantalla 1280x800: centrado exacto de composicion.ts.
const BASE = { vw: 1280, vh: 800, w: 760, h: 520 };

describe("posicionVentanaAbierta", () => {
    it("centra la ventana sin posición guardada (decisión de Alex 2026-10-19)", () => {
        const p = posicionVentanaAbierta(BASE);
        expect(p.x).toBeCloseTo((1280 - 760) / 2);
        expect(p.y).toBeCloseTo((800 - 520) / 2);
    });

    it("en teléfono respeta el margen mínimo de 16 px de composición", () => {
        const p = posicionVentanaAbierta({ vw: 390, vh: 780, w: 340, h: 450 });
        // margen 16 + centro del espacio disponible (390 - 32 = 358): 16 + 9 = 25
        expect(p.x).toBeCloseTo(25);
        expect(p.x).toBeGreaterThanOrEqual(16);
    });

    it("sin espacio vertical suficiente nunca queda bajo la barra superior (B-1)", () => {
        const p = posicionVentanaAbierta({ vw: 1280, vh: 360, w: 760, h: 340 });
        expect(p.y).toBe(DESKTOP_TOP_INSET);
    });

    it("posición guardada dentro de la pantalla: se respeta exacta", () => {
        const p = posicionVentanaAbierta({ ...BASE, guardada: { x: 200, y: 250 } });
        expect(p).toEqual({ x: 200, y: 250 });
    });

    it("posición guardada que descuelga por abajo: se recoloca al viewport", () => {
        const p = posicionVentanaAbierta({ ...BASE, guardada: { x: 100, y: 650 } });
        expect(p.x).toBe(100);
        expect(p.y).toBe(800 - 520);
    });

    it("posición guardada fuera por la derecha: se recoloca, no se pierde", () => {
        const p = posicionVentanaAbierta({ ...BASE, guardada: { x: 5000, y: 140 } });
        expect(p.x).toBe(1280 - 760 - 16);
        expect(p.y).toBe(140);
    });

    it("posición guardada sobre la banda de la barra superior: se recoloca bajo ella", () => {
        const p = posicionVentanaAbierta({ ...BASE, guardada: { x: 100, y: 10 } });
        expect(p.x).toBe(100);
        expect(p.y).toBe(DESKTOP_TOP_INSET);
    });

    it("es pura y estable: dos llamadas iguales dan la misma posición (sin cascada)", () => {
        const a = posicionVentanaAbierta(BASE);
        const b = posicionVentanaAbierta(BASE);
        expect(a).toEqual(b);
    });
});
