import * as React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Alterna, Encajar, PilaAjustable, Prescindible, desbordaAlto } from "../pila-ajustable";

afterEach(cleanup);

/** Un elemento con medidas de maqueta falsas (jsdom no maqueta). */
function conMedidas(el: HTMLElement, clientHeight: number, scrollHeight: number) {
    Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
    return el;
}

describe("desbordaAlto", () => {
    it("sin maqueta (alto 0) nunca desborda", () => {
        expect(desbordaAlto(conMedidas(document.createElement("div"), 0, 500))).toBe(false);
    });
    it("detecta la caja y las filas directas que no caben", () => {
        const caja = conMedidas(document.createElement("div"), 100, 100);
        const fila = conMedidas(document.createElement("div"), 40, 60);
        caja.appendChild(fila);
        expect(desbordaAlto(caja)).toBe(true);
        conMedidas(fila, 40, 40);
        expect(desbordaAlto(caja)).toBe(false);
        expect(desbordaAlto(conMedidas(document.createElement("div"), 100, 101))).toBe(false); // tolerancia 1 px
    });
});

describe("PilaAjustable", () => {
    it("sin maqueta lo enseña todo (SSR y pruebas ven el contenido completo)", () => {
        render(
            <PilaAjustable niveles={2}>
                <p>foco</p>
                <Prescindible nivel={1}><p>secundario</p></Prescindible>
                <Prescindible nivel={2}><p>terciario</p></Prescindible>
                <Alterna nivel={1} corto={<p>corto</p>}><p>largo</p></Alterna>
            </PilaAjustable>,
        );
        expect(screen.getByText("foco")).toBeTruthy();
        expect(screen.getByText("secundario")).toBeTruthy();
        expect(screen.getByText("terciario")).toBeTruthy();
        expect(screen.getByText("largo")).toBeTruthy();
        expect(screen.queryByText("corto")).toBeNull();
    });
    it("nivel 0 o menos no se retira nunca; fuera de una pila, todo se ve", () => {
        render(<><Prescindible nivel={0}><p>siempre</p></Prescindible><Prescindible nivel={3}><p>suelto</p></Prescindible></>);
        expect(screen.getByText("siempre")).toBeTruthy();
        expect(screen.getByText("suelto")).toBeTruthy();
    });
    it("pasa sus atributos (rol, data-*) al contenedor", () => {
        render(<PilaAjustable role="status" data-kit="vacio"><p>x</p></PilaAjustable>);
        const caja = screen.getByRole("status");
        expect(caja.getAttribute("data-kit")).toBe("vacio");
        expect(caja.getAttribute("data-pila-ajustable")).toBe("0");
    });
});

describe("PilaAjustable con ResizeObserver", () => {
    it("si la caja cambia de tamaño estando en cero y ya no cabe, retira el primer nivel (no se queda cortada)", () => {
        const g = globalThis as { ResizeObserver?: unknown };
        const original = g.ResizeObserver;
        let avisar: () => void = () => {};
        g.ResizeObserver = class { constructor(cb: () => void) { avisar = cb; } observe() {} unobserve() {} disconnect() {} };
        try {
            render(
                <PilaAjustable niveles={2} data-testid="pila">
                    <p>foco</p>
                    <Prescindible nivel={1}><p>sugerencias</p></Prescindible>
                </PilaAjustable>,
            );
            const caja = screen.getByTestId("pila");
            // La caja encoge (llega la maqueta real) y el contenido ya no cabe: antes se ponía a
            // cero —ya lo estaba—, React no repintaba y nadie volvía a medir.
            Object.defineProperty(caja, "clientWidth", { configurable: true, value: 260 });
            Object.defineProperty(caja, "clientHeight", { configurable: true, value: 191 });
            // Con las sugerencias no cabe (206 > 191); sin ellas, sí.
            Object.defineProperty(caja, "scrollHeight", { configurable: true, get: () => (caja.textContent?.includes("sugerencias") ? 206 : 180) });
            act(() => avisar());
            expect(caja.getAttribute("data-pila-ajustable")).toBe("1");
            expect(screen.queryByText("sugerencias")).toBeNull();
            expect(screen.getByText("foco")).toBeTruthy();
        } finally {
            g.ResizeObserver = original;
        }
    });
});

describe("Encajar", () => {
    it("sin maqueta da la medida por defecto al contenido", () => {
        render(<Encajar porDefecto={{ ancho: 200, alto: 90 }}>{({ ancho, alto }) => <p>{`${ancho}×${alto}`}</p>}</Encajar>);
        expect(screen.getByText("200×90")).toBeTruthy();
    });
});
