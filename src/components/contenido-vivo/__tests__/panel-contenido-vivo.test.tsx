import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOGO_RUTAS } from "@/lib/contenido-vivo/catalogo-rutas";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";
import {
  NIVELES_PANEL, cotizarSeleccion, elegidasIniciales, necesitaConectar, tareasDeNiveles,
} from "@/lib/contenido-vivo/panel";
import { PanelContenidoVivo } from "../panel-contenido-vivo";

afterEach(cleanup);

const SIN_CONECTAR: ContextoVivo = {
  alcance: "publica",
  conectados: [],
  cupoHoy: {},
  creditosDisponibles: 100,
  topeMes: 1000,
  gastadoMes: 0,
  neurona: { gpu: false, capaz3d: false },
  ajustes: { localPrimero: false, externosPermitidos: true },
};

const CON_SPLINE: ContextoVivo = {
  ...SIN_CONECTAR,
  conectados: ["spline"],
  cupoHoy: { spline: 200 },
};

const ruta = (id: string) => CATALOGO_RUTAS.find((candidata) => candidata.id === id)!;

describe("piezas puras del panel", () => {
  it("agrupa las tareas por nivel activo en el orden del contrato", () => {
    expect(tareasDeNiveles([1, 3])).toEqual(["escena-3d", "grafico-vivo"]);
    expect(tareasDeNiveles([2])).toEqual(["fotograma-clave", "foto", "clip-pelicula", "foto-viva"]);
    expect(NIVELES_PANEL).toHaveLength(3);
  });

  it("elige la mejor ruta disponible y cotiza solo las tareas pedidas", () => {
    const seleccion = elegidasIniciales(CON_SPLINE);
    expect(seleccion["escena-3d"]).toBe("spline-mcp");
    expect(cotizarSeleccion(seleccion, ["escena-3d"])).toBe(8);
    expect(cotizarSeleccion({ "escena-3d": "spline-mcp", foto: "higgsfield-nano-banana-2" }, ["escena-3d", "foto", "grafico-vivo"])).toBe(10);
  });

  it("solo pide conectar un externo que aún no está conectado", () => {
    expect(necesitaConectar(ruta("spline-mcp"), SIN_CONECTAR)).toBe(true);
    expect(necesitaConectar(ruta("spline-mcp"), CON_SPLINE)).toBe(false);
    expect(necesitaConectar(ruta("threejs-escena3d"), SIN_CONECTAR)).toBe(false);
  });
});

describe("PanelContenidoVivo", () => {
  it("muestra los tres niveles y, con Spline sin conectar, su botón Conectar", () => {
    render(<PanelContenidoVivo contexto={SIN_CONECTAR} onConfirmar={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Contenido vivo" })).toBeTruthy();
    for (const nivel of NIVELES_PANEL) expect(screen.getByRole("heading", { name: new RegExp(nivel.nombre) })).toBeTruthy();
    const conectar = screen.getByRole("link", { name: "Conectar Spline por MCP" });
    expect(conectar.getAttribute("href")).toBe("https://mcp.spline.design/mcp");
    const razon = screen.getByRole("link", { name: "Conectar Spline por MCP" }).closest("tr")?.textContent;
    expect(razon).toContain("Sin conectar");
  });

  it("con créditos, Generar abre la confirmación con el total y no hace nada sin el sí", () => {
    const onConfirmar = vi.fn();
    render(<PanelContenidoVivo contexto={CON_SPLINE} onConfirmar={onConfirmar} />);
    expect(screen.getByText(/Cotización total/).textContent).toContain("8 créditos");
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Confirmar generación" });
    expect(dialogo.textContent).toContain("8 créditos");
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onConfirmar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, generar" }));
    expect(onConfirmar).toHaveBeenCalledWith({ totalCreditos: 8, seleccion: expect.objectContaining({ "escena-3d": "spline-mcp" }), niveles: [1, 2, 3] });
  });

  it("el selector cambia la ruta elegida y el interruptor apaga un nivel", () => {
    render(<PanelContenidoVivo contexto={CON_SPLINE} onConfirmar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Elegir ruta para escena-3d"), { target: { value: "threejs-escena3d" } });
    expect(screen.getByText(/Cotización total/).textContent).toContain("0 créditos");
    fireEvent.click(screen.getByRole("switch", { name: "3D vivo" }));
    expect(screen.queryByLabelText("Elegir ruta para escena-3d")).toBeNull();
  });
});
