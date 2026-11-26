import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectorFuente } from "../selector-fuente";

afterEach(() => {
    cleanup();
});

describe("CTL1126C · transición a pantalla fluida", () => {
    it("oculta el botón Fluida cuando ya es proyección en SelectorFuente", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="proyeccion" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const opciones = screen.getAllByRole("radio");
        expect(opciones).toHaveLength(1);
        expect(screen.getByRole("radio", { name: "Automática" })).toBeInTheDocument();
        expect(screen.queryByRole("radio", { name: /Fluida \(proyección\)/i })).not.toBeInTheDocument();
    });

    it("muestra el rótulo de fuente real con modo fluida en SelectorFuente", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="proyeccion" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const realLabel = screen.getByText("Fuente real:");
        expect(realLabel).toBeInTheDocument();
        const fuenteText = screen.getByText("Pantalla fluida (proyección)");
        expect(fuenteText).toBeInTheDocument();
    });

    it("muestra ambas opciones cuando la fuente es accesibilidad", () => {
        const onCambiar = vi.fn();
        render(
            <SelectorFuente
                pedida="auto"
                real="accesibilidad"
                aviso={null}
                onCambiar={onCambiar}
            />,
        );
        const opciones = screen.getAllByRole("radio");
        expect(opciones).toHaveLength(2);
        expect(screen.getByRole("radio", { name: "Automática" })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toBeInTheDocument();
    });

    it("no muestra botón Fluida (proyección) en SelectorFuente cuando real es proyección", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="proyeccion" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const FluidaBtn = screen.queryByRole("radio", { name: /Fluida \(proyección\)/i });
        expect(FluidaBtn).not.toBeInTheDocument();
    });

    it("muestra botón Fluida (proyección) en SelectorFuente cuando real es accesibilidad", () => {
        const onCambiar = vi.fn();
        render(
            <SelectorFuente pedida="auto" real="accesibilidad" aviso={null} onCambiar={onCambiar} />,
        );
        const FluidaBtn = screen.getByRole("radio", { name: /Fluida \(proyección\)/i });
        expect(FluidaBtn).toBeInTheDocument();
    });

    it("aplica FlechaDerecha cambia a proyección cuando hay una sola opción", () => {
        const onCambiar = vi.fn();
        render(<SelectorFuente pedida="auto" real="proyeccion" aviso={null} onCambiar={onCambiar} />);
        const automatica = screen.getByRole("radio", { name: "Automática" });
        fireEvent.keyDown(automatica, { key: "ArrowRight" });
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
    });

    it("flechas cambian de opción cuando hay dos fuentes", () => {
        const onCambiar = vi.fn();
        const { rerender } = render(
            <SelectorFuente pedida="auto" real="accesibilidad" aviso={null} onCambiar={onCambiar} />,
        );
        const automatica = screen.getByRole("radio", { name: "Automática" });
        fireEvent.keyDown(automatica, { key: "ArrowRight" });
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
        expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Fluida (proyección)" }));

        rerender(
            <SelectorFuente pedida="proyeccion" real="accesibilidad" aviso={null} onCambiar={onCambiar} />,
        );
        fireEvent.keyDown(screen.getByRole("radio", { name: "Fluida (proyección)" }), { key: "ArrowLeft" });
        expect(onCambiar).toHaveBeenCalledWith("auto");
    });
});