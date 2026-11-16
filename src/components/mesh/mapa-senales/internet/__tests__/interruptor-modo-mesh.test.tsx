import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InterruptorModoMesh } from "../interruptor-modo-mesh";

describe("InterruptorModoMesh", () => {
  const mockTextos = {
    meshTitulo: "Modo Mesh",
    meshAyuda: "Configura la red en malla",
    meshSinLimite: "Sin límite",
    meshConLimite: (mb: number) => `Con límite ${mb} MB`,
    audMiCuenta: "Mi Cuenta",
    audEntidad: "Entidad",
    audPublico: "Público",
    mb: "MB",
    gb: "GB",
  };

  it("cambia el estado del interruptor de modo mesh", () => {
    const onCambiar = vi.fn();
    render(
      <InterruptorModoMesh
        audiencia="cuenta"
        valor={{ habilitado: false, topeMb: 100 }}
        onCambiar={onCambiar}
        textos={mockTextos}
      />
    );
    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);
    expect(onCambiar).toHaveBeenCalledWith({ habilitado: true, topeMb: 100 });
  });

  it("conserva el tope al apagar el interruptor", () => {
    const onCambiar = vi.fn();
    render(
      <InterruptorModoMesh
        audiencia="cuenta"
        valor={{ habilitado: true, topeMb: 500 }}
        onCambiar={onCambiar}
        textos={mockTextos}
      />
    );
    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);
    expect(onCambiar).toHaveBeenCalledWith({ habilitado: false, topeMb: 500 });
  });

  it("cambia entre sin límite y con límite", () => {
    const onCambiar = vi.fn();
    render(
      <InterruptorModoMesh
        audiencia="cuenta"
        valor={{ habilitado: true, topeMb: 0 }}
        onCambiar={onCambiar}
        textos={mockTextos}
      />
    );
    const radio = screen.getByLabelText(/Con límite/);
    fireEvent.click(radio);
    expect(onCambiar).toHaveBeenCalledWith({ habilitado: true, topeMb: 1024 });
  });

  it("muestra el rótulo de la audiencia", () => {
    render(
      <InterruptorModoMesh
        audiencia="entidad"
        valor={{ habilitado: false, topeMb: 0 }}
        onCambiar={() => {}}
        textos={mockTextos}
      />
    );
    expect(screen.getByText(/Entidad/)).toBeDefined();
  });
});
