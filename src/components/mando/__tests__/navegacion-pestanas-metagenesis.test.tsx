import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { AppearanceProvider } from "@/context/appearance-context";
import { NavegacionPestanasMetaGenesis } from "../navegacion-pestanas-metagenesis";

const pestanasBase = [
    { id: "t1", etiqueta: "Tab 1", grupo: "Grupo A" },
    { id: "t2", etiqueta: "Tab 2", grupo: "Grupo A" },
    { id: "t3", etiqueta: "Tab 3", grupo: "Grupo B" },
];

const propsBase = {
    pestanas: pestanasBase,
    grupos: ["Grupo A", "Grupo B"],
    pestanaActiva: "t1",
    alCambiarPestana: vi.fn(),
    etiquetaPliegue: "Plegar",
    todoPlegado: false,
    alAlternarPliegue: vi.fn(),
};

const renderWithProvider = (ui: React.ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

describe("NavegacionPestanasMetaGenesis", () => {
    it("monta sin error de Radix cuando la búsqueda no devuelve resultados", async () => {
        renderWithProvider(
            <NavegacionPestanasMetaGenesis
                {...propsBase}
                pestanaActiva="t1"
            />,
        );

        // Buscar algo que no existe
        const input = screen.getByPlaceholderText("Buscar sección…");
        await userEvent.type(input, "inexistente");

        // No debe lanzar error de Radix (TabsList sin TabsTrigger)
        expect(screen.getByText("Sin secciones para «inexistente».")).toBeInTheDocument();
    });

    it("cambia de panel al hacer clic en una pestaña", async () => {
        const user = userEvent.setup();
        renderWithProvider(<NavegacionPestanasMetaGenesis {...propsBase} />);

        const tab2 = screen.getByText("Tab 2");
        await user.click(tab2);

        expect(propsBase.alCambiarPestana).toHaveBeenCalledWith("t2");
    });

    it("renderiza TabsList con triggers cuando hay pestañas visibles y vacío cuando no", async () => {
        renderWithProvider(
            <NavegacionPestanasMetaGenesis
                {...propsBase}
                pestanaActiva="t1"
            />,
        );

        // Con pestañas visibles, TabsList debe estar presente con triggers
        const tabsList = screen.getByRole("tablist");
        expect(tabsList).toBeInTheDocument();
        // Los triggers están en el tablist, usar getByRole para ser específico
        expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();

        // Buscar algo que no existe
        const input = screen.getByPlaceholderText("Buscar sección…");
        await userEvent.type(input, "inexistente");

        // TabsList sigue renderizado pero sin triggers (solo mensaje de vacío)
        expect(screen.getByRole("tablist")).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: "Tab 1" })).not.toBeInTheDocument();
        expect(screen.getByText("Sin secciones para «inexistente».")).toBeInTheDocument();
    });
});