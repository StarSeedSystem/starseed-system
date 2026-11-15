/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorIdioma } from "../selector-idioma";
import { IDIOMAS } from "@/lib/idiomas/idiomas";

beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("selector de idioma", () => {
    it("el botón tiene un nombre estable y el rótulo cambia cada segundo por los idiomas, cada uno en su escritura", () => {
        render(<SelectorIdioma />);
        const boton = screen.getByRole("button", { name: "Elegir idioma" });
        const rotulo = screen.getByTestId("rotulo-idioma");
        expect(rotulo.getAttribute("aria-hidden")).toBe("true");
        expect(boton.contains(rotulo)).toBe(true);
        const vistos = new Set<string>([rotulo.textContent!]);
        for (let i = 0; i < 25; i++) { act(() => { vi.advanceTimersByTime(1000); }); vistos.add(screen.getByTestId("rotulo-idioma").textContent!); }
        expect(vistos.size).toBeGreaterThanOrEqual(24);
        expect(screen.getByRole("button", { name: "Elegir idioma" })).toBeTruthy(); // el nombre accesible no se movió
        expect(screen.getByTestId("rotulo-idioma").getAttribute("lang")).toBeTruthy();
    });
    it("abre con teclado, el sugerido va primero, busca y elige; al elegir guarda y avisa", () => {
        Object.defineProperty(navigator, "languages", { value: ["pt-BR"], configurable: true });
        const alElegir = vi.fn();
        render(<SelectorIdioma alElegir={alElegir} />);
        fireEvent.click(screen.getByRole("button", { name: "Elegir idioma" }));
        expect(screen.getByText("Sugerido para este aparato")).toBeTruthy();
        const opciones = screen.getAllByRole("option");
        expect(opciones[0].getAttribute("data-codigo")).toBe("pt");
        expect(opciones.length).toBe(IDIOMAS.length); // el sugerido, y el resto sin repetirlo… más español: ver abajo
        const caja = screen.getByRole("searchbox", { name: "Buscar idioma" });
        fireEvent.change(caja, { target: { value: "franc" } });
        const filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toEqual(["fr"]);
        fireEvent.keyDown(filtrados[0], { key: "Enter" });
        expect(alElegir).toHaveBeenCalledWith("fr");
        expect(JSON.parse(localStorage.getItem("starseed.idioma.neurona.v1")!).codigo).toBe("fr");
        expect(screen.queryByTestId("panel-idioma")).toBeNull();
    });
    it("Escape cierra el panel sin dejar pasar el evento (no cierra la ventana de acceso)", () => {
        const fuera = vi.fn();
        render(<div onKeyDown={fuera}><SelectorIdioma abiertoAlInicio /></div>);
        fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
        expect(screen.queryByTestId("panel-idioma")).toBeNull();
        expect(fuera).not.toHaveBeenCalled();
    });
    it("un idioma sin catálogo se puede elegir y dice la verdad: seguirá en español", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        fireEvent.click(screen.getAllByRole("option").find((o) => o.getAttribute("data-codigo") === "de")!);
        expect(screen.getByTestId("estado-idioma").textContent).toContain("Aún no hay catálogo de");
    });
});
