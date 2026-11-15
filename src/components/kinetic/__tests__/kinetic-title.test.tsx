import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { KineticTitle } from "../KineticTitle";

const COLORES_TRINITY = [
    "text-trinity-azure",
    "text-trinity-emerald",
    "text-trinity-amber",
    "text-trinity-crimson",
] as const;

function simularPreferenciaMovimiento(reducido: boolean): void {
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: reducido && query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }));
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("KineticTitle", () => {
    it("renderiza el titular y cada uno de sus tramos", () => {
        const { getByRole, container } = render(
            <KineticTitle titulo="Semilla de luz viva" />,
        );
        expect(getByRole("heading").textContent).toContain("Semilla de luz viva");
        const tramos = container.querySelectorAll("[data-tramo]");
        expect(tramos).toHaveLength(4);
        expect(Array.from(tramos).map((t) => t.textContent?.trim())).toEqual([
            "Semilla",
            "de",
            "luz",
            "viva",
        ]);
    });

    it("en la variante expresiva usa las cuatro clases de color, una por tramo", () => {
        const { container } = render(
            <KineticTitle titulo="Semilla de luz viva" variante="expresiva" />,
        );
        const tramos = Array.from(container.querySelectorAll<HTMLElement>("[data-tramo]"));
        const porTramo = tramos.map((tramo) =>
            COLORES_TRINITY.filter((color) => tramo.classList.contains(color)),
        );
        expect(porTramo.every((colores) => colores.length <= 1)).toBe(true);
        const usados = new Set(porTramo.flat());
        expect(usados.size).toBe(4);
    });

    it("con prefers-reduced-motion no anima ni transforma el texto", () => {
        simularPreferenciaMovimiento(true);
        const { getByRole, container } = render(
            <KineticTitle titulo="Semilla de luz viva" />,
        );
        const titulo = getByRole("heading");
        expect(titulo.getAttribute("data-movimiento")).toBe("reducido");
        expect(titulo.textContent).toContain("Semilla de luz viva");
        const tramos = Array.from(container.querySelectorAll<HTMLElement>("[data-tramo]"));
        expect(tramos).toHaveLength(4);
        for (const tramo of tramos) {
            expect(tramo.style.transform === "" || tramo.style.transform === "none").toBe(true);
            expect(tramo.style.opacity === "" || tramo.style.opacity === "1").toBe(true);
        }
    });

    it("pinta la línea de horizonte una sola vez en el DOM", () => {
        const { container } = render(<KineticTitle titulo="Semilla de luz viva" />);
        const lineas = container.querySelectorAll("[data-horizonte]");
        expect(lineas).toHaveLength(1);
        expect(lineas[0].getAttribute("aria-hidden")).toBe("true");
    });
});
