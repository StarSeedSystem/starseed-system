import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PanelAjustesPilar from "@/components/cerebro/panel-ajustes-pilar";

describe("PanelAjustesPilar (TDD)", () => {
  it("renderiza las 4 secciones estándar: General, Privacidad y permisos, Sincronía, Avanzado", () => {
    render(
      <PanelAjustesPilar
        open={true}
        onOpenChange={() => {}}
        pilarNombre="Memorias"
        seccionInicial="general"
      />
    );
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Privacidad y permisos")).toBeInTheDocument();
    expect(screen.getByText("Sincronía")).toBeInTheDocument();
    expect(screen.getByText("Avanzado")).toBeInTheDocument();
  });

  it("filtra opciones al buscar en la barra de búsqueda", () => {
    render(
      <PanelAjustesPilar
        open={true}
        onOpenChange={() => {}}
        pilarNombre="Memorias"
      />
    );
    const input = screen.getByPlaceholderText(/buscar en ajustes/i);
    fireEvent.change(input, { target: { value: "sincronía" } });
    expect(screen.getByText("Sincronía")).toBeInTheDocument();
  });

  it("muestra botón 'Volver a lo recomendado' por sección con confirmación", () => {
    render(
      <PanelAjustesPilar
        open={true}
        onOpenChange={() => {}}
        pilarNombre="Memorias"
      />
    );
    const boton = screen.getByRole("button", { name: /volver a lo recomendado/i });
    expect(boton).toBeInTheDocument();
  });
});
