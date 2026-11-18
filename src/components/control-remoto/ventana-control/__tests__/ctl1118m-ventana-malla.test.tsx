import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { VentanaControl, olvidarLugarVentana } from "../ventana-control";
import type { PropsVentanaControl } from "../tipos";

/** CTL1118M · la pantalla por la malla se enseña en un lienzo (sin vídeo ni captureStream) y la ventana dice la vía real y los cuadros/s. */
function props(extra: Partial<PropsVentanaControl> = {}): PropsVentanaControl {
    return {
        nombre: "Maggabox",
        modo: "pagina",
        estado: "en-vivo",
        flujo: null,
        pantalla: { ancho: 1000, alto: 600, giro: 0 },
        nivel: "controlar",
        capacidades: { gestos: true, maxDedos: 10, teclas: ["atras"], volumen: false, brillo: false, texto: true },
        aparato: null,
        fps: 6.5,
        alEnviar: vi.fn(),
        alCerrar: vi.fn(),
        ...extra,
    };
}

beforeEach(() => {
    olvidarLugarVentana();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("CTL1118M · ventana con la pantalla por la malla", () => {
    it("monta el lienzo recibido, oculta el vídeo y no dice «Esperando la imagen»", () => {
        const lienzo = document.createElement("canvas");
        render(<VentanaControl {...props({ via: "malla", enlaceVia: "directo:red-local", lienzo })} />);
        const sitio = screen.getByTestId("ventana-control-lienzo");
        expect(sitio.contains(lienzo)).toBe(true);
        expect(sitio.style.display).toBe("block");
        expect(screen.queryByTestId("ventana-control-mensaje")).toBeNull();
    });
    it("al quitar el lienzo lo suelta del DOM", () => {
        const lienzo = document.createElement("canvas");
        const r = render(<VentanaControl {...props({ via: "malla", lienzo })} />);
        r.rerender(<VentanaControl {...props({ via: "malla", lienzo: null })} />);
        expect(lienzo.parentNode).toBeNull();
    });
    it("rotula la vía real y los cuadros/s medidos", () => {
        render(<VentanaControl {...props({ via: "malla", enlaceVia: "directo:red-local", lienzo: document.createElement("canvas") })} />);
        expect(screen.getByTestId("ventana-control-via").textContent).toBe("Pantalla por la malla · directo:red-local · 6,5 cuadros/s");
    });
    it("sin lienzo ni flujo sigue esperando la imagen (como antes)", () => {
        render(<VentanaControl {...props({ via: undefined })} />);
        expect(screen.getByTestId("ventana-control-mensaje").textContent).toMatch(/Esperando la imagen de Maggabox/);
    });
});
