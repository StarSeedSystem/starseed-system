/**
 * Botón «Hacerla viva» (CVV1028, tarea K): prueba el comportamiento por la
 * interfaz pública — abrir y cerrar el panel de la tarea H y entregarle la
 * cotización confirmada. Contexto construido a mano, sin red ni voces.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BotonHacerlaViva } from "../boton-hacerla-viva";
import type { CotizacionViva } from "../panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

function contexto(): ContextoVivo {
  return {
    alcance: "publica",
    conectados: [],
    cupoHoy: {},
    creditosDisponibles: 500,
    topeMes: 500,
    gastadoMes: 0,
    // Todo local y capaz: la generación no pide confirmación y llega directa.
    neurona: { gpu: true, capaz3d: true },
    ajustes: { localPrimero: true, externosPermitidos: true },
  };
}

afterEach(() => cleanup());

describe("Botón Hacerla viva", () => {
  it("empieza cerrado: el botón está y el panel no", () => {
    render(<BotonHacerlaViva contexto={contexto()} onConfirmar={vi.fn()} />);
    const boton = screen.getByRole("button", { name: "Hacerla viva" });
    expect(boton).toBeInTheDocument();
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { hidden: false, name: "Contenido vivo" })).not.toBeInTheDocument();
  });

  it("al pulsarlo abre el panel de los tres niveles y lo etiqueta como abierto", () => {
    render(<BotonHacerlaViva contexto={contexto()} onConfirmar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    const panel = screen.getByRole("region", { name: "Contenido vivo" });
    expect(within(panel).getByText("Nivel 1 · 3D vivo")).toBeInTheDocument();
    expect(within(panel).getByText("Nivel 3 · Gráficos vivos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar el plan" })).toHaveAttribute("aria-expanded", "true");
  });

  it("vuelve a pulsarlo cierra el panel sin rehacer nada", () => {
    render(<BotonHacerlaViva contexto={contexto()} onConfirmar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el plan" }));
    expect(screen.queryByRole("region", { name: "Contenido vivo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacerla viva" })).toBeInTheDocument();
  });

  it("al confirmar el plan dentro del panel, entrega la cotización a onConfirmar", () => {
    const alConfirmar = vi.fn<(cotizacion: CotizacionViva[]) => void>();
    render(<BotonHacerlaViva contexto={contexto()} onConfirmar={alConfirmar} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(alConfirmar).toHaveBeenCalledTimes(1);
    const totalRecibido = alConfirmar.mock.calls[0][0].reduce((suma, linea) => suma + linea.creditos, 0);
    expect(totalRecibido).toBe(0);
  });
});
