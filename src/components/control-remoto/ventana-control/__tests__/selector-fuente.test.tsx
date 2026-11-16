import { afterEach, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

import { SelectorFuente } from "../selector-fuente";

afterEach(() => {
    cleanup();
});

describe("RST1116A · selector de fuente de pantalla", () => {
    it("ofrece las dos opciones y marca la pedida", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="proyeccion" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const opciones = screen.getAllByRole("radio");
        expect(opciones).toHaveLength(2);
        expect(screen.getByRole("radio", { name: "Automática" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toHaveAttribute("aria-checked", "true");
    });

    it("elegir una opción pide el cambio", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="auto" real="accesibilidad" aviso={null} onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("radio", { name: "Fluida (proyección)" }));
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
    });

    it("enseña la fuente real y el aviso recibido", () => {
        const onCambiar = vi.fn();
        render(
            <SelectorFuente
                pedida="proyeccion"
                real="accesibilidad"
                aviso="El aparato no ofrece la pantalla por proyección."
                onCambiar={onCambiar}
            />,
        );
        expect(screen.getByText("Pantalla por accesibilidad")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("El aparato no ofrece la pantalla por proyección.");
    });

    it("las flechas cambian de opción", () => {
        const onCambiar = vi.fn();
        const { rerender } = render(<SelectorFuente pedida="auto" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const automatica = screen.getByRole("radio", { name: "Automática" });
        fireEvent.keyDown(automatica, { key: "ArrowRight" });
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
        expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Fluida (proyección)" }));

        rerender(<SelectorFuente pedida="proyeccion" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        fireEvent.keyDown(screen.getByRole("radio", { name: "Fluida (proyección)" }), { key: "ArrowLeft" });
        expect(onCambiar).toHaveBeenCalledWith("auto");
    });

    it("explica qué hace la opción fluida", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="auto" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        expect(screen.getByText("Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca")).toBeInTheDocument();
    });

    it("los botones tienen una zona de 44 px", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="auto" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        for (const opcion of screen.getAllByRole("radio")) {
            expect(opcion.className).toContain("min-h-[44px]");
            expect(opcion.className).toContain("min-w-[44px]");
        }
    });
});
