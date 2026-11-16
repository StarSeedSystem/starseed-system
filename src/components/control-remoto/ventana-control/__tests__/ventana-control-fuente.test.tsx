import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("RST09 · selector de fuente en ventana de control", () => {
    it("sin alCambiarFuente no aparece el selector", () => {
        const { p } = props();
        render(<VentanaControl {...p} />);
        expect(screen.queryByRole("radiogroup", { name: "Fuente de la pantalla" })).toBeNull();
    });

    it("con alCambiarFuente aparece el selector en el panel de mandos", () => {
        const { p } = props({ fuentePedida: "auto", fuenteReal: "accesibilidad", avisoFuente: null, alCambiarFuente: vi.fn() });
        render(<VentanaControl {...p} />);
        expect(screen.getByRole("radiogroup", { name: "Fuente de la pantalla" })).toBeTruthy();
    });

    it("con alCambiarFuente aparece el selector en la cabecera si no hay mandos en modo ver", () => {
        const { p } = props({ nivel: "ver", fuentePedida: "auto", fuenteReal: "proyeccion", alCambiarFuente: vi.fn() });
        render(<VentanaControl {...p} />);
        expect(screen.getByRole("radiogroup", { name: "Fuente de la pantalla" })).toBeTruthy();
    });

    it("elegir Fluida llama a alCambiarFuente con 'proyeccion'", () => {
        const onCambiar = vi.fn();
        const { p } = props({ fuentePedida: "auto", fuenteReal: "accesibilidad", avisoFuente: null, alCambiarFuente: onCambiar });
        render(<VentanaControl {...p} />);
        fireEvent.click(screen.getByRole("radio", { name: "Fluida (proyección)" }));
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
    });

    it("el aviso se ve cuando llega", () => {
        const { p } = props({
            fuentePedida: "proyeccion",
            fuenteReal: "accesibilidad",
            avisoFuente: "El aparato no ofrece pantalla por proyección.",
            alCambiarFuente: vi.fn(),
        });
        render(<VentanaControl {...p} />);
        expect(screen.getByText("El aparato no ofrece pantalla por proyección.")).toBeTruthy();
    });
});