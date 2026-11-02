import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelContenidoVivo, type SeleccionContenidoVivo } from "@/components/contenido-vivo/panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

const BASE: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 100,
  topeMes: 100,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

afterEach(cleanup);

describe("PanelContenidoVivo", () => {
  it("con Spline sin conectar ofrece Conectar con su enlace", () => {
    render(<PanelContenidoVivo contexto={BASE} onConfirmar={vi.fn()} />);
    expect(screen.getAllByText("Spline por MCP").length).toBeGreaterThan(0);
    const enlaces = screen.getAllByRole("link", { name: "Conectar" });
    expect(enlaces.some((a) => a.getAttribute("href") === "https://mcp.spline.design/mcp")).toBe(true);
  });

  it("con créditos pide confirmación con el total y no genera sin el sí", () => {
    const contexto: ContextoVivo = {
      ...BASE,
      conectados: ["higgsfield"],
      cupoHoy: { higgsfield: 100 },
    };
    const onConfirmar = vi.fn<(seleccion: SeleccionContenidoVivo) => void>();
    render(<PanelContenidoVivo contexto={contexto} onConfirmar={onConfirmar} />);
    expect(screen.getByText(/Cotización total:/).textContent).toContain("34 créditos");
    fireEvent.click(screen.getByRole("button", { name: /Generar/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Total: 34 créditos");
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Generar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, generar" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar.mock.calls[0][0].totalCreditos).toBe(34);
  });
});
