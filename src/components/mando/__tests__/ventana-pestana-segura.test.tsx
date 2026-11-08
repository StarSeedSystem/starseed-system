/**
 * Pruebas del límite de error por ventana de pestaña (SUP0811D).
 *
 * Cada VentanaPestana envuelve a sus hijos en ViewErrorBoundary: si un panel
 * lanza en el render, SOLO ese panel muestra el mensaje de error y el botón
 * "Reintentar"; el resto de Genesis (otras ventanas, cabecera, pestañas) sigue
 * vivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ViewErrorBoundary } from "@/components/education/view-error-boundary";

// Silencia console.error en estas pruebas (ViewErrorBoundary lo usa para diagnóstico).
const silenciaError = vi.spyOn(console, "error").mockImplementation(() => {});

// Toda la red cae: sin procesos, sin disco, sin respuestas.
const sinRed = vi.fn(async () => {
    throw new Error("sin red en las pruebas");
});

// El módulo instala su guardia de lecturas al importarse: se pisa fetch ANTES.
vi.stubGlobal("fetch", sinRed);
const { VentanaPestana, idPlegable } = await import("../centro-mando");

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
});

/** Wrapper con el proveedor de apariencia que usan las pestañas. */
function EnPruebas({ children }: { children: React.ReactNode }) {
    return <AppearanceProvider>{children}</AppearanceProvider>;
}

/** Componente que lanza si `debeRomper.current` es true. */
function PanelControlado({ debeRomper }: { debeRomper: { current: boolean } }) {
    if (debeRomper.current) throw new Error("fallo controlado");
    return <p data-testid="recuperado">ya funciona</p>;
}

describe("VentanaPestana con límite de error (SUP0811D)", () => {
    it("el id de una ventana es estable: genesis.<pestana>.<panel>", () => {
        expect(idPlegable("procesos", "procesos")).toBe("genesis.procesos.procesos");
        expect(idPlegable("capas-red", "capas-red")).toBe("genesis.capas-red.capas-red");
    });

    it("un panel roto no tumba a su hermano: se ve el error en A y el contenido vivo en B", () => {
        const debeRomperA = { current: true };
        function PanelRoto() {
            if (debeRomperA.current) throw new Error("panel roto");
            return <p data-testid="panel-a-reintentado">Panel A recuperado</p>;
        }
        function PanelVivo() {
            return <p data-testid="panel-b">sigo vivo</p>;
        }

        render(
            <EnPruebas>
                <VentanaPestana pestana="test" panel="a" titulo="A">
                    <PanelRoto />
                </VentanaPestana>
                <VentanaPestana pestana="test" panel="b" titulo="B">
                    <PanelVivo />
                </VentanaPestana>
            </EnPruebas>
        );

        // Panel A muestra el mensaje del error boundary
        expect(screen.getByText("No se pudo abrir el panel «A»")).toBeInTheDocument();
        expect(screen.getByText("panel roto")).toBeInTheDocument();
        // Panel B sigue renderizado
        expect(screen.getByTestId("panel-b")).toHaveTextContent("sigo vivo");
    });

    it("ViewErrorBoundary muestra fallback y botón Reintentar cuando el hijo lanza", () => {
        const debeRomper = { current: true };
        render(
            <EnPruebas>
                <ViewErrorBoundary label="el panel de prueba">
                    <PanelControlado debeRomper={debeRomper} />
                </ViewErrorBoundary>
            </EnPruebas>
        );

        expect(screen.getByText("No se pudo abrir el panel de prueba")).toBeInTheDocument();
        expect(screen.getByText("fallo controlado")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    });

    it("ViewErrorBoundary: «Reintentar» vuelve a montar el hijo y este renderiza si ya no lanza", async () => {
        const debeRomper = { current: true };
        render(
            <EnPruebas>
                <ViewErrorBoundary label="el panel de prueba">
                    <PanelControlado debeRomper={debeRomper} />
                </ViewErrorBoundary>
            </EnPruebas>
        );

        // Estado de error
        expect(screen.getByText("No se pudo abrir el panel de prueba")).toBeInTheDocument();

        // Deja de romper y clic en Reintentar
        debeRomper.current = false;
        const botonReintentar = screen.getByRole("button", { name: /reintentar/i });
        fireEvent.click(botonReintentar);

        // Ahora el hijo se renderiza correctamente (esperar al re-montaje)
        await waitFor(() => {
            expect(screen.getByTestId("recuperado")).toHaveTextContent("ya funciona");
        });
        expect(screen.queryByText("No se pudo abrir el panel de prueba")).not.toBeInTheDocument();
    });
});