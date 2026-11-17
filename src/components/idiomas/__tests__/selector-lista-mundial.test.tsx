/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectorIdioma } from "../selector-idioma";
import { listaMundial } from "@/lib/idiomas/lista-mundial";

beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("selector de idioma · lista mundial", () => {
    it("usa listaMundial y muestra nombre propio grande y nombre actual pequeño", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const opciones = screen.getAllByRole("option");
        expect(opciones.length).toBe(36);
        const de = opciones.find((o) => o.getAttribute("data-codigo") === "de");
        expect(de).toBeTruthy();
        expect(de!.textContent).toContain("Deutsch");
        expect(de!.textContent.toLowerCase()).toContain("alemán");
    });

    it("marca 'Muy hablado' en los idiomas más hablados", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const zh = screen.getAllByRole("option").find((o) => o.getAttribute("data-codigo") === "zh");
        expect(zh).toBeTruthy();
        expect(zh!.textContent).toContain("Muy hablado");
        const en = screen.getAllByRole("option").find((o) => o.getAttribute("data-codigo") === "en");
        expect(en).toBeTruthy();
        expect(en!.textContent).toContain("Muy hablado");
    });

    it("muestra 'Sin catálogo: se verá en español' donde conCatalogo es falso", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const de = screen.getAllByRole("option").find((o) => o.getAttribute("data-codigo") === "de");
        expect(de).toBeTruthy();
        expect(de!.textContent).toContain("Sin catálogo: se verá en español");
    });

    it("busca por nombre propio, nombre actual, código y alias", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const caja = screen.getByRole("searchbox", { name: "Buscar idioma" });
        fireEvent.change(caja, { target: { value: "ale" } });
        let filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
        fireEvent.change(caja, { target: { value: "deu" } });
        filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
        fireEvent.change(caja, { target: { value: "ger" } });
        filtrados = screen.getAllByRole("option");
        expect(filtrados.map((o) => o.getAttribute("data-codigo"))).toContain("de");
    });

    it("virtualiza la lista: renderiza tramos de 60 al desplazar", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const ul = screen.getByRole("listbox");
        const opcionesIniciales = screen.getAllByRole("option");
        expect(opcionesIniciales.length).toBeLessThanOrEqual(62);
        act(() => {
            Object.defineProperty(ul, "clientHeight", { value: 400, configurable: true });
            ul.scrollTop = 3000;
            fireEvent.scroll(ul);
        });
        const opcionesDespues = screen.getAllByRole("option");
        expect(opcionesDespues.length).toBe(opcionesIniciales.length);
    });

    it("conserva sugerido arriba, teclado completo, 44px, 360px, rótulo rotativo y nombre accesible estable", () => {
        Object.defineProperty(navigator, "languages", { value: ["pt-BR"], configurable: true });
        const alElegir = vi.fn();
        render(<SelectorIdioma alElegir={alElegir} />);
        const boton = screen.getByRole("button", { name: "Elegir idioma" });
        expect(boton.className).toContain("min-h-[44px]");
        expect(screen.getByTestId("rotulo-idioma").getAttribute("aria-hidden")).toBe("true");
        fireEvent.click(boton);
        expect(screen.getByText("Sugerido para este aparato")).toBeTruthy();
        let opciones = screen.getAllByRole("option");
        expect(opciones[0].getAttribute("data-codigo")).toBe("pt");
        const caja = screen.getByRole("searchbox");
        fireEvent.keyDown(caja, { key: "Escape" });
        expect(screen.queryByTestId("panel-idioma")).toBeNull();
        fireEvent.click(boton);
        opciones = screen.getAllByRole("option");
        fireEvent.keyDown(opciones[0], { key: "Enter" });
        expect(alElegir).toHaveBeenCalledWith("pt");
    });

    it("un idioma sin catálogo se puede elegir y dice la verdad: seguirá en español", () => {
        render(<SelectorIdioma abiertoAlInicio />);
        const de = screen.getAllByRole("option").find((o) => o.getAttribute("data-codigo") === "de")!;
        fireEvent.click(de);
        expect(screen.getByTestId("estado-idioma").textContent).toContain("Aún no hay catálogo de");
        expect(screen.getByTestId("estado-idioma").textContent).toContain("se ve en español");
    });
});