import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FichaAgente } from "../ficha-agente";

describe("FichaAgente", () => {
    afterEach(() => {
        cleanup();
    });

    it("muestra la información de la cabecera del agente y renderiza el modal", () => {
        render(
            <FichaAgente
                agente={{
                    id: "AG-2",
                    tarea: "AG-2",
                    titulo: "Ficha del agente",
                    etapa: "escribiendo",
                    modelo: "claude-3-5-sonnet",
                    proveedor: "anthropic",
                    medio: "hermes",
                    minutos: 5,
                    intento: 1,
                }}
                onCerrar={() => {}}
            />
        );

        expect(screen.getByTestId("ficha-agente-modal")).toBeInTheDocument();
        expect(screen.getByText("Ficha del agente")).toBeInTheDocument();
        expect(screen.getByText("claude-3-5-sonnet")).toBeInTheDocument();
    });
});
