"use client";

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { NavegacionPestanasMetaGenesis } from "../navegacion-pestanas-metagenesis";

const pestanasMock = [
    { id: "tab-1", etiqueta: "Pestaña 1", grupo: "Trabajo" },
    { id: "tab-2", etiqueta: "Pestaña 2", grupo: "Trabajo" },
    { id: "tab-3", etiqueta: "Pestaña 3", grupo: "Publicación" },
] as const;

const gruposMock = ["Trabajo", "Publicación"] as const;

const montar = (ui: React.ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

describe("NavegacionPestanasMetaGenesis", () => {
    it("monta las pestañas sin error de Radix TabsList", () => {
        const alCambiarPestana = vi.fn();
        const alAlternarPliegue = vi.fn();

        expect(() => {
            montar(
                <NavegacionPestanasMetaGenesis
                    pestanas={pestanasMock}
                    grupos={gruposMock}
                    pestanaActiva="tab-1"
                    alCambiarPestana={alCambiarPestana}
                    etiquetaPliegue="Plegar"
                    todoPlegado={false}
                    alAlternarPliegue={alAlternarPliegue}
                />,
            );
        }).not.toThrow();

        expect(screen.getByTestId("navegacion-pestanas-metagenesis")).toBeInTheDocument();
    });

    it("cambia de panel al hacer clic en una pestaña", async () => {
        const alCambiarPestana = vi.fn();
        const alAlternarPliegue = vi.fn();

        montar(
            <NavegacionPestanasMetaGenesis
                pestanas={pestanasMock}
                grupos={gruposMock}
                pestanaActiva="tab-1"
                alCambiarPestana={alCambiarPestana}
                etiquetaPliegue="Plegar"
                todoPlegado={false}
                alAlternarPliegue={alAlternarPliegue}
            />,
        );

        const pestana2 = screen.getByRole("tab", { name: "Pestaña 2" });
        await userEvent.click(pestana2);

        await waitFor(() => {
            expect(alCambiarPestana).toHaveBeenCalledWith("tab-2");
        });
    });

    it("muestra solo pestañas del grupo seleccionado", () => {
        const alCambiarPestana = vi.fn();
        const alAlternarPliegue = vi.fn();

        montar(
            <NavegacionPestanasMetaGenesis
                pestanas={pestanasMock}
                grupos={gruposMock}
                pestanaActiva="tab-1"
                alCambiarPestana={alCambiarPestana}
                etiquetaPliegue="Plegar"
                todoPlegado={false}
                alAlternarPliegue={alAlternarPliegue}
            />,
        );

        const tabs = screen.getAllByRole("tab");
        expect(tabs).toHaveLength(2);
        expect(tabs[0]).toHaveTextContent("Pestaña 1");
        expect(tabs[1]).toHaveTextContent("Pestaña 2");
        expect(screen.queryByRole("tab", { name: "Pestaña 3" })).not.toBeInTheDocument();
    });

    it("filtra pestañas por búsqueda", () => {
        const alCambiarPestana = vi.fn();
        const alAlternarPliegue = vi.fn();

        montar(
            <NavegacionPestanasMetaGenesis
                pestanas={pestanasMock}
                grupos={gruposMock}
                pestanaActiva="tab-1"
                alCambiarPestana={alCambiarPestana}
                etiquetaPliegue="Plegar"
                todoPlegado={false}
                alAlternarPliegue={alAlternarPliegue}
            />,
        );

        const input = screen.getByPlaceholderText("Buscar sección…");
        fireEvent.change(input, { target: { value: "Pestaña 3" } });

        expect(screen.queryByRole("tab", { name: "Pestaña 1" })).not.toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Pestaña 2" })).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Pestaña 3" })).toBeInTheDocument();
    });
});