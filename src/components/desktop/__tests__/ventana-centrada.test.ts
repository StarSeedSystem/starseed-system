import { describe, it, expect } from "vitest";
import {
    DESKTOP_TOP_INSET,
    rectVentanaCentrada,
    recolocarVentanaEnPantalla,
} from "@/components/desktop/desktop-store";

describe("rectVentanaCentrada", () => {
    it("centra una ventana nueva en un escritorio grande", () => {
        const rect = rectVentanaCentrada({ ancho: 1920, alto: 1080 }, { w: 760, h: 520 });
        expect(rect).toEqual({ x: 580, y: 280, w: 760, h: 520 });
    });

    it("usa el tamaño por defecto cuando no se pide ninguno", () => {
        const rect = rectVentanaCentrada({ ancho: 1280, alto: 800 });
        expect(rect.w).toBe(760);
        expect(rect.h).toBe(520);
        expect(rect.x).toBe(260);
        expect(rect.y).toBe(140);
    });

    it("respeta el margen de 16 px en teléfono y centra el ancho disponible", () => {
        const rect = rectVentanaCentrada({ ancho: 400, alto: 800 }, { w: 760, h: 520 });
        expect(rect.x).toBe(16);
        expect(rect.w).toBe(368);
        expect(rect.x + rect.w).toBe(384);
        expect(rect.y).toBe(140);
    });

    it("nunca deja la ventana bajo la barra superior ni fuera por abajo", () => {
        const rect = rectVentanaCentrada({ ancho: 1280, alto: 540 }, { w: 760, h: 520 });
        expect(rect.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
        expect(rect.y + rect.h).toBeLessThanOrEqual(540);
    });
});

describe("recolocarVentanaEnPantalla", () => {
    it("deja intacta una posición guardada que ya está dentro", () => {
        const guardada = { x: 120, y: 140, w: 700, h: 500 };
        expect(recolocarVentanaEnPantalla(guardada, { ancho: 1920, alto: 1080 })).toEqual(guardada);
    });

    it("acerca una ventana guardada fuera por la izquierda y por abajo", () => {
        const rect = recolocarVentanaEnPantalla(
            { x: -240, y: 900, w: 700, h: 500 },
            { ancho: 1920, alto: 1080 },
        );
        expect(rect.x).toBe(0);
        expect(rect.y).toBe(580);
        expect(rect.w).toBe(700);
        expect(rect.h).toBe(500);
    });

    it("acerca al borde derecho sin cambiar el tamaño guardado", () => {
        const rect = recolocarVentanaEnPantalla(
            { x: 1800, y: 100, w: 700, h: 500 },
            { ancho: 1920, alto: 1080 },
        );
        expect(rect.x).toBe(1220);
        expect(rect.x + rect.w).toBe(1920);
        expect(rect.y).toBe(100);
        expect(rect.w).toBe(700);
    });

    it("no baja una ventana por debajo de la barra superior", () => {
        const rect = recolocarVentanaEnPantalla(
            { x: 100, y: 0, w: 700, h: 500 },
            { ancho: 1280, alto: 800 },
        );
        expect(rect.y).toBe(DESKTOP_TOP_INSET);
    });
});
