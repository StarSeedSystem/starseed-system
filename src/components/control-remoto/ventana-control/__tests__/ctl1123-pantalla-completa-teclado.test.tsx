import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { EntradaControl, PropsVentanaControl } from "../tipos";

function props(extra: Partial<PropsVentanaControl> = {}): { p: PropsVentanaControl; env: EntradaControl[] } {
    const env: EntradaControl[] = [];
    const p: PropsVentanaControl = {
        nombre: "Maggaboard",
        modo: "flotante",
        estado: "en-vivo",
        flujo: null,
        pantalla: { ancho: 1080, alto: 1920, giro: 0 },
        nivel: "controlar",
        capacidades: {
            gestos: true,
            maxDedos: 10,
            teclas: ["atras", "inicio", "recientes"],
            volumen: false,
            brillo: false,
            texto: true,
        },
        aparato: null,
        alEnviar: (e) => env.push(e),
        alCerrar: vi.fn(),
        ...extra,
    };
    return { p, env };
}

beforeEach(() => {
    olvidarLugarVentana();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
});

afterEach(() => {
    delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
    cleanup();
    vi.restoreAllMocks();
});

describe("CTL1123 · pantalla completa y modos de teclado", () => {
    it("alterna pantalla completa en modo flotante y llama ventana_pantalla_completa en Tauri", () => {
        const invoke = vi.fn().mockResolvedValue(true);
        (globalThis as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };

        const { p } = props({ modo: "flotante" });
        const { unmount } = render(<VentanaControl {...p} />);

        const ventana = screen.getByTestId("ventana-control");
        const btn = screen.getByTestId("ventana-control-pantalla-completa");
        expect(ventana).toHaveAttribute("data-pantalla-completa", "no");
        expect(screen.getByTestId("ventana-control-esquina")).toBeInTheDocument();

        fireEvent.click(btn);
        expect(ventana).toHaveAttribute("data-pantalla-completa", "si");
        expect(screen.queryByTestId("ventana-control-esquina")).toBeNull();
        expect(invoke).toHaveBeenCalledWith("ventana_pantalla_completa", { activo: true });

        unmount();
        expect(invoke).toHaveBeenCalledWith("ventana_pantalla_completa", { activo: false });
    });

    it("ofrece pantalla completa también en modo pagina", () => {
        const { p } = props({ modo: "pagina" });
        render(<VentanaControl {...p} />);
        const btn = screen.getByTestId("ventana-control-pantalla-completa");
        fireEvent.click(btn);
        expect(screen.getByTestId("ventana-control")).toHaveAttribute("data-pantalla-completa", "si");
        fireEvent.click(btn);
        expect(screen.getByTestId("ventana-control")).toHaveAttribute("data-pantalla-completa", "no");
    });

    it("permite elegir Mensaje, Tiempo real y Ambos con teclado virtual en vivo hacia Android", () => {
        const { p, env } = props({ modo: "pagina" });
        render(<VentanaControl {...p} />);

        // Por defecto sigue en Mensaje.
        expect(screen.getByLabelText("Texto para escribir en el aparato")).toBeInTheDocument();
        expect(screen.queryByTestId("ventana-control-teclado-vivo")).toBeNull();

        // Cambia a Tiempo real: desaparece el formulario por mensaje y aparece el teclado en vivo + teclas rápidas.
        fireEvent.click(screen.getByRole("button", { name: "Tiempo real" }));
        expect(screen.queryByLabelText("Texto para escribir en el aparato")).toBeNull();
        const vivo = screen.getByTestId("ventana-control-teclado-vivo");
        fireEvent.change(vivo, { target: { value: "hola" } });
        fireEvent.keyDown(vivo, { key: "Backspace" });
        fireEvent.keyDown(vivo, { key: "Enter" });
        fireEvent.click(screen.getByRole("button", { name: "Enviar espacio" }));

        // Teclas físicas directamente sobre la pantalla también llegan cuando el modo es tiempo-real hacia Android.
        fireEvent.keyDown(screen.getByTestId("ventana-control"), { key: "z" });

        expect(env).toEqual([
            { tipo: "texto", texto: "hola" },
            { tipo: "texto", texto: "\b" },
            { tipo: "texto", texto: "\n" },
            { tipo: "texto", texto: " " },
            { tipo: "texto", texto: "z" },
        ]);

        // Cambia a Ambos: muestra los dos a la vez.
        fireEvent.click(screen.getByRole("button", { name: "Ambos" }));
        expect(screen.getByTestId("ventana-control-teclado-vivo")).toBeInTheDocument();
        expect(screen.getByLabelText("Texto para escribir en el aparato")).toBeInTheDocument();
    });
});
