import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

describe("AjustesSeguridad y AjustesSync", () => {
  it("renders privacy options and security notice", () => {
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <AjustesSeguridad 
            valor={{ privacidad: "privado", cifradoLocal: false, acceso: [] }} 
          />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    expect(screen.getByText("Privado")).toBeInTheDocument();
    expect(screen.getByText("Cifrado local")).toBeInTheDocument();
    expect(screen.getByText("Lista de acceso")).toBeInTheDocument();
  });

  it("renders direction and destinations", () => {
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <AjustesSync 
            valor={{ direccion: "ambas", auto: true, destinos: [] }} 
          />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    expect(screen.getByText("Vinculación y sincronización")).toBeInTheDocument();
    expect(screen.getByText("Dirección")).toBeInTheDocument();
    expect(screen.getByText("Destinos")).toBeInTheDocument();
  });
});