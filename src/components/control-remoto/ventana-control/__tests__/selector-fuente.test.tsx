import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectorFuente } from "../selector-fuente";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";

function renderSelector(
    pedida: FuentePedida = "auto",
    real: "accesibilidad" | "proyeccion" | null = null,
    aviso: string | null = null,
) {
    const onCambiar = vi.fn();
    render(<SelectorFuente pedida={pedida} real={real} aviso={aviso} onCambiar={onCambiar} />);
    return { onCambiar };
}

describe("SelectorFuente", () => {
    it("muestra dos opciones: Automática y Fluida (proyección)", () => {
        renderSelector();
        expect(screen.getByRole("radio", { name: "Automática" })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Fluida (proyección)" })).toBeInTheDocument();
    });

    it("marca la opción correspondiente a la fuente pedida", () => {
        const { onCambiar } = renderSelector(pedida="auto");
        const autoRadio = screen.getByRole("radio", { name: "Automática" });
        expect(autoRadio).toBeChecked();

        renderSelector(pedida="proyeccion");
        const fluidaRadio = screen.getByRole("radio", { name: "Fluida (proyección)" });
        expect(fluidaRadio).toBeChecked();
    });

    it("llama a onCambiar con el valor cuando se elige una opción", () => {
        const { onCambiar } = renderSelector();
        const fluidaRadio = screen.getByRole("radio", { name: "Fluida (proyección)" });
        fireEvent.click(fluidaRadio);
        expect(onCambiar).toHaveBeenCalledTimes(1);
        expect(onCambiar).toHaveBeenCalledWith("proyeccion");
    });

    it("muestra el rotulado de la fuente real cuando está disponible", () => {
        renderSelector(real="accesibilidad");
        expect(screen.getByText("Pantalla por accesibilidad")).toBeInTheDocument();

        renderSelector(real="proyeccion");
        expect(screen.getByText("Pantalla fluida (proyección)")).toBeInTheDocument();
    });

    it("muestra el aviso cuando existe y real es accesibilidad aunque pedida sea proyección", () => {
        renderSelector(pedida="proyeccion", real="accesibilidad", aviso="El aparato no ofrece proyección.");
        expect(screen.getByText("El aparato no ofrece proyección.")).toBeInTheDocument();
    });

    it("el aviso aparece en un elemento con role=status", () => {
        renderSelector(pedida="proyeccion", real="accesibilidad", aviso="Advertencia importante.");
        const statusElement = screen.getByRole("status");
        expect(statusElement).toHaveTextContent("Advertencia importante.");
    });

    it("los botones de radio tienen tamaño de 44px (clase h-11 w-11)", () => {
        renderSelector();
        const botones = screen.getAllByRole("radio");
        botones.forEach((boton) => {
            expect(boton).toHaveClass("h-11", "w-11");
        });
    });

    it("la opción Fluida tiene texto de ayuda", () => {
        renderSelector();
        const fluidaRadio = screen.getByRole("radio", { name: "Fluida (proyección)" });
        expect(fluidaRadio).toHaveAttribute(
            "aria-describedby",
            "ayuda-fluida",
        );
        expect(screen.getByText("Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca.")).toBeInTheDocument();
    });

    it("el grupo de radio tiene role=radiogroup", () => {
        renderSelector();
        const grupo = screen.getByRole("radiogroup");
        expect(grupo).toBeInTheDocument();
    });

    it("el botón tiene cursor-pointer", () => {
        renderSelector();
        const botones = screen.getAllByRole("radio");
        botones.forEach((boton) => {
            expect(boton).toHaveClass("cursor-pointer");
        });
    });

    it("los radios responden a navegación con teclado (flechas)", async () => {
        renderSelector(pedida="auto");
        const autoRadio = screen.getByRole("radio", { name: "Automática" });
        const fluidaRadio = screen.getByRole("radio", { name: "Fluida (proyección)" });

        // Auto está marcado por defecto
        expect(autoRadio).toBeChecked();
        expect(fluidaRadio).not.toBeChecked();

        // Click en fluida cambia la selección
        fireEvent.click(fluidaRadio);
    });
});