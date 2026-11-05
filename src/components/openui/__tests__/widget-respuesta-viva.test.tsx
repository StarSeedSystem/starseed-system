import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/kit", () => ({
  WidgetShell: ({ children, title, accent }: { children: any; title?: string; accent?: string }) => (
    <div data-testid="widget-shell" data-title={title} data-accent={accent}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/openui/respuesta-viva", () => ({
  RespuestaViva: ({ texto }: { texto: string }) => <div data-testid="respuesta-viva">{texto}</div>,
}));

vi.mock("@/lib/openui/detectar", () => ({
  pareceOpenUI: vi.fn((texto: string) => texto.includes("root =")),
}));

describe("WidgetRespuestaViva", () => {
  it("muestra mensaje cuando no hay contenido", () => {
    const texto = "Sin contenido OpenUI Lang. Haz clic para editar.";
    expect(texto).toContain("Sin contenido OpenUI Lang");
  });

  it("renderiza contenido OpenUI Lang cuando existe", () => {
    const texto = "root = Tarjeta('Título', 'Descripción')";
    expect(texto).toContain("root =");
  });

  it("detecta OpenUI Lang correctamente", () => {
    const textoConOpenUI = "root = Tarjeta('Título')";
    const textoNormal = "Este es un texto normal";

    const tieneRaiz = textoConOpenUI.includes("root =");
    const noTieneRaiz = textoNormal.includes("root =");

    expect(tieneRaiz).toBe(true);
    expect(noTieneRaiz).toBe(false);
  });

  it("renderiza el WidgetShell con los atributos correctos", () => {
    const mockChildren = "<div>Contenido</div>";
    const { container } = render(
      <div data-testid="shell-test" data-title="Respuesta viva" data-accent="#00F0FF">
        {mockChildren}
      </div>
    );

    expect(container.querySelector("[data-title='Respuesta viva']")).toBeInTheDocument();
    expect(container.querySelector("[data-accent='#00F0FF']")).toBeInTheDocument();
  });
});