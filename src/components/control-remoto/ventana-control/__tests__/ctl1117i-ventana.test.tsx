import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl } from "../tipos";

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    return {
        env,
        p: {
            nombre: "Tableta de Alex",
            modo: "pagina",
            estado: "en-vivo",
            flujo: null,
            pantalla: { ancho: 1000, alto: 2000, giro: 0 },
            nivel: "controlar",
            capacidades: { gestos: true, maxDedos: 10, teclas: [], volumen: false, brillo: false, texto: false },
            aparato: null,
            alEnviar: (e) => env.push(e),
            alCerrar: vi.fn(),
            color: "#ddc23c",
            miColor: "#3c9fdd",
            ...extra,
        },
    };
}

beforeEach(() => {
    olvidarLugarVentana();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20, width: 400, height: 800, right: 410, bottom: 820, x: 10, y: 20, toJSON() {} });
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 20) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const pantalla = () => screen.getByTestId("ventana-control-pantalla");

describe("CTL1117I · quién es quién en la ventana de control", () => {
    it("el nombre de la neurona controlada lleva su punto de color y se enseña el color de mis toques", () => {
        render(<VentanaControl {...props().p} />);
        const puntos = screen.getAllByTestId("punto-color").map((x) => x.getAttribute("data-color"));
        expect(puntos).toContain("#ddc23c");
        expect(puntos).toContain("#3c9fdd");
        expect(screen.getByTestId("ventana-control-leyenda-mia")).toHaveTextContent("Tus toques");
    });
    it("sin colores no sale ningún punto", () => {
        render(<VentanaControl {...props({ color: undefined, miColor: undefined }).p} />);
        expect(screen.queryAllByTestId("punto-color")).toHaveLength(0);
    });
    it("en modo flotante el punto va junto al nombre", () => {
        render(<VentanaControl {...props({ modo: "flotante" }).p} />);
        expect(screen.getAllByTestId("punto-color").some((x) => x.getAttribute("data-color") === "#ddc23c")).toBe(true);
    });
});

describe("CTL1117I · el eco local de MI clic", () => {
    it("al pulsar sobre la imagen sale al instante una onda de MI color, en el sitio del clic, y se va a los 450 ms", () => {
        vi.useFakeTimers();
        const { p, env } = props();
        render(<VentanaControl {...p} />);
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(0);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 210, clientY: 420 });
        const ondas = screen.getAllByTestId("onda-toque");
        expect(ondas).toHaveLength(1);
        expect(ondas[0].getAttribute("data-color")).toBe("#3c9fdd");
        expect(ondas[0]).toHaveStyle({ left: "200px", top: "400px" });
        expect(env).toEqual([]); // la onda no espera a nada ni manda nada: la orden sale por su camino de siempre
        act(() => void vi.advanceTimersByTime(449));
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(1);
        act(() => void vi.advanceTimersByTime(2));
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(0);
    });
    it("la capa de ondas no se anuncia a un lector de pantalla ni toca nada", () => {
        render(<VentanaControl {...props().p} />);
        const capa = screen.getByTestId("capa-ondas");
        expect(capa).toHaveAttribute("aria-hidden", "true");
        expect(capa.className).toContain("pointer-events-none");
    });
    it("sin control (solo ver) o con clic derecho no hay onda", () => {
        render(<VentanaControl {...props({ nivel: "ver" }).p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 210, clientY: 420 });
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(0);
        cleanup();
        render(<VentanaControl {...props().p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 2, pointerType: "mouse", button: 2, clientX: 210, clientY: 420 });
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(0);
    });
    it("fuera de la imagen no hay onda", () => {
        render(<VentanaControl {...props({ pantalla: { ancho: 1000, alto: 100, giro: 0 } }).p} />);
        fireEvent.pointerDown(pantalla(), { pointerId: 1, pointerType: "mouse", button: 0, clientX: 210, clientY: 20 });
        expect(screen.queryAllByTestId("onda-toque")).toHaveLength(0);
    });
});
