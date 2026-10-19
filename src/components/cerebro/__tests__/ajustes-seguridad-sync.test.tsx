import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AjustesSeguridad } from "@/components/cerebro/ajustes-seguridad";
import { AjustesSync } from "@/components/cerebro/ajustes-sync";

describe("AjustesSeguridad", () => {
  it("renders privacy options and security notice", () => {
    render(<AjustesSeguridad valor={{ privacidad: "privado", cifradoLocal: false, acceso: [] }} />);
    expect(screen.getByText("Privado")).toBeInTheDocument();
    expect(screen.getByText("Cifrado local")).toBeInTheDocument();
    expect(screen.getByText("Lista de acceso")).toBeInTheDocument();
  });
});

describe("AjustesSync", () => {
  it("renders direction and destinations", () => {
    render(<AjustesSync valor={{ direccion: "ambas", auto: true, destinos: [] }} />);
    expect(screen.getByText("Vinculación y sincronización")).toBeInTheDocument();
    expect(screen.getByText("Dirección")).toBeInTheDocument();
    expect(screen.getByText("Destinos")).toBeInTheDocument();
  });
});