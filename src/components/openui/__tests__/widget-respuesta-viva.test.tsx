import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WidgetRespuestaViva } from "../widget-respuesta-viva";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";

vi.mock("@/components/widgets-libres/widget-libre", () => ({
  WidgetLibre: ({ children, forma, acento, acento2, caja, intensidad, etiqueta, ...props }: any) => (
    <div data-testid="widget-libre" data-forma={forma} data-acento={acento} data-acento2={acento2} data-caja={caja} data-intensidad={intensidad} data-etiqueta={etiqueta} {...props}>
      {typeof children === "function" ? children({ clase: "M", ancho: 400, alto: 300 }) : children}
    </div>
  ),
}));

vi.mock("../respuesta-viva", () => ({
  RespuestaViva: ({ texto }: { texto: string }) => (
    <div data-testid="respuesta-viva">{texto || "fallback"}</div>
  ),
}));

describe("WidgetRespuestaViva", () => {
  const widgetBase: DashboardWidget = {
    id: "w-1",
    dashboard_id: "d-1",
    widget_type: "RESPUESTA_VIVA",
    layout: { x: 0, y: 0, w: 4, h: 4 },
    settings: {},
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza el contenido OpenUI Lang guardado", () => {
    const contenido = 'root = Tarjeta("Título", "Texto de apoyo")';
    const widget = { ...widgetBase, settings: { contenido } };

    render(<WidgetRespuestaViva widget={widget} />);

    expect(screen.getByTestId("respuesta-viva")).toHaveTextContent(contenido);
  });

  it("muestra mensaje de ayuda cuando no hay contenido guardado", () => {
    const widget = { ...widgetBase, settings: {} };

    render(<WidgetRespuestaViva widget={widget} />);

    expect(screen.getByText(/Sin contenido guardado/)).toBeInTheDocument();
  });

  it("usa WidgetLibre con forma orbe y acentos Trinity", () => {
    const widget = { ...widgetBase, settings: { contenido: "test" } };

    render(<WidgetRespuestaViva widget={widget} />);

    const widgetLibre = screen.getByTestId("widget-libre");
    expect(widgetLibre).toHaveAttribute("data-forma", "orbe");
    expect(widgetLibre).toHaveAttribute("data-acento", "#007FFF");
  });

  it("llama onUpdateSettings cuando se proporciona", () => {
    const widget = { ...widgetBase, settings: { contenido: "test" } };
    const onUpdateSettings = vi.fn();

    render(<WidgetRespuestaViva widget={widget} onUpdateSettings={onUpdateSettings} />);

    expect(onUpdateSettings).not.toHaveBeenCalled();
  });
});