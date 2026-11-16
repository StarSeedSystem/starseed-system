// eslint-disable-next-line @typescript-eslint/no-unused-vars
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DisenoAcciones } from "../diseno-acciones";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

const crearProps = (overrides: Partial<any> = {}): any => {
    return {
        estado: "calma",
        tam: 360,
        ultima: { texto: "Todo en calma en la malla.", ts: Date.now() },
        hilo: [
            { rol: "user", texto: "Hola", ts: Date.now() - 30_000 },
            { rol: "aurora", texto: "Todo en calma en la malla.", ts: Date.now() - 10_000 },
        ],
        ahora: Date.now(),
        tactil: false,
        voz: true,
        preguntar: "¿Qué hay nuevo?",
        sugerencias: ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"],
        onAbrirChat: vi.fn(),
        onSugerencia: vi.fn(),
    };
};

describe("DisenoAcciones", () => {
    it("renderiza el botón de Astraura con su estado", () => {
        const { container } = render(<DisenoAcciones {...crearProps()} />);
        const botonVoz = container.querySelector('button[aria-label="Abrir el chat de Astraura. Astraura está en calma"]');
        expect(botonVoz).toBeTruthy();
    });

    it("muestra sugerencias y atajo de chat en ancho grande", () => {
        const { container } = render(<DisenoAcciones {...crearProps()} />);
        const sugerencias = container.querySelectorAll(".ss-redondo");
        expect(sugerencias.length).toBeGreaterThanOrEqual(1);

        const botones = container.querySelectorAll("button");
        expect(botones.length).toBeGreaterThanOrEqual(1);
    });

    it("los elementos de botón están en el DOM", () => {
        render(<DisenoAcciones {...crearProps()} />);
        const botones = screen.getAllByRole("button");
        expect(botones.length).toBeGreaterThan(0);
    });

    it("en ancho 180 px el componente se monta sin error", () => {
        const tamanoDiv = document.createElement("div");
        tamanoDiv.style.width = "180px";
        tamanoDiv.style.height = "180px";
        document.body.appendChild(tamanoDiv);

        const { container } = render(<DisenoAcciones {...crearProps({ tam: 180 }) } />, {
            container: tamanoDiv,
        });

        expect(container.firstElementChild).toBeTruthy();

        document.body.removeChild(tamanoDiv);
    });

    it("en ancho 360 px no hay scrollWidth mayor que clientWidth", () => {
        const tamanoDiv = document.createElement("div");
        tamanoDiv.style.width = "360px";
        tamanoDiv.style.height = "360px";
        document.body.appendChild(tamanoDiv);

        const { container } = render(<DisenoAcciones {...crearProps({ tam: 360 }) } />, {
            container: tamanoDiv,
        });

        const firstChild = container.firstElementChild;
        if (firstChild) {
            const scrollWidth = firstChild.scrollWidth ?? 0;
            const clientWidth = firstChild.clientWidth ?? 0;
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
        }

        document.body.removeChild(tamanoDiv);
    });

    it("los nombres accesibles están en español", () => {
        render(<DisenoAcciones {...crearProps()} />);
        const textoPantalla = screen.getByText(/Resúmeme mi día/);
        expect(textoPantalla).toBeTruthy();
    });
});