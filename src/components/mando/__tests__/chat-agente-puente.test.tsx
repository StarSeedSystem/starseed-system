import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ChatAgentePuente } from "../chat-agente-puente";

describe("ChatAgentePuente", () => {
  afterEach(() => {
    cleanup();
  });

  it("renderiza el chat del Agente Puente en modo panel", () => {
    render(<ChatAgentePuente modo="panel" />);
    expect(screen.getByTestId("chat-agente-puente")).toBeInTheDocument();
    expect(screen.getByText("Agente Puente")).toBeInTheDocument();
  });

  it("renderiza en modo flotante con botón de cerrar", () => {
    let cerrado = false;
    render(<ChatAgentePuente modo="flotante" onCerrar={() => { cerrado = true; }} />);
    expect(screen.getByTestId("chat-agente-puente")).toBeInTheDocument();
    const btnCerrar = screen.getByTitle("Cerrar");
    expect(btnCerrar).toBeInTheDocument();
    btnCerrar.click();
    expect(cerrado).toBe(true);
  });
});
