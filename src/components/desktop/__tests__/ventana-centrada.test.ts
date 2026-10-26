// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
    DESKTOP_TOP_INSET,
    createDesktop,
    normalizeState,
    openWindow,
    readDesktopsSnapshot,
    type DesktopWindowContentRef,
} from "../desktop-store";

// Rescate de la rama nube/40126871156 (RLB1020N), adaptado a la API de hoy.
// Main NO centra las ventanas nuevas (cascada a propósito) y NO recoloca
// horizontalmente una posición guardada: solo la protege respecto de la barra
// superior. Los casos de centrado y de margen de teléfono se descartaron
// (contrato cambiado a propósito); se rescatan los del tope y tamaño.

const ref: DesktopWindowContentRef = { type: "app", ref: "app-prueba", name: "Prueba" };

beforeEach(() => {
    localStorage.clear();
});

describe("ventanas del escritorio · tamaño y topes", () => {
    it("una ventana nueva sin tamaño pedido usa el por defecto (760×520) y no nace bajo la barra", () => {
        window.innerWidth = 1920;
        window.innerHeight = 1080;
        const id = createDesktop("Prueba");
        openWindow(id, ref);
        const ventana = readDesktopsSnapshot().desktops[0].windows[0];
        expect(ventana.w).toBe(760);
        expect(ventana.h).toBe(520);
        expect(ventana.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
    });

    it("ninguna ventana nueva invade la banda de la barra ni se sale por abajo cuando cabe", () => {
        window.innerWidth = 1280;
        window.innerHeight = 800;
        const id = createDesktop("Prueba");
        for (let i = 0; i < 8; i++) openWindow(id, { type: "app", ref: `app-${i}` });
        for (const w of readDesktopsSnapshot().desktops[0].windows) {
            expect(w.y).toBeGreaterThanOrEqual(DESKTOP_TOP_INSET);
            expect(w.y + w.h).toBeLessThanOrEqual(800 - 120);
        }
    });
});

describe("ventanas guardadas · normalización al cargar", () => {
    it("deja intacta una posición guardada que ya está dentro", () => {
        const guardada = { x: 120, y: 140, w: 700, h: 500 };
        const estado = normalizeState({
            desktops: [{ id: "d1", windows: [{ ...guardada, contentRef: { type: "app", ref: "a" } }] }],
        });
        const g = estado?.desktops[0].windows[0];
        expect(g?.x).toBe(guardada.x);
        expect(g?.y).toBe(guardada.y);
        expect(g?.w).toBe(guardada.w);
        expect(g?.h).toBe(guardada.h);
    });

    it("eleva una ventana guardada dentro de la banda de la barra superior (B-1)", () => {
        const estado = normalizeState({
            desktops: [{ id: "d1", windows: [{ x: 100, y: 0, w: 700, h: 500, contentRef: { type: "app", ref: "a" } }] }],
        });
        expect(estado?.desktops[0].windows[0]?.y).toBe(DESKTOP_TOP_INSET);
    });
});
