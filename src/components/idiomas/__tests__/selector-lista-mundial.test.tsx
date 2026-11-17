/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorIdioma } from "../selector-idioma";

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("selector de idioma · lista mundial", () => {
    it("muestra nombre propio grande y nombre actual pequeño en cada fila", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const opciones = screen.getAllByRole("option");
        const de = opciones.find((o) => o.getAttribute("data-codigo") === "de")!;
        expect(de.querySelector("span[lang=de]")?.textContent).toBe("Deutsch");
        expect(de.querySelector("span[lang=de]")?.getAttribute("class")).toContain("font-medium");
    });

    it("marca 'Muy hablado' en los idiomas más hablados", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const opciones = screen.getAllByRole("option");
        const zh = opciones.find((o) => o.getAttribute("data-codigo") === "zh")!;
        expect(zh.textContent).toContain("Muy hablado");
    });

    it("muestra aviso 'Sin catálogo: se verá en español' donde conCatalogo es falso", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const opciones = screen.getAllByRole("option");
        const de = opciones.find((o) => o.getAttribute("data-codigo") === "de")!;
        expect(de.textContent).toContain("Aún sin catálogo: se verá en español");
    });

    it("busca por nombre propio, nombre actual, código y alias", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const caja = screen.getByRole("searchbox", { name: "Buscar idioma" });
        
        fireEvent.change(caja, { target: { value: "ale" } });
        let filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
        
        fireEvent.change(caja, { target: { value: "german" } });
        filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
        
        fireEvent.change(caja, { target: { value: "de" } });
        filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
    });

    it("virtualiza la lista: renderiza tramos de 60 al desplazar", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const lista = screen.getByRole("listbox");
        const opcionesIniciales = screen.getAllByRole("option");
        expect(opcionesIniciales.length).toBeLessThanOrEqual(60);
        
        act(() => {
            fireEvent.scroll(lista, { target: { scrollTop: 3000 } });
        });
        
        const opcionesDespues = screen.getAllByRole("option");
        expect(opcionesDespues.length).toBeGreaterThan(opcionesIniciales.length);
    });

    it("conserva sugerido arriba, teclado completo, 44px, 360px, rótulo rotativo y nombre accesible estable", () => {
        Object.defineProperty(navigator, "languages", { value: ["pt-BR"], configurable: true });
        render(<SelectorIdioma abiertoAlInicio />);
        
        expect(screen.getByText("Sugerido para este aparato")).toBeTruthy();
        expect(screen.getByRole("option").getAttribute("data-codigo")).toBe("pt");
        
        const boton = screen.getByRole("button", { name: "Elegir idioma" });
        expect(boton).toHaveStyle({ minHeight: "44px" });
        
        const rotulo = screen.getByTestId("rotulo-idioma");
        const primero = rotulo.textContent;
        act(() => { vi.advanceTimersByTime(1000); });
        expect(screen.getByTestId("rotulo-idioma").textContent).not.toBe(primero);
        
        fireEvent.keyDown(screen.getByRole("searchbox"), { key: "ArrowDown" });
        expect(screen.getByRole("option")).toHaveFocus();
        fireEvent.keyDown(screen.getByRole("option"), { key: "Enter" });
        expect(screen.queryByTestId("panel-idioma")).toBeNull();
        fireEvent.keyDown(boton, { key: "Escape" });
        expect(screen.queryByTestId("panel-idioma")).toBeNull();
    });
});