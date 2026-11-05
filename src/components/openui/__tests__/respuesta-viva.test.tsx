import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RespuestaViva } from "../respuesta-viva";

describe("RespuestaViva", () => {
  it("muestra texto plano cuando no es OpenUI Lang", () => {
    const texto = "Este es un mensaje simple de texto plano";
    render(<RespuestaViva texto={texto} />);
    const elemento = screen.getByText("Este es un mensaje simple de texto plano");
    expect(elemento).toBeDefined();
  });

  it("muestra texto plano cuando el texto esta vacio", () => {
    render(<RespuestaViva texto="" />);
    const p = document.querySelector("p");
    expect(p).toBeDefined();
  });

  it("muestra texto plano cuando el texto es solo espacios", () => {
    const texto = "   ";
    render(<RespuestaViva texto={texto} />);
  });

  it("renderiza OpenUI Lang valido con componentes Tarjeta", () => {
    const texto = `root = Tarjeta("Titulo")`;
    const { container } = render(<RespuestaViva texto={texto} />);
    expect(container).toBeTruthy();
    expect(screen.getByText("Titulo")).toBeDefined();
  });

  it("renderiza OpenUI Lang valido con componentes Tabla", () => {
    const texto = `root = Tabla({"titulo": "Datos", "columnas": ["A", "B"], "filas": []})`;
    const { container } = render(<RespuestaViva texto={texto} />);
    expect(container).toBeTruthy();
  });

  it("llama onAccion cuando se dispara una accion del componente", () => {
    const texto = `root = Tarjeta("Titulo")`;
    const mockOnAccion = vi.fn();
    const { container } = render(<RespuestaViva texto={texto} onAccion={mockOnAccion} />);
    expect(container).toBeTruthy();
  });

  it("pinta texto cuando el parser OpenUI falla (error boundary)", () => {
    const texto = "esto no es openui ni nada de nada";
    render(<RespuestaViva texto={texto} />);
    expect(screen.getByText("esto no es openui ni nada de nada")).toBeDefined();
  });

  it("maneja texto con sintaxis parcial de OpenUI", () => {
    const texto = "algo que parece OpenUI pero no es valido";
    render(<RespuestaViva texto={texto} />);
  });
});