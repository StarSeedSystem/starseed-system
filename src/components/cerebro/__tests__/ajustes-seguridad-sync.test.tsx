import { render, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import React from "react";
import '@testing-library/jest-dom';

const AjustesSeguridad = ({ valor }: { valor: any }) => (
  <div>
    <div>Privado</div>
    <div>Cifrado local</div>
    <div>Lista de acceso</div>
  </div>
);

const AjustesSync = ({ valor }: { valor: any }) => (
  <div>
    <div>Vinculación y sincronización</div>
    <div>Dirección</div>
    <div>Destinos</div>
  </div>
);

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