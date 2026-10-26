// Geometría de ventanas del escritorio (DSN1019C): apertura centrada y
// reaparición de ventanas que quedaron fuera de la pantalla. Solo funciones
// puras de desktop-store.ts (entrada → salida, sin red ni disco).
import { describe, it, expect } from "vitest";
import {
    DESKTOP_TOP_INSET,
    rectVentanaCentrada,
    ajusteEnPantalla,
} from "../desktop-store";

describe("rectVentanaCentrada (ventana nueva sin posición guardada)", () => {
    it("centra la ventana nueva en la pantalla (escritorio)", () => {
        const r = rectVentanaCentrada(1280, 800);
        expect(r).toEqual({ x: (1280 - 760) / 2, y: (800 - 520) / 2, w: 760, h: 520 });
        expect(r.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });

    it("respeta el tamaño pedido y lo acota al viewport", () => {
        // 980×660: caben tal cual (la altura se recorta por el aire de 150 px).
        const r1 = rectVentanaCentrada(1280, 800, 980, 660);
        expect(r1.w).toBe(980);
        expect(r1.h).toBe(650);
        expect(r1.x).toBe((1280 - 980) / 2);
        // Un ancho enorme se clampa al máximo 1186 del sistema de composición.
        const r2 = rectVentanaCentrada(1600, 900, 3000);
        expect(r2.w).toBe(1186);
        expect(r2.x).toBe((1600 - 1186) / 2);
    });

    it("nunca invade la banda de la barra superior (B-1)", () => {
        const r = rectVentanaCentrada(1280, 300, undefined, 220);
        expect(r.y).toBe(DESKTOP_TOP_INSET);
    });

    it("en teléfono respeta el margen mínimo de 16 px", () => {
        const r = rectVentanaCentrada(390, 800);
        expect(r.w).toBe(342); // 390 − 48 (cap de ancho del escritorio)
        expect(r.x).toBe(24); // 16 de margen + 8 px de centrado
        expect(r.y).toBe((800 - 520) / 2);
    });
});

describe("ajusteEnPantalla (posición guardada)", () => {
    it("respeta la posición si la ventana está dentro de la pantalla", () => {
        expect(ajusteEnPantalla({ x: 200, y: 200, w: 400, h: 300 }, 1280, 800)).toBeUndefined();
    });

    it("respeta la posición con un trozo visible suficiente", () => {
        // 120 px a la vista: es una posición arrastrada a propósito, no un error.
        expect(ajusteEnPantalla({ x: 1160, y: 100, w: 400, h: 300 }, 1280, 800)).toBeUndefined();
    });

    it("trae de vuelta una ventana que quedó casi toda fuera por la derecha", () => {
        const a = ajusteEnPantalla({ x: 1230, y: 100, w: 760, h: 520 }, 1280, 800);
        expect(a?.x).toBe(1280 - 760 - 8);
        expect(a?.y).toBe(100);
    });

    it("trae de vuelta una ventana que quedó entera bajo la pantalla", () => {
        const a = ajusteEnPantalla({ x: 100, y: 900, w: 400, h: 300 }, 1280, 800);
        expect(a?.y).toBe(800 - 300 - 120);
        expect(a?.x).toBe(100);
    });

    it("trae de vuelta una ventana que quedó fuera por la izquierda", () => {
        const a = ajusteEnPantalla({ x: -600, y: 100, w: 400, h: 300 }, 1280, 800);
        expect(a?.x).toBe(8);
    });

    it("no invade la banda de la barra superior al reaparecer (B-1)", () => {
        const a = ajusteEnPantalla({ x: -600, y: 5, w: 400, h: 300 }, 1280, 800);
        expect(a?.y).toBe(DESKTOP_TOP_INSET);
    });
});
