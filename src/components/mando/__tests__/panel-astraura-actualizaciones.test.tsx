import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PanelAstrauraActualizaciones } from "../panel-astraura-actualizaciones";

describe("PanelAstrauraActualizaciones", () => {
  afterEach(() => {
    cleanup();
  });

  it("se renderiza sin crash y muestra los 4 sistemas", () => {
    render(<PanelAstrauraActualizaciones />);
    expect(screen.getByTestId("panel-astraura-actualizaciones")).toBeInTheDocument();
    expect(screen.getByText("Needle 3")).toBeInTheDocument();
    expect(screen.getByText("BitNet 1.58")).toBeInTheDocument();
    expect(screen.getByText("Adaptador colectivo")).toBeInTheDocument();
    expect(screen.getByText("Repo Astraura")).toBeInTheDocument();
  });

  it("muestra avisos pendientes cuando existen", () => {
    render(
      <PanelAstrauraActualizaciones
        estados={{
          needle: { siguiente_mayor: { needle4: true } },
          bitnet: { avisos: ["Motor BitNet con nuevos commits"] },
          manifiesto: { estado: "rechazado" },
        }}
      />
    );
    expect(screen.getByText("Avisos de actualización pendientes")).toBeInTheDocument();
    expect(screen.getByText("• Needle 4 disponible en PyPI para actualización mayor")).toBeInTheDocument();
    expect(screen.getByText("• Adaptador colectivo rechazado por el set dorado")).toBeInTheDocument();
  });

  it("muestra el estado del último ciclo nocturno", () => {
    const log = "2026-09-20 04:10:00 Adaptador publicado con éxito";
    render(<PanelAstrauraActualizaciones estados={{ logAprendizaje: log }} />);
    expect(screen.getAllByText("Último ciclo nocturno")[0]).toBeInTheDocument();
    expect(screen.getByText("publicado")).toBeInTheDocument();
  });
});
