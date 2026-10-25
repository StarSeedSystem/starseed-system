// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
    DESKTOP_TOP_INSET,
    createDesktop,
    openWindow,
    readDesktopsSnapshot,
    setWindowRect,
} from "@/components/desktop/desktop-store";

function fijarViewport(ancho: number, alto: number): void {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: ancho });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: alto });
}

function ventanaDe(desktopId: string) {
    const desktop = readDesktopsSnapshot().desktops.find((d) => d.id === desktopId);
    return desktop?.windows[0];
}

describe("ventanas del escritorio · apertura y límites (RTRLB1020N)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("usa el tamaño por defecto cuando no se pide ninguno", () => {
        fijarViewport(1280, 800);
        const desktopId = createDesktop("Prueba");
        openWindow(desktopId, { type: "app", ref: "app-defecto", name: "Prueba" });

        const ventana = ventanaDe(desktopId);
        expect(ventana?.w).toBe(760);
        expect(ventana?.h).toBe(520);
    });

    it("nunca nace bajo la barra superior ni fuera por abajo", () => {
        fijarViewport(1280, 540);
        const desktopId = createDesktop("Prueba");
        openWindow(desktopId, { type: "app", ref: "app-baja", name: "Prueba" }, { w: 760, h: 520 });

        const ventana = ventanaDe(desktopId);
        expect(ventana).toBeDefined();
        expect(ventana!.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
        expect(ventana!.y + ventana!.h).toBeLessThanOrEqual(540);
    });

    it("deja intacta una posición guardada que ya está dentro", () => {
        fijarViewport(1920, 1080);
        const desktopId = createDesktop("Prueba");
        const winId = openWindow(desktopId, { type: "app", ref: "app-guardada", name: "Prueba" });
        setWindowRect(desktopId, winId, { x: 120, y: 140, w: 700, h: 500 });

        openWindow(desktopId, { type: "app", ref: "app-guardada", name: "Prueba" });

        const ventana = ventanaDe(desktopId);
        expect({ x: ventana?.x, y: ventana?.y, w: ventana?.w, h: ventana?.h }).toEqual({
            x: 120,
            y: 140,
            w: 700,
            h: 500,
        });
    });
});
