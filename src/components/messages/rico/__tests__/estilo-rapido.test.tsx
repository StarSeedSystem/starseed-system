/**
 * BotonEstiloRapido: punto de «estilo activo», elegir una fuente y «Quitar estilo».
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/messages/vivo/tarjeta-vivo", () => ({ TarjetaVivo: () => null }));

import { BotonEstiloRapido } from "@/components/messages/rico/estilo-rapido";

beforeAll(() => {
    class RO {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
});

afterEach(() => cleanup());

describe("BotonEstiloRapido", () => {
    it("sin estilo no muestra el punto; con estilo sí", () => {
        const { rerender } = render(<BotonEstiloRapido estilo={null} onChange={() => {}} />);
        expect(screen.queryByTestId("punto-estilo")).toBeNull();
        expect(screen.getByRole("button", { name: "Estilo del mensaje" })).toBeTruthy();
        rerender(<BotonEstiloRapido estilo={{ color: "#ffbf00" }} onChange={() => {}} />);
        expect(screen.getByTestId("punto-estilo")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Estilo del mensaje (activo)" })).toBeTruthy();
    });

    it("elige fuente y animación, y quita el estilo", () => {
        const onChange = vi.fn();
        render(<BotonEstiloRapido estilo={{ tamano: 20 }} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "Estilo del mensaje (activo)" }));
        expect(screen.getByText("Así se verá tu mensaje")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Fuente Serif" }));
        expect(onChange).toHaveBeenLastCalledWith({ tamano: 20, fuente: "serif" });
        fireEvent.click(screen.getByRole("button", { name: /Arcoíris/ }));
        expect(onChange).toHaveBeenLastCalledWith({ tamano: 20, animacionTexto: "arcoiris" });
        fireEvent.click(screen.getByRole("button", { name: "Quitar estilo" }));
        expect(onChange).toHaveBeenLastCalledWith(null);
    });
});
