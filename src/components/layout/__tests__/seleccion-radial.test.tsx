import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FloatingMenuButton } from "../floating-menu-button";
import {
    indicePorDedo,
    posicionOpcion,
    RADIO_MINIMO_SELECCION,
} from "@/lib/navegacion/seleccion-radial";

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({
        config: {
            mobile: {
                fabPosition: "fixed",
                fabSide: "right",
                fabOffsetX: 16,
                fabOffsetY: 16,
                fabVerticalPosition: "bottom",
                hapticFeedback: false,
                autoHideOnScroll: false,
                showOnDesktop: true,
                swipeToOpen: false,
                gestureThreshold: 50,
            },
        },
        updateSection: vi.fn(),
    }),
}));

describe("selección radial · función pura indicePorDedo", () => {
    it("con 4 opciones, el dedo arriba selecciona la opción 0", () => {
        expect(indicePorDedo(0, -60, 4)).toBe(0);
    });

    it("con 4 opciones, el dedo abajo selecciona la opción 2", () => {
        expect(indicePorDedo(0, 60, 4)).toBe(2);
    });

    it("con 4 opciones, derecha es 1 e izquierda es 3", () => {
        expect(indicePorDedo(60, 0, 4)).toBe(1);
        expect(indicePorDedo(-60, 0, 4)).toBe(3);
    });

    it("dentro del radio mínimo no hay opción resaltada", () => {
        expect(indicePorDedo(3, 3, 4)).toBeNull();
        expect(indicePorDedo(0, RADIO_MINIMO_SELECCION - 1, 4)).toBeNull();
    });

    it("sin opciones o con radio mínimo respetado da null", () => {
        expect(indicePorDedo(60, 0, 0)).toBeNull();
        expect(indicePorDedo(30, 0, 4, 40)).toBeNull();
    });

    it("posicionOpcion coloca la 0 arriba y reparte el círculo en sentido horario", () => {
        expect(posicionOpcion(0, 4, 80)).toEqual({ x: 0, y: -80 });
        expect(posicionOpcion(1, 4, 80)).toEqual({ x: 80, y: 0 });
        expect(posicionOpcion(2, 4, 80)).toEqual({ x: 0, y: 80 });
    });
});

describe("FloatingMenuButton · corona radial con gesto mantener-deslizar-soltar", () => {
    const opciones = [
        { id: "inicio", etiqueta: "Inicio" },
        { id: "crear", etiqueta: "Crear" },
        { id: "perfil", etiqueta: "Perfil" },
        { id: "ajustes", etiqueta: "Ajustes" },
    ];

    beforeEach(() => {
        HTMLButtonElement.prototype.setPointerCapture = vi.fn();
        HTMLButtonElement.prototype.releasePointerCapture = vi.fn();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
    });

    function abrirCorona(button: HTMLElement) {
        fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });
        act(() => {
            vi.advanceTimersByTime(400);
        });
    }

    it("mantener pulsado abre la corona donde está el dedo", () => {
        const onToggle = vi.fn();
        render(
            <FloatingMenuButton
                isOpen={false}
                onToggle={onToggle}
                opciones={opciones}
                onOptionSelect={vi.fn()}
            />
        );
        const button = screen.getByRole("button", { name: "Abrir menú" });
        abrirCorona(button);

        const corona = screen.getByTestId("corona-radial");
        expect(corona.style.left).toBe("100px");
        expect(corona.style.top).toBe("100px");
        expect(screen.getByTestId("opcion-radial-inicio")).toBeInTheDocument();
    });

    it("deslizar a la derecha y soltar abre esa opción", () => {
        const onToggle = vi.fn();
        const onOptionSelect = vi.fn();
        render(
            <FloatingMenuButton
                isOpen={false}
                onToggle={onToggle}
                opciones={opciones}
                onOptionSelect={onOptionSelect}
            />
        );
        const button = screen.getByRole("button", { name: "Abrir menú" });
        abrirCorona(button);

        fireEvent.pointerMove(button, { pointerId: 1, clientX: 170, clientY: 100 });
        expect(screen.getByTestId("opcion-radial-crear").getAttribute("data-resaltada")).toBe("true");

        fireEvent.pointerUp(button, { pointerId: 1, clientX: 170, clientY: 100 });
        expect(onOptionSelect).toHaveBeenCalledTimes(1);
        expect(onOptionSelect).toHaveBeenCalledWith("crear");
        expect(onToggle).not.toHaveBeenCalled();
        expect(screen.queryByTestId("corona-radial")).toBeNull();
    });

    it("soltar dentro del radio mínimo cierra sin elegir", () => {
        const onToggle = vi.fn();
        const onOptionSelect = vi.fn();
        render(
            <FloatingMenuButton
                isOpen={false}
                onToggle={onToggle}
                opciones={opciones}
                onOptionSelect={onOptionSelect}
            />
        );
        const button = screen.getByRole("button", { name: "Abrir menú" });
        abrirCorona(button);

        fireEvent.pointerMove(button, { pointerId: 1, clientX: 110, clientY: 104 });
        fireEvent.pointerUp(button, { pointerId: 1, clientX: 110, clientY: 104 });

        expect(onOptionSelect).not.toHaveBeenCalled();
        expect(onToggle).not.toHaveBeenCalled();
        expect(screen.queryByTestId("corona-radial")).toBeNull();
    });

    it("pointercancel con la corona abierta cierra sin hacer nada", () => {
        const onOptionSelect = vi.fn();
        render(
            <FloatingMenuButton
                isOpen={false}
                onToggle={vi.fn()}
                opciones={opciones}
                onOptionSelect={onOptionSelect}
            />
        );
        const button = screen.getByRole("button", { name: "Abrir menú" });
        abrirCorona(button);

        fireEvent.pointerMove(button, { pointerId: 1, clientX: 100, clientY: 30 });
        fireEvent.pointerCancel(button, { pointerId: 1 });

        expect(onOptionSelect).not.toHaveBeenCalled();
        expect(screen.queryByTestId("corona-radial")).toBeNull();
    });
});
