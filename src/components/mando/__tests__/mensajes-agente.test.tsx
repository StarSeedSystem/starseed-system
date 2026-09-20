import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MensajesAgente } from "../mensajes-agente";

describe("MensajesAgente", () => {
    afterEach(() => {
        cleanup();
    });

    it("renderiza la caja de mensajes al agente", () => {
        render(<MensajesAgente agenteId="AG-2_349" />);
        expect(screen.getByTestId("mensajes-agente")).toBeInTheDocument();
        expect(screen.getByText("Mensajes al agente")).toBeInTheDocument();
        expect(screen.getByText(/no se interrumpe nada/i)).toBeInTheDocument();
    });
});
