import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RespuestaViva } from "../respuesta-viva";
import { pareceOpenUI } from "@/lib/openui/detectar";

vi.mock("@openuidev/react-lang", () => ({
  Renderer: vi.fn(() => null),
  ActionEvent: undefined,
  OpenUIError: undefined,
}));

vi.mock("@/lib/openui/biblioteca", () => ({
  biblioteca: {
    root: "Tarjeta",
    components: {
      Tarjeta: {
        name: "Tarjeta",
        description: "Tarjeta",
      },
    },
    actions: [],
  },
}));

vi.mock("@/lib/openui/detectar", () => ({
  pareceOpenUI: vi.fn(),
}));

describe("RespuestaViva", () => {
  it("renderiza texto normal como texto", () => {
    (pareceOpenUI as any).mockReturnValue(false);
    render(<RespuestaViva texto="Hola mundo" />);
    expect(screen.getByText("Hola mundo")).toBeDefined();
  });

  it("pinta texto plano si pareceOpenUI retorna false", () => {
    (pareceOpenUI as any).mockReturnValue(false);
    render(<RespuestaViva texto="Texto simple" />);
    expect(screen.getByText("Texto simple")).toBeDefined();
  });

  it("llama al Renderer cuando pareceOpenUI retorna true", () => {
    (pareceOpenUI as any).mockReturnValue(true);
    const codigo = "root = Tarjeta(titulo: \"Test\")";
    render(<RespuestaViva texto={codigo} />);
  });

  it("pinta texto como streaming cuando enCurso es true", () => {
    (pareceOpenUI as any).mockReturnValue(true);
    render(<RespuestaViva texto="root = Tarjeta(titulo: Test)" enCurso={true} />);
  });
});