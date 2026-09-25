import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import React from "react";
import { SideCurtains } from "../side-curtains";
import { TrinityEdgeAccess } from "../trinity-edge-access";
import { usePerimeter, type PerimeterEdge } from "@/context/perimeter-context";

vi.mock("@/context/perimeter-context", () => ({
    usePerimeter: vi.fn(),
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            themeStore: { activeMode: "primary" },
            styling: { crystalPreset: "none" },
            trinity: {
                edgeAccess: {
                    mode: "on",
                    edges: {
                        zenith: { handle: true, swipe: true },
                        horizon: { handle: true, swipe: true },
                        logic: { handle: true, swipe: true },
                        anchor: { handle: true, swipe: true },
                    },
                    swipeThreshold: 56,
                },
            },
        },
        updateSection: vi.fn(),
    }),
}));

vi.mock("@/context/board-context", () => ({
    useBoardSystem: () => ({
        boards: [],
        activeBoardId: null,
        createBoard: vi.fn(),
        setActiveBoard: vi.fn(),
        deleteBoard: vi.fn(),
    }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
}));

/* ── Entorno: movimiento reducido (sin animaciones), reloj controlado y medidas ── */
let reloj = 1000;
const avanzar = (ms: number) => { reloj += ms; };

function puntero(tipo: "mouse" | "touch", x: number, y: number) {
    return { pointerId: 1, pointerType: tipo, isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true };
}

/** Arrastre completo: pulsar, mover en `pasos` tramos de 16 ms y soltar. */
function arrastrar(el: Element, tipo: "mouse" | "touch", desde: [number, number], hasta: [number, number], pasos = 8) {
    fireEvent.pointerDown(el, puntero(tipo, desde[0], desde[1]));
    for (let i = 1; i <= pasos; i++) {
        avanzar(16);
        fireEvent.pointerMove(el, puntero(tipo, desde[0] + ((hasta[0] - desde[0]) * i) / pasos, desde[1] + ((hasta[1] - desde[1]) * i) / pasos));
    }
    avanzar(16);
    fireEvent.pointerUp(el, puntero(tipo, hasta[0], hasta[1]));
}

describe("SideCurtains · cierre y gestos (motor unificado)", () => {
    const setActiveEdge = vi.fn();
    const capturar = vi.fn();

    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        reloj = 1000;
        vi.spyOn(performance, "now").mockImplementation(() => reloj);
        global.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: true, // incluye prefers-reduced-motion → cierres inmediatos y deterministas
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        // jsdom no maqueta: el panel mide 360 px de ancho.
        Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
            configurable: true,
            get() { return (this as HTMLElement).hasAttribute("data-trinity-curtain") ? 360 : 0; },
        });
        Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, writable: true, value: capturar });
        Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, writable: true, value: () => false });
        Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, writable: true, value: () => {} });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
    });

    const abrir = (edge: "horizon" | "logic") => {
        vi.mocked(usePerimeter).mockReturnValue({ activeEdge: edge, setActiveEdge });
        return render(<SideCurtains />);
    };

    it("Horizon: la X («Cerrar Centro de Creación») cierra con un clic real de ratón y NUNCA captura el puntero", () => {
        abrir("horizon");
        const x = screen.getByRole("button", { name: "Cerrar Centro de Creación" });
        // Secuencia completa como en el navegador. La causa del fallo original era
        // la captura en el pointerdown de la capa: el clic dejaba de llegar a la X.
        fireEvent.pointerDown(x, puntero("mouse", 300, 30));
        fireEvent.pointerUp(x, puntero("mouse", 300, 30));
        fireEvent.click(x);
        expect(capturar).not.toHaveBeenCalled();
        expect(setActiveEdge).toHaveBeenCalledWith(null);
    });

    it("Logic: la X está en la cabecera del Centro de Control, dentro del panel, y cierra", () => {
        abrir("logic");
        const panel = screen.getByTestId("logic-curtain-container");
        const x = screen.getByRole("button", { name: "Cerrar el Centro de Control" });
        expect(panel.contains(x)).toBe(true);
        expect(x.getAttribute("title")).toBe("Cerrar el Centro de Control (Esc)");
        fireEvent.click(x);
        expect(setActiveEdge).toHaveBeenCalledWith(null);
    });

    it("un toque sobre un botón del panel sigue siendo un clic (no arrastra ni captura)", () => {
        abrir("horizon");
        const boton = screen.getByRole("button", { name: /Abrir página completa/ });
        fireEvent.pointerDown(boton, puntero("touch", 180, 220));
        avanzar(40);
        fireEvent.pointerMove(boton, puntero("touch", 182, 221)); // temblor del dedo < umbral
        fireEvent.pointerUp(boton, puntero("touch", 182, 221));
        fireEvent.click(boton);
        expect(capturar).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith("/crear");
    });

    it("Horizon: arrastrar hacia su borde (izquierda) cierra; la captura llega solo tras la intención", () => {
        abrir("horizon");
        const panel = screen.getByTestId("horizon-curtain-container");
        fireEvent.pointerDown(panel, puntero("mouse", 300, 400));
        fireEvent.pointerMove(panel, puntero("mouse", 298, 400));
        expect(capturar).not.toHaveBeenCalled(); // 2 px: todavía pendiente
        arrastrar(panel, "mouse", [298, 400], [60, 410]);
        expect(capturar).toHaveBeenCalled();
        expect(setActiveEdge).toHaveBeenCalledWith(null);
    });

    it("Horizon: un deslizamiento vertical es scroll del contenido: ni captura ni cierra", () => {
        abrir("horizon");
        const panel = screen.getByTestId("horizon-curtain-container");
        arrastrar(panel, "touch", [200, 600], [205, 200]);
        expect(capturar).not.toHaveBeenCalled();
        expect(setActiveEdge).not.toHaveBeenCalled();
    });

    it("Horizon: un arrastre corto y lento vuelve a su sitio", () => {
        abrir("horizon");
        const panel = screen.getByTestId("horizon-curtain-container");
        fireEvent.pointerDown(panel, puntero("touch", 300, 400));
        for (let i = 1; i <= 6; i++) {
            avanzar(60);
            fireEvent.pointerMove(panel, puntero("touch", 300 - i * 10, 400));
        }
        avanzar(300); // se detiene antes de soltar: sin latigazo
        fireEvent.pointerUp(panel, puntero("touch", 240, 400));
        expect(setActiveEdge).not.toHaveBeenCalled();
    });

    it("Horizon: un latigazo corto hacia el borde cierra", () => {
        abrir("horizon");
        const panel = screen.getByTestId("horizon-curtain-container");
        arrastrar(panel, "touch", [260, 400], [190, 402], 4); // 70 px en ~64 ms
        expect(setActiveEdge).toHaveBeenCalledWith(null);
    });

    it("tras un arrastre, el clic que emite el navegador al soltar no activa el botón de debajo", () => {
        abrir("horizon");
        const boton = screen.getByRole("button", { name: /Abrir página completa/ });
        arrastrar(boton, "mouse", [200, 220], [140, 222], 4);
        fireEvent.click(boton);
        expect(push).not.toHaveBeenCalled();
    });

    it("Logic: arrastrar hacia la derecha cierra", () => {
        abrir("logic");
        const panel = screen.getByTestId("logic-curtain-container");
        arrastrar(panel, "touch", [120, 500], [360, 505]);
        expect(setActiveEdge).toHaveBeenCalledWith(null);
    });

    it("tocar el fondo, pulsar Escape o tocar el tirador cierran", () => {
        const { unmount } = abrir("horizon");
        fireEvent.click(document.querySelector('[data-trinity-curtain-fondo="horizon"]') as Element);
        expect(setActiveEdge).toHaveBeenCalledTimes(1);
        unmount();

        abrir("horizon");
        fireEvent.keyDown(document, { key: "Escape" });
        expect(setActiveEdge).toHaveBeenCalledTimes(2);
        cleanup();

        abrir("logic");
        fireEvent.click(screen.getByTestId("logic-curtain-container-tirador"));
        expect(setActiveEdge).toHaveBeenCalledTimes(3);
        expect(setActiveEdge).toHaveBeenLastCalledWith(null);
    });

    it("el panel es un diálogo con nombre, y el foco entra en él al abrir", () => {
        abrir("horizon");
        const panel = screen.getByRole("dialog", { name: "Centro de Creación" });
        expect(panel.getAttribute("aria-modal")).toBe("true");
        expect(panel.contains(document.activeElement)).toBe(true);
    });

    it("opens Logic curtain when dragged inward from right edge in TrinityEdgeAccess", () => {
        Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: 812, configurable: true });
        vi.mocked(usePerimeter).mockReturnValue({ activeEdge: null, setActiveEdge });
        render(<TrinityEdgeAccess />);
        fireEvent.touchStart(window, { touches: [{ clientX: 365, clientY: 300 }] });
        fireEvent.touchMove(window, { touches: [{ clientX: 290, clientY: 300 }] });
        expect(setActiveEdge).toHaveBeenCalledWith("logic");
    });

    it("ensures opening Horizon replaces Logic so both curtains are never open at the same time in 375px", () => {
        let actual: PerimeterEdge = "logic";
        const cambiar = vi.fn((edge: PerimeterEdge) => { actual = edge; });
        vi.mocked(usePerimeter).mockImplementation(() => ({ activeEdge: actual, setActiveEdge: cambiar }));
        Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

        const { rerender } = render(<SideCurtains />);
        expect(screen.queryByTestId("logic-curtain-container")).not.toBeNull();
        expect(screen.queryByTestId("horizon-curtain-container")).toBeNull();

        act(() => cambiar("horizon"));
        rerender(<SideCurtains />);
        expect(screen.queryByTestId("horizon-curtain-container")).not.toBeNull();
    });
});
