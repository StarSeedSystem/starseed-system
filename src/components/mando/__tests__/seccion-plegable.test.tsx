import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { SeccionPlegable, usePlegarTodo } from "../seccion-plegable";

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
});

/** Dos secciones de una zona con el botón «Plegar todo / Desplegar todo». */
function Zona() {
    const todo = usePlegarTodo();
    return (
        <div>
            <button type="button" onClick={todo.alternar}>{todo.etiqueta}</button>
            <SeccionPlegable id="fila-agente" titulo="Fila por agente" resumen="3 en curso · 12 pendientes" contador="15">
                <p>contenido por agente</p>
            </SeccionPlegable>
            <SeccionPlegable id="ola-fila" titulo="Fila de la ola" abiertaPorDefecto={false} resumen="ola cerrada">
                <p>contenido de la ola</p>
            </SeccionPlegable>
        </div>
    );
}

describe("SeccionPlegable", () => {
    it("abierta por defecto: children visibles, aria-expanded y al cerrar queda el resumen", () => {
        render(
            <SeccionPlegable id="fila-agente" titulo="Fila por agente" resumen="3 en curso · 12 pendientes" contador="15" acciones={<button type="button">refrescar</button>}>
                <p>contenido por agente</p>
            </SeccionPlegable>,
        );
        expect(screen.getByText("contenido por agente")).toBeInTheDocument();
        expect(screen.getByText("15")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "refrescar" })).toBeInTheDocument();

        const boton = screen.getByRole("button", { name: /Cerrar lista/ });
        expect(boton).toHaveAttribute("aria-expanded", "true");
        expect(boton).toHaveAttribute("aria-controls", "fila-agente-contenido");

        fireEvent.click(boton);
        expect(screen.queryByText("contenido por agente")).not.toBeInTheDocument();
        expect(screen.getByText("3 en curso · 12 pendientes")).toBeInTheDocument();
        const reabrir = screen.getByRole("button", { name: /Abrir lista/ });
        expect(reabrir).toHaveAttribute("aria-expanded", "false");
        expect(reabrir).toHaveAttribute("aria-controls", "fila-agente-contenido");
        expect(window.localStorage.getItem("starseed.seccion-plegable.fila-agente")).toBe("cerrada");
    });

    it("recuerda el estado por id al remontar (y con abiertaPorDefecto distinto)", () => {
        const primera = render(
            <SeccionPlegable id="ola-fila" titulo="Fila de la ola" abiertaPorDefecto={true} resumen="ola resumen">
                <p>contenido de la ola</p>
            </SeccionPlegable>,
        );
        fireEvent.click(screen.getByRole("button", { name: /Cerrar lista/ }));
        primera.unmount();

        render(
            <SeccionPlegable id="ola-fila" titulo="Fila de la ola" abiertaPorDefecto={true} resumen="ola resumen">
                <p>contenido de la ola</p>
            </SeccionPlegable>,
        );
        expect(screen.queryByText("contenido de la ola")).not.toBeInTheDocument();
        expect(screen.getByText("ola resumen")).toBeInTheDocument();
    });

    it("funciona sin localStorage: si getItem falla, usa el defecto y alterna igual", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("acceso denegado");
        });
        render(
            <SeccionPlegable id="bloqueadas" titulo="Bloqueadas y rechazadas" abiertaPorDefecto={false} resumen="2 bloqueadas">
                <p>contenido bloqueadas</p>
            </SeccionPlegable>,
        );
        expect(screen.queryByText("contenido bloqueadas")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Abrir lista/ }));
        expect(screen.getByText("contenido bloqueadas")).toBeInTheDocument();
    });
});

describe("usePlegarTodo", () => {
    it("Plegar todo cierra todas las secciones de la zona y Desplegar todo las abre", () => {
        render(<Zona />);
        expect(screen.getByText("contenido por agente")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Plegar todo" }));
        expect(screen.queryByText("contenido por agente")).not.toBeInTheDocument();
        expect(screen.queryByText("contenido de la ola")).not.toBeInTheDocument();
        expect(screen.getByText("3 en curso · 12 pendientes")).toBeInTheDocument();
        expect(screen.getByText("ola cerrada")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Desplegar todo" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Desplegar todo" }));
        expect(screen.getByText("contenido por agente")).toBeInTheDocument();
        expect(screen.getByText("contenido de la ola")).toBeInTheDocument();
    });
});
