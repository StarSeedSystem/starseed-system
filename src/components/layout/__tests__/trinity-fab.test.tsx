import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TrinityFab, writeTrinityFabPref } from "../trinity-fab";
import { PerimeterProvider } from "@/context/perimeter-context";

describe("TrinityFab · gestos y pointer events iOS", () => {
    beforeEach(() => {
        HTMLDivElement.prototype.setPointerCapture = vi.fn();
        HTMLDivElement.prototype.releasePointerCapture = vi.fn();
        HTMLButtonElement.prototype.setPointerCapture = vi.fn();
        HTMLButtonElement.prototype.releasePointerCapture = vi.fn();
        writeTrinityFabPref("on");
        vi.useFakeTimers();
    });

    afterEach(() => {
        writeTrinityFabPref("auto");
        vi.useRealTimers();
        cleanup();
    });

    it("se renderiza cuando la preferencia es 'on'", () => {
        render(
            <PerimeterProvider>
                <TrinityFab />
            </PerimeterProvider>
        );
        const fabGroup = screen.getByRole("group", { name: /Acceso Trinity/i });
        expect(fabGroup).toBeInTheDocument();
    });

    it("llama a setPointerCapture en pointerdown para capturar gestos en iOS", () => {
        render(
            <PerimeterProvider>
                <TrinityFab />
            </PerimeterProvider>
        );
        const fabGroup = screen.getByRole("group", { name: /Acceso Trinity/i });
        fireEvent.pointerDown(fabGroup, { pointerId: 7, clientX: 100, clientY: 100 });
        expect(fabGroup.setPointerCapture).toHaveBeenCalledWith(7);
    });

    it("un tap en el orbe abre o cierra los pétalos", () => {
        render(
            <PerimeterProvider>
                <TrinityFab />
            </PerimeterProvider>
        );
        const fabGroup = screen.getByRole("group", { name: /Acceso Trinity/i });
        const coreButton = screen.getByRole("button", { name: /Abrir pétalos Trinity/i });

        fireEvent.pointerDown(fabGroup, { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerUp(fabGroup, { pointerId: 1, clientX: 100, clientY: 100 });

        expect(coreButton.getAttribute("aria-expanded")).toBe("true");
    });

    it("pointerdown mantenido entra en modo selección radial sin disparar selectstart", () => {
        const selectStartSpy = vi.fn();
        window.addEventListener("selectstart", selectStartSpy);

        render(
            <PerimeterProvider>
                <TrinityFab />
            </PerimeterProvider>
        );
        const fabGroup = screen.getByRole("group", { name: /Acceso Trinity/i });

        fireEvent.pointerDown(fabGroup, { pointerId: 1, clientX: 100, clientY: 100 });

        act(() => {
            vi.advanceTimersByTime(300);
        });

        const coreButton = screen.getByRole("button", { name: /Cerrar pétalos Trinity/i });
        expect(coreButton.getAttribute("aria-expanded")).toBe("true");
        expect(selectStartSpy).not.toHaveBeenCalled();

        window.removeEventListener("selectstart", selectStartSpy);
    });

    it("pointercancel limpia el gesto y libera pointer capture", () => {
        render(
            <PerimeterProvider>
                <TrinityFab />
            </PerimeterProvider>
        );
        const fabGroup = screen.getByRole("group", { name: /Acceso Trinity/i });

        fireEvent.pointerDown(fabGroup, { pointerId: 5, clientX: 100, clientY: 100 });
        fireEvent.pointerCancel(fabGroup, { pointerId: 5 });

        expect(fabGroup.releasePointerCapture).toHaveBeenCalledWith(5);
    });
});
