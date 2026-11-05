import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OidoNubeAjuste } from "../oido-nube-ajuste";
import { AppearanceProvider } from "@/context/appearance-context";

describe("OidoNubeAjuste", () => {
  it("alterna el estado de localStorage al hacer click", () => {
    localStorage.removeItem("starseed.oido.nube");
    
    render(
      <AppearanceProvider>
        <OidoNubeAjuste />
      </AppearanceProvider>
    );
    const boton = screen.getByRole("button", { name: /activado/i });
    
    // Apagar
    fireEvent.click(boton);
    expect(localStorage.getItem("starseed.oido.nube")).toBe("0");
    expect(screen.getByRole("button", { name: /apagado/i })).toBeDefined();
    
    // Encender
    fireEvent.click(screen.getByRole("button", { name: /apagado/i }));
    expect(localStorage.getItem("starseed.oido.nube")).toBe("1");
    expect(screen.getByRole("button", { name: /activado/i })).toBeDefined();
  });
});
