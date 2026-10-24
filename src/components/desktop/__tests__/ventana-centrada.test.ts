// ════════════════════════════════════════════════════════════════
// Test · Ventanas que abren CENTRADAS (DSN1019C · Decisiones de Alex
// 2026-10-19). Solo lógica pura: geometriaAperturaVentana, sin DOM
// y sin tocar el store (localStorage/Supabase quedan fuera).
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import {
    DESKTOP_TOP_INSET,
    geometriaAperturaVentana,
} from "@/components/desktop/desktop-store";

const VP = { vw: 1280, vh: 800 };

describe("geometriaAperturaVentana · apertura centrada", () => {
    it("una ventana nueva abre centrada horizontalmente en la pantalla", () => {
        const g = geometriaAperturaVentana(VP.vw, VP.vh, {}, null);
        // Ancho por defecto 760 → centro: (1280 - 760) / 2 = 260
        expect(g.w).toBe(760);
        expect(g.x).toBeCloseTo((VP.vw - g.w) / 2, 0);
    });

    it("el centro vertical vive en el área VISIBLE bajo la barra superior (B-1)", () => {
        const g = geometriaAperturaVentana(VP.vw, VP.vh, {}, null);
        expect(g.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
        const centroVisible = DESKTOP_TOP_INSET + (VP.vh - DESKTOP_TOP_INSET - g.h) / 2;
        expect(g.y).toBeCloseTo(centroVisible, 5);
    });

    it("se acota al viewport con pantallas pequeñas sin perder el mínimo", () => {
        const g = geometriaAperturaVentana(320, 480, {}, null);
        expect(g.w).toBeGreaterThanOrEqual(280);
        expect(g.h).toBeGreaterThanOrEqual(200);
        expect(g.x).toBeGreaterThanOrEqual(8);
        expect(g.x + g.w).toBeLessThanOrEqual(320);
        expect(g.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });

    it("respeta EXACTAMENTE la preferencia de tamaño pedida por quien abre", () => {
        const g = geometriaAperturaVentana(VP.vw, VP.vh, { w: 500, h: 400 }, null);
        expect(g.w).toBe(500);
        expect(g.h).toBe(400);
        // Y sigue centrada (composición centrada, §7b)
        expect(g.x).toBeCloseTo((VP.vw - 500) / 2, 0);
    });
});

describe("geometriaAperturaVentana · posición guardada", () => {
    it("posición guardada dentro de la pantalla: se respeta tal cual", () => {
        const guardada = { x: 100, y: 200, w: 760, h: 520 };
        const g = geometriaAperturaVentana(VP.vw, VP.vh, {}, guardada);
        expect(g).toEqual(guardada);
    });

    it("posición guardada que salió de la pantalla: se recoloca dentro", () => {
        const g = geometriaAperturaVentana(VP.vw, VP.vh, {}, { x: -500, y: 2000, w: 760, h: 520 });
        expect(g.x).toBe(0);
        expect(g.y).toBe(VP.vh - 520);
        expect(g.w).toBe(760);
        expect(g.h).toBe(520);
    });

    it("posición guardada bajo la barra superior: sube al área visible (B-1)", () => {
        const g = geometriaAperturaVentana(VP.vw, VP.vh, {}, { x: 40, y: 10, w: 400, h: 300 });
        expect(g.y).toBe(DESKTOP_TOP_INSET);
        expect(g.x).toBe(40);
    });

    it("posición guardada sin coordenadas finitas: abre centrada", () => {
        const g = geometriaAperturaVentana(
            VP.vw,
            VP.vh,
            {},
            { x: Number.NaN, y: Number.POSITIVE_INFINITY, w: 760, h: 520 },
        );
        expect(g.x).toBeCloseTo((VP.vw - 760) / 2, 0);
        expect(g.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });
});
