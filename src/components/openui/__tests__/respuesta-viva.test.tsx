import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ActionEvent } from "@openuidev/react-lang";
import { describe, expect, it, vi } from "vitest";
import { RespuestaViva } from "../respuesta-viva";

vi.mock("@/lib/openui/detectar", () => ({
  pareceOpenUI: vi.fn((texto: string) => texto.includes("root =") && texto.includes("(")),
}));

describe("RespuestaViva", () => {
  it("pinta texto normal cuando no es OpenUI Lang", () => {
    const texto = "Esta es una respuesta normal sin componentes";
    const { container } = render(<RespuestaViva texto={texto} enCurso={false} />);
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("pinta OpenUI Lang válido con el Renderer", () => {
    const texto = 'root = Tarjeta("Título", "Texto de apoyo")';
    const { container } = render(<RespuestaViva texto={texto} enCurso={false} onAccion={undefined} />);
    expect(container).toBeTruthy();
  });

  it("llama onAccion cuando se dispara una acción", () => {
    const texto = 'root = Accion("Botón de acción", "mi-accion.id")';
    const eventos: ActionEvent[] = [];
    const handleAccion = (evento: ActionEvent) => eventos.push(evento);

    const { container } = render(
      <RespuestaViva texto={texto} enCurso={false} onAccion={handleAccion} />
    );
    expect(container).toBeTruthy();
  });

  it("maneja el estado de streaming sin errores", () => {
    const texto = "Texto simple";
    const { rerender } = render(
      <RespuestaViva texto={texto} enCurso={true} onAccion={undefined} />
    );
    expect(screen.getByText(texto)).toBeInTheDocument();
    rerender(<RespuestaViva texto={texto} enCurso={false} onAccion={undefined} />);
    expect(screen.getByText(texto)).toBeInTheDocument();
  });

  it("muestra texto como fallback cuando pareceOpenUI devuelve falso", () => {
    const texto = "Este texto no parece OpenUI Lang";
    const { container } = render(<RespuestaViva texto={texto} enCurso={false} />);
    expect(container.querySelector("p")).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
  });
});