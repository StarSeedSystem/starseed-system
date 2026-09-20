import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FloatingMenuButton } from "../floating-menu-button";

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

describe("FloatingMenuButton · gestos y pointer events iOS", () => {
    beforeEach(() => {
        HTMLButtonElement.prototype.setPointerCapture = vi.fn();
        HTMLButtonElement.prototype.releasePointerCapture = vi.fn();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
    });

    it("un tap corto abre o cierra el menú", () => {
        const onToggle = vi.fn();
        render(<FloatingMenuButton isOpen={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Abrir menú" });

        fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerUp(button, { pointerId: 1, clientX: 100, clientY: 100 });

        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("llama a setPointerCapture con el pointerId en pointerdown", () => {
        const onToggle = vi.fn();
        render(<FloatingMenuButton isOpen={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Abrir menú" });

        fireEvent.pointerDown(button, { pointerId: 42, clientX: 50, clientY: 50 });

        expect(button.setPointerCapture).toHaveBeenCalledWith(42);
    });

    it("pointerdown mantenido 400 ms entra en modo selección sin disparar selectstart", () => {
        const onToggle = vi.fn();
        const selectStartSpy = vi.fn();
        window.addEventListener("selectstart", selectStartSpy);

        render(<FloatingMenuButton isOpen={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Abrir menú" });

        fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });

        act(() => {
            vi.advanceTimersByTime(400);
        });

        expect(button.getAttribute("data-selecting")).toBe("true");
        expect(selectStartSpy).not.toHaveBeenCalled();

        window.removeEventListener("selectstart", selectStartSpy);
    });

    it("pointerdown llama a preventDefault para evitar la selección de texto en iOS", () => {
        const onToggle = vi.fn();
        render(<FloatingMenuButton isOpen={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Abrir menú" });

        const eventNotCancelled = fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });
        expect(eventNotCancelled).toBe(false);
    });

    it("pointercancel limpia el estado y cancela la selección", () => {
        const onToggle = vi.fn();
        render(<FloatingMenuButton isOpen={false} onToggle={onToggle} />);
        const button = screen.getByRole("button", { name: "Abrir menú" });

        fireEvent.pointerDown(button, { pointerId: 1, clientX: 100, clientY: 100 });

        act(() => {
            vi.advanceTimersByTime(400);
        });

        expect(button.getAttribute("data-selecting")).toBe("true");

        fireEvent.pointerCancel(button, { pointerId: 1 });

        expect(button.getAttribute("data-selecting")).toBeNull();
        expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    });
});
