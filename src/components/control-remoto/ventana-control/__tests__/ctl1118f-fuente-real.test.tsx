import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl, FuentePedida } from "../tipos";

const TODAS = ["atras", "inicio", "recientes", "notificaciones", "ajustes-rapidos", "bloquear", "captura", "menu-energia"];

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    const p: PropsVentanaControl = {
        nombre: "Tableta de Alex",
        modo: "pagina",
        estado: "en-vivo",
        flujo: null,
        pantalla: { ancho: 1000, alto: 2000, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 10, teclas: TODAS, volumen: true, brillo: true, texto: true },
        aparato: { volumen: { multimedia: 0.4, timbre: 0.8 }, brillo: 0.6, bateria: 0.87, cargando: true, red: { wifi: true, datos: false, bluetooth: true } },
        latenciaMs: 42,
        fps: 29.6,
        alEnviar: (e) => env.push(e),
        alCerrar: vi.fn(),
        ...extra,
    };
    return { p, env };
}

function medir() {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON() {} });
}

beforeEach(() => {
    olvidarLugarVentana();
    medir();
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(performance.now()), 20) as unknown as number);
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("CTL1118F · la ventana dice la fuente real y los cuadros/s medidos", () => {
    it("con accesibilidad enseña la fuente real con el número medido, la línea de ayuda y el botón que solo PIDE", () => {
        const alPedirFluida = vi.fn();
        const { p } = props({ fuenteReal: "accesibilidad", fps: 2.9, alPedirFluida });
        render(<VentanaControl {...p} />);
        expect(screen.getByTestId("ventana-control-fuente-real")).toHaveTextContent("Pantalla por accesibilidad · 2,9 cuadros/s");
        expect(screen.getByTestId("ventana-control-fuente-ayuda")).toHaveTextContent(/aceptar la pantalla fluida/);
        fireEvent.click(screen.getByRole("button", { name: "Pedir la pantalla fluida" }));
        expect(alPedirFluida).toHaveBeenCalledTimes(1);
    });
    it("con la fluida no hay ayuda ni botón, y el rótulo lleva lo medido", () => {
        const { p } = props({ fuenteReal: "proyeccion", fps: 24.4, alPedirFluida: vi.fn() });
        render(<VentanaControl {...p} />);
        expect(screen.getByTestId("ventana-control-fuente-real")).toHaveTextContent("Pantalla fluida (proyección) · 24 cuadros/s");
        expect(screen.queryByTestId("ventana-control-fuente-ayuda")).toBeNull();
        expect(screen.queryByRole("button", { name: "Pedir la pantalla fluida" })).toBeNull();
    });
    it("sin fuente real no inventa nada de la fuente", () => {
        const { p } = props({ fuenteReal: null, fps: undefined });
        render(<VentanaControl {...p} />);
        expect(screen.queryByTestId("ventana-control-fuente")).toBeNull();
    });
});
