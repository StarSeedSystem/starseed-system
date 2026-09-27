import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EtiquetaDeslizante } from "../etiqueta-deslizante";

class ResizeObserverFalso {
    observe() {}
    unobserve() {}
    disconnect() {}
}

function fijarMedidas(el: HTMLElement, ancho: number, desplazamiento: number) {
    Object.defineProperty(el, "clientWidth", { configurable: true, value: ancho });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: desplazamiento });
}

function mediaMock(hover: boolean, reducido: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("hover") ? hover : query.includes("prefers-reduced-motion") ? reducido : false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
}

describe("EtiquetaDeslizante", () => {
    beforeEach(() => {
        vi.stubGlobal("ResizeObserver", ResizeObserverFalso);
        mediaMock(true, false);
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("texto corto (sin desborde) no desliza al hacer hover", () => {
        const { container } = render(<EtiquetaDeslizante texto="Inicio" />);
        const caja = container.firstElementChild as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(caja, 58, 58);
        fijarMedidas(interior, 40, 40);
        fireEvent.mouseEnter(caja);
        expect(interior.style.transform).toBe("translateX(0px)");
        expect(interior.style.textOverflow).toBe("ellipsis");
    });

    it("texto desbordado desliza con desplazamiento negativo y sin elipsis", () => {
        const { container } = render(<EtiquetaDeslizante texto="Librería central de documentos" />);
        const caja = container.firstElementChild as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(interior, 160, 160);
        fijarMedidas(caja, 58, 58);
        fireEvent.mouseEnter(caja);
        // desborde = 160 - 58 = 102
        expect(interior.style.transform).toBe("translateX(-102px)");
        expect(interior.style.textOverflow).toBe("clip");
        // duración = max(1.2, 102/40 = 2.55) s con pausa inicial de 0.35 s
        expect(interior.style.transition).toContain("2.55s");
        expect(interior.style.transition).toContain("0.35s");
    });

    it("al salir el cursor vuelve a 0 y reaparece la elipsis", () => {
        const { container } = render(<EtiquetaDeslizante texto="Nombre muy largo del módulo" />);
        const caja = container.firstElementChild as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(interior, 120, 120);
        fijarMedidas(caja, 58, 58);
        fireEvent.mouseEnter(caja);
        expect(interior.style.transform).toBe("translateX(-62px)");
        fireEvent.mouseLeave(caja);
        expect(interior.style.transform).toBe("translateX(0px)");
        expect(interior.style.textOverflow).toBe("ellipsis");
    });

    it("con prefers-reduced-motion no desliza aunque desborde", () => {
        mediaMock(true, true);
        const { container } = render(<EtiquetaDeslizante texto="Etiqueta larga sin movimiento" />);
        const caja = container.firstElementChild as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(interior, 120, 120);
        fijarMedidas(caja, 58, 58);
        fireEvent.mouseEnter(caja);
        expect(interior.style.transform).toBe("translateX(0px)");
        expect(interior.style.textOverflow).toBe("ellipsis");
    });

    it("sin puntero (táctil) no desliza", () => {
        mediaMock(false, false);
        const { container } = render(<EtiquetaDeslizante texto="Etiqueta larga en móvil" />);
        const caja = container.firstElementChild as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(interior, 120, 120);
        fijarMedidas(caja, 58, 58);
        fireEvent.mouseEnter(caja);
        expect(interior.style.transform).toBe("translateX(0px)");
    });

    it("el foco de teclado en el grupo desliza; focusout regresa", () => {
        const { container, getByRole } = render(
            <div className="group">
                <button type="button">icono</button>
                <EtiquetaDeslizante texto="Etiqueta larga con foco" />
            </div>
        );
        const caja = container.querySelector("span") as HTMLElement;
        const interior = caja.firstElementChild as HTMLElement;
        fijarMedidas(interior, 120, 120);
        fijarMedidas(caja, 58, 58);
        act(() => {
            getByRole("button").focus();
        });
        expect(interior.style.transform).toBe("translateX(-62px)");
        act(() => {
            getByRole("button").blur();
        });
        expect(interior.style.transform).toBe("translateX(0px)");
    });
});
