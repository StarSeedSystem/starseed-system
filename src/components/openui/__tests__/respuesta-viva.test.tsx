import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RespuestaViva } from "../respuesta-viva";

describe("RespuestaViva", () => {
  it("muestra texto plano cuando no parece OpenUI Lang", () => {
    render(<RespuestaViva texto="Hola, esto es un mensaje normal." />);
    expect(screen.getByText("Hola, esto es un mensaje normal.")).toBeDefined();
  });

  it("renderiza componentes OpenUI cuando la sintaxis es válida", () => {
    render(<RespuestaViva texto='root = Tarjeta("Título", "Contenido")' />);
    expect(screen.getByText("Título")).toBeDefined();
  });

  it("muestra el texto crudo cuando el Renderer falla (sintaxis inválida)", () => {
    const textoInvalido = 'root = Tarjeta("Test"';
    render(<RespuestaViva texto={textoInvalido} />);
    expect(screen.getByText("Título")).toBeDefined();
  });
});