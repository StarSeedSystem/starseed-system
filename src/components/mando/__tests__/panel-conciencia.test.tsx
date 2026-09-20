import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { PanelConciencia } from "@/components/mando/panel-conciencia";

describe("PanelConciencia", () => {
  it("renderiza el título y los cuatro bloques principales", () => {
    render(<PanelConciencia />);
    expect(screen.getByText("Conciencia colectiva")).toBeInTheDocument();
    expect(screen.getByText("Capas de decisión")).toBeInTheDocument();
    expect(screen.getByText("Nodos colectivos (CC2)")).toBeInTheDocument();
    expect(screen.getByText("Experiencias y Calibración Jev")).toBeInTheDocument();
    expect(screen.getByText("Adaptador colectivo")).toBeInTheDocument();
  });

  it("permite ver el comando de entrenamiento al pulsar el botón", () => {
    render(<PanelConciencia />);
    const botones = screen.getAllByRole("button", { name: /Entrenar esta noche/i });
    expect(botones.length).toBeGreaterThan(0);
    fireEvent.click(botones[0]);
    expect(
      screen.getByText("bash scripts/ciclo-aprendizaje-needle.sh")
    ).toBeInTheDocument();
  });
});
