/** Pruebas del panel «Contenido vivo» (CVV1028, tarea H). */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PanelContenidoVivo, cotizarPlan } from "../panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

const BASE: ContextoVivo = {
  alcance: "publica",
  conectados: ["higgsfield", "google", "spline-comunidad"],
  cupoHoy: {},
  creditosDisponibles: 50,
  topeMes: 100,
  gastadoMes: 0,
  neurona: { gpu: true, capaz3d: true },
  ajustes: { localPrimero: true, externosPermitidos: true },
};

afterEach(cleanup);

describe("cotizarPlan", () => {
  it("suma lo elegido por tarea y el vacío cotiza cero", () => {
    const plan = cotizarPlan(BASE, {}, ["foto"]);
    expect(plan.total).toBeGreaterThan(0);
    expect(plan.tareas).toHaveLength(1);
    expect(cotizarPlan(BASE, {}, []).total).toBe(0);
  });
});

describe("<PanelContenidoVivo />", () => {
  it("con Spline sin conectar muestra «Conectar» con su enlace", () => {
    render(<PanelContenidoVivo contexto={BASE} />);
    const conectar = screen.getByRole("link", { name: "Conectar" });
    expect(conectar.getAttribute("href")).toBe("https://mcp.spline.design/mcp");
  });

  it("la tabla marca la elegida y el selector cambia la ruta y el total", () => {
    render(<PanelContenidoVivo contexto={BASE} />);
    expect(screen.getByTestId("ruta-threejs-escena3d").getAttribute("data-elegida")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Elegir Three.js (átomo escena3d)" }));
    expect(screen.getByTestId("ruta-threejs-escena3d").getAttribute("data-elegida")).toBe("true");
    const totalAntes = Number(screen.getByTestId("total-cotizado").textContent?.replace(/\D/g, ""));
    fireEvent.click(screen.getByRole("button", { name: "Elegir Spline por MCP" }));
    const totalDespués = Number(screen.getByTestId("total-cotizado").textContent?.replace(/\D/g, ""));
    expect(screen.getByTestId("ruta-spline-mcp").getAttribute("data-elegida")).toBe("true");
    expect(totalDespués).toBeGreaterThan(totalAntes);
  });

  it("el interruptor apaga el nivel y oculta su tabla", () => {
    render(<PanelContenidoVivo contexto={BASE} />);
    expect(screen.getByTestId("tabla-escena-3d")).toBeTruthy();
    fireEvent.click(screen.getByTestId("interruptor-nivel-1"));
    expect(screen.queryByTestId("tabla-escena-3d")).toBeNull();
  });

  it("con créditos, Generar abre la confirmación con el total y solo el «sí» confirma", () => {
    const onConfirmar = vi.fn();
    render(<PanelContenidoVivo contexto={BASE} onConfirmar={onConfirmar} />);
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(onConfirmar).not.toHaveBeenCalled();
    const total = screen.getByTestId("total-cotizado").textContent?.replace(/\D/g, "");
    expect(screen.getByTestId("confirmacion-generar")).toBeTruthy();
    expect(screen.getByTestId("confirmacion-total").textContent).toBe(`Total: ${total} créditos`);

    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(screen.queryByTestId("confirmacion-generar")).toBeNull();
    expect(onConfirmar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar.mock.calls[0][0].total).toBe(Number(total));
  });
});
