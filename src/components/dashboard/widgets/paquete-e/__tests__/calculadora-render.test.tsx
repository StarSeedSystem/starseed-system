import * as React from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { entornoNavegador, montarEn, TODAS } from "../pruebas-render";
import { CalculatorWidget } from "../../calculator-widget";

beforeAll(entornoNavegador);
afterEach(() => { cleanup(); window.localStorage.clear(); });

const resultado = () => screen.getByLabelText(/^Resultado:/).textContent;

describe("Calculadora por tamaño", () => {
    it.each(TODAS)("se pinta en %s", (clase) => {
        const { container } = montarEn(clase, <CalculatorWidget />);
        expect(container.querySelector("[data-widget-e='CALCULATOR']")?.getAttribute("data-clase")).toBe(clase);
        expect(screen.getByRole("region", { name: "Calculadora" })).toBeTruthy();
    });

    it("calcula con las teclas y guarda el historial (l)", () => {
        montarEn("l", <CalculatorWidget />);
        fireEvent.click(screen.getByRole("button", { name: "2" }));
        fireEvent.click(screen.getByRole("button", { name: "Sumar" }));
        fireEvent.click(screen.getByRole("button", { name: "3" }));
        fireEvent.click(screen.getByRole("button", { name: "Multiplicar" }));
        fireEvent.click(screen.getByRole("button", { name: "4" }));
        expect(screen.getByText("= 14")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Igual" }));
        expect(resultado()).toBe("14");
        expect(screen.getByRole("region", { name: "Historial de cálculos" }).textContent).toMatch(/14/);
    });

    it("el teclado físico solo actúa con el widget enfocado", () => {
        montarEn("m", <CalculatorWidget />);
        fireEvent.keyDown(window, { key: "7" });
        expect(resultado()).toBe("0");
        const raiz = screen.getByRole("region", { name: "Calculadora" });
        fireEvent.keyDown(raiz, { key: "7" });
        fireEvent.keyDown(raiz, { key: "*" });
        fireEvent.keyDown(raiz, { key: "6" });
        fireEvent.keyDown(raiz, { key: "Enter" });
        expect(resultado()).toBe("42");
    });

    it("explica el error sin romperse", () => {
        montarEn("m", <CalculatorWidget />);
        const raiz = screen.getByRole("region", { name: "Calculadora" });
        for (const k of ["5", "/", "0", "Enter"]) fireEvent.keyDown(raiz, { key: k });
        expect(screen.getByRole("alert").textContent).toMatch(/dividir entre cero/);
    });

    it("xl trae la fila científica", () => {
        montarEn("xl", <CalculatorWidget />);
        expect(screen.getByRole("button", { name: "Raíz cuadrada" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pi" })).toBeTruthy();
    });
});
