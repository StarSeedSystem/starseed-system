// Pruebas de `resolverPosicionVentana` (DSN1019C · ventanas centradas).
// Función pura: entrada → salida, sin red ni disco ni procesos.
import { describe, it, expect } from "vitest";
import { DESKTOP_TOP_INSET, resolverPosicionVentana } from "../desktop-store";

const vw = 1280;
const vh = 800;

describe("resolverPosicionVentana · sin posición guardada", () => {
    it("centra la ventana en ambos ejes en escritorio", () => {
        const pos = resolverPosicionVentana(vw, vh, 760, 520);
        expect(pos.x).toBe((vw - 760) / 2);
        expect(pos.y).toBe((vh - 520) / 2);
        expect(pos.w).toBe(760);
        expect(pos.h).toBe(520);
    });

    it("respeta el ancho pedido y nunca baja de la banda de la barra superior", () => {
        // Alto que empujaría el centro por encima de la barra (y < inset).
        const pos = resolverPosicionVentana(400, 220, 360, 200);
        expect(pos.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
        // En un viewport pequeño la ventana se acota al máx. de composición.
        expect(pos.w).toBeLessThanOrEqual(1186);
        expect(pos.w).toBeLessThanOrEqual(400);
        expect(pos.h).toBeLessThanOrEqual(220);
        expect(pos.x).toBeGreaterThanOrEqual(8);
    });

    it("acota ventanas muy grandes al ancho máximo de composición", () => {
        const pos = resolverPosicionVentana(2000, 1200, 5000, 900);
        expect(pos.w).toBeLessThanOrEqual(1186);
        // Y sigue centrada horizontalmente con el ancho resultante.
        expect(pos.x).toBe((2000 - pos.w) / 2);
    });
});

describe("resolverPosicionVentana · con posición guardada", () => {
    it("respeta tal cual una posición visible dentro de la pantalla", () => {
        const guardada = { x: 120, y: 200, w: 500, h: 400 };
        const pos = resolverPosicionVentana(vw, vh, 500, 400, guardada);
        expect(pos).toEqual(guardada);
    });

    it("recoloca dentro la ventana que quedó fuera POR LA DERECHA", () => {
        const guardada = { x: 1400, y: 300, w: 400, h: 300 };
        const pos = resolverPosicionVentana(vw, vh, 400, 300, guardada);
        expect(pos.x).toBeLessThanOrEqual(vw - 400 - 16);
        expect(pos.y).toBe(guardada.y);
        expect(pos.w).toBe(guardada.w);
        expect(pos.h).toBe(guardada.h);
    });

    it("recoloca dentro la ventana que quedó fuera POR ABAJO", () => {
        const guardada = { x: 100, y: 1100, w: 300, h: 400 };
        const pos = resolverPosicionVentana(vw, vh, 300, 400, guardada);
        expect(pos.y).toBeLessThanOrEqual(vh - 400 - 24);
        expect(pos.x).toBe(guardada.x);
    });

    it("recoloca dentro la ventana que quedó fuera POR LA IZQUIERDA", () => {
        const guardada = { x: -200, y: 300, w: 300, h: 200 };
        const pos = resolverPosicionVentana(vw, vh, 300, 200, guardada);
        expect(pos.x).toBeGreaterThanOrEqual(8);
        expect(pos.y).toBe(guardada.y);
    });

    it("una ventana que quedó SOBRE la barra superior se empuja por debajo del inset", () => {
        const guardada = { x: 100, y: 3, w: 300, h: 200 };
        const pos = resolverPosicionVentana(vw, vh, 300, 200, guardada);
        expect(pos.y).toBe(DESKTOP_TOP_INSET);
        expect(pos.x).toBe(guardada.x);
    });

    it("ignora una posición guardada degenerada (tamaño 0) y centra", () => {
        const pos = resolverPosicionVentana(vw, vh, 760, 520, { x: 10, y: 10, w: 0, h: 0 });
        expect(pos.x).toBe((vw - 760) / 2);
        expect(pos.y).toBe((vh - 520) / 2);
    });
});
