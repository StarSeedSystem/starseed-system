import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { TarjetaVariacion } from "../tarjeta-variacion";

const render = (ui: ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

afterEach(cleanup);

const variacion = {
  id: "1",
  titulo: "Cristal suave",
  descripcion: "Una variación con efecto cristal",
  version: "1.0.0",
  familia: "widget",
  licencia: "MIT",
  etiquetas: ["cristal", "suave"],
  valoracionMedia: 4.5,
  valoracionCount: 3,
};

describe("TarjetaVariacion", () => {
  it("muestra el título y descripción de la variación", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    expect(screen.getByText("Cristal suave")).toBeTruthy();
    expect(screen.getByText("Una variación con efecto cristal")).toBeTruthy();
  });

  it("muestra la valoración y la licencia", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    expect(screen.getByText("4.5 (3)")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
  });

  it("muestra las etiquetas como píldoras", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    expect(screen.getByText("cristal")).toBeTruthy();
    expect(screen.getByText("suave")).toBeTruthy();
  });

  it("muestra la versión cuando está disponible", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    expect(screen.getByText("v1.0.0")).toBeTruthy();
  });

  it("tiene botón Probar", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    const btnProbar = screen.getByRole("button", { name: /probar/i });
    expect(btnProbar).toBeTruthy();
  });

  it("tiene botón Aplicar", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    const btnAplicar = screen.getByRole("button", { name: /aplicar/i });
    expect(btnAplicar).toBeTruthy();
  });

  it("tiene botón Ver origen", () => {
    render(<TarjetaVariacion variacion={variacion} clave="widget:clima" />);
    const btnVerOrigen = screen.getByRole("button", { name: /ver origen/i });
    expect(btnVerOrigen).toBeTruthy();
  });
});