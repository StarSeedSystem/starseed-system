/**
 * Panel «Contenido vivo» (CVV1028, tarea H): solo el componente, con el contexto
 * construido a mano (la capa de rutas ya tiene sus pruebas). Sin red ni voces.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PanelContenidoVivo, type CotizacionViva } from "../panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

function contexto(ajustes: Partial<ContextoVivo>): ContextoVivo {
  return {
    alcance: "publica",
    conectados: [],
    cupoHoy: {},
    creditosDisponibles: 500,
    topeMes: 500,
    gastadoMes: 0,
    neurona: { gpu: false, capaz3d: false },
    ajustes: { localPrimero: true, externosPermitidos: true },
    ...ajustes,
  };
}

afterEach(() => cleanup());

describe("Panel Contenido vivo", () => {
  it("ofrece Conectar con su enlace para un externo sin conectar (Spline)", () => {
    render(<PanelContenidoVivo contexto={contexto({})} onConfirmar={vi.fn()} />);
    const conectar = screen.getAllByRole("link", { name: "Conectar" });
    const deSpline = conectar.find((a) => a.getAttribute("href")?.includes("mcp.spline.design"));
    expect(deSpline).toBeTruthy();
    expect(deSpline?.getAttribute("href")).toBe("https://mcp.spline.design/mcp");
  });

  it("marca la elegida por defecto y la cambia con el selector", () => {
    render(<PanelContenidoVivo contexto={contexto({})} onConfirmar={vi.fn()} />);
    const tarea = screen.getByText("Tarea: escena-3d");
    const lista = tarea.closest("li") as HTMLElement;
    const local = within(lista).getByRole("radio", { name: /Three.js/ });
    expect(local).toBeChecked();
    const blender = within(lista).getByRole("radio", { name: /Blender/ });
    expect(blender).toBeDisabled();
    fireEvent.click(screen.getByTestId("interruptor-nivel-2"));
    fireEvent.click(screen.getByTestId("interruptor-nivel-3"));
  });

  it("con créditos en juego abre la confirmación con el total y no genera sin el sí", () => {
    const alConfirmar = vi.fn<(cotizacion: CotizacionViva[]) => void>();
    render(
      <PanelContenidoVivo
        contexto={contexto({ conectados: ["higgsfield"], neurona: { gpu: true, capaz3d: true }, ajustes: { localPrimero: false, externosPermitidos: true } })}
        onConfirmar={alConfirmar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(alConfirmar).not.toHaveBeenCalled();
    const confirmacion = screen.getByTestId("confirmacion-generar");
    expect(within(confirmacion).getByText("34")).toBeInTheDocument();
    expect(within(confirmacion).getByText("Se van a gastar", { exact: false })).toBeInTheDocument();
    fireEvent.click(within(confirmacion).getByRole("button", { name: "Sí, generar" }));
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    const cotizacion = alConfirmar.mock.calls[0][0];
    const clip = cotizacion.find((linea) => linea.tarea === "clip-pelicula");
    expect(clip).toEqual({ tarea: "clip-pelicula", rutaId: "higgsfield-seedance-2-720", creditos: 30 });
    expect(cotizacion).toHaveLength(6);
  });

  it("el interruptor apaga el nivel y oculta su tabla y sus créditos", () => {
    const alConfirmar = vi.fn<(cotizacion: CotizacionViva[]) => void>();
    render(
      <PanelContenidoVivo
        contexto={contexto({ conectados: ["higgsfield"], ajustes: { localPrimero: false, externosPermitidos: true } })}
        onConfirmar={alConfirmar}
      />,
    );
    expect(screen.getByText("Tarea: clip-pelicula")).toBeInTheDocument();
    expect(screen.getByTestId("total-creditos")).toHaveTextContent("34");
    fireEvent.click(screen.getByTestId("interruptor-nivel-2"));
    expect(screen.queryByText("Tarea: clip-pelicula")).not.toBeInTheDocument();
    expect(screen.queryByText("Tarea: foto")).not.toBeInTheDocument();
    expect(screen.getByText("Tarea: escena-3d")).toBeInTheDocument();
    expect(screen.getByTestId("total-creditos")).toHaveTextContent("0");
  });

  it("el selector marca la elegida y cambia la ruta y el total", () => {
    render(
      <PanelContenidoVivo
        contexto={contexto({ conectados: ["higgsfield"], ajustes: { localPrimero: false, externosPermitidos: true } })}
        onConfirmar={vi.fn()}
      />,
    );
    const lista = (screen.getByText("Tarea: clip-pelicula").closest("li") as HTMLElement);
    expect(within(lista).getByRole("radio", { name: /Seedance 2\.0 \(720p\)/ })).toBeChecked();
    expect(screen.getByTestId("total-creditos")).toHaveTextContent("34");
    const milozochos = within(lista).getByRole("radio", { name: /Seedance 2\.0 \(1080p\)/ });
    fireEvent.click(milozochos);
    expect(milozochos).toBeChecked();
    expect(screen.getByTestId("total-creditos")).toHaveTextContent("64");
  });

  it("el «Cancelar» cierra la confirmación sin generar", () => {
    const alConfirmar = vi.fn<(cotizacion: CotizacionViva[]) => void>();
    render(
      <PanelContenidoVivo
        contexto={contexto({ conectados: ["higgsfield"], ajustes: { localPrimero: false, externosPermitidos: true } })}
        onConfirmar={alConfirmar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(screen.getByTestId("confirmacion-generar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("confirmacion-generar")).not.toBeInTheDocument();
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it("con todo local genera sin preguntar y con crédito cero", () => {
    const alConfirmar = vi.fn<(cotizacion: CotizacionViva[]) => void>();
    render(
      <PanelContenidoVivo contexto={contexto({ neurona: { gpu: true, capaz3d: true } })} onConfirmar={alConfirmar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(screen.queryByTestId("confirmacion-generar")).not.toBeInTheDocument();
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    const totalRecibido = alConfirmar.mock.calls[0][0].reduce((suma, linea) => suma + linea.creditos, 0);
    expect(totalRecibido).toBe(0);
  });
});
