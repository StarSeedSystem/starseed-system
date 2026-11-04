/**
 * Prueba de la tarea CVV1028K (botón «Hacerla viva») sobre el panel de la H.
 * Sin red ni disco: el contexto se construye a mano y `anadir` es una voz.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BotonHacerlaViva, textoPlanVivo } from "../boton-hacerla-viva";
import type { CotizacionViva } from "@/components/contenido-vivo/panel-contenido-vivo";
import type { ContextoVivo } from "@/lib/contenido-vivo/rutas";

function contexto(ajustes: Partial<ContextoVivo>): ContextoVivo {
  return {
    alcance: "publica",
    conectados: [],
    cupoHoy: {},
    creditosDisponibles: 0,
    topeMes: 0,
    gastadoMes: 0,
    neurona: { gpu: false, capaz3d: true },
    ajustes: { localPrimero: true, externosPermitidos: true },
    ...ajustes,
  };
}

const COTIZACION: CotizacionViva[] = [
  { tarea: "escena-3d", rutaId: "threejs-escena3d", creditos: 0 },
  { tarea: "clip-pelicula", rutaId: "higgsfield-seedance-2-720", creditos: 30 },
];

afterEach(() => cleanup());

describe("textoPlanVivo", () => {
  it("una línea por tarea con la ruta y su coste local o en créditos", () => {
    const plan = textoPlanVivo(COTIZACION);
    expect(plan.split("\n")[0]).toBe("Contenido vivo:");
    expect(plan).toContain("- escena-3d: Three.js (átomo escena3d) (local)");
    expect(plan).toContain("- clip-pelicula: Higgsfield Seedance 2.0 (720p) (30 créditos)");
  });

  it("cotización vacía da un plan vacío para no pegar líneas muertas", () => {
    expect(textoPlanVivo([])).toBe("");
  });

  it("ruta que no está en el catálogo usa su id sin caerse", () => {
    expect(textoPlanVivo([{ tarea: "grafico-vivo", rutaId: "cualquiera", creditos: 5 }])).toContain(
      "- grafico-vivo: cualquiera (5 créditos)",
    );
  });
});

describe("Botón Hacerla viva", () => {
  it("abre y cierra el panel de la tarea H con aria-expanded", () => {
    render(<BotonHacerlaViva contexto={contexto({})} anadir={vi.fn()} />);
    const boton = screen.getByRole("button", { name: "Hacerla viva" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Contenido vivo" })).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Contenido vivo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el plan" }));
    expect(screen.getByRole("button", { name: "Hacerla viva" })).toBeInTheDocument();
  });

  it("al abrirlo enseña los tres niveles del contenido vivo", () => {
    render(<BotonHacerlaViva contexto={contexto({})} anadir={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    const panel = screen.getByRole("region", { name: "Contenido vivo" });
    expect(within(panel).getByText("Nivel 1 · 3D vivo")).toBeInTheDocument();
    expect(within(panel).getByText("Nivel 2 · Película e imágenes")).toBeInTheDocument();
    expect(within(panel).getByText("Nivel 3 · Gráficos vivos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ocultar el plan" })).toHaveAttribute("aria-expanded", "true");
  });

  it("al Generar añade el plan y no rehace nada: el botón ya no está abierto", () => {
    const anadir = vi.fn();
    render(<BotonHacerlaViva contexto={contexto({})} anadir={anadir} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(anadir).toHaveBeenCalledTimes(1);
    const plan = anadir.mock.calls[0][0] as string;
    expect(plan.startsWith("Contenido vivo:")).toBe(true);
    expect(plan).toContain("escena-3d");
    expect(plan).toContain("grafico-vivo");
    expect(screen.queryByRole("region", { name: "Contenido vivo" })).not.toBeInTheDocument();
  });

  it("sin ninguna tarea encendida la cotización va vacía y no añade nada", () => {
    const anadir = vi.fn();
    render(<BotonHacerlaViva contexto={contexto({})} anadir={anadir} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    for (const nivel of [1, 2, 3]) {
      fireEvent.click(screen.getByTestId(`interruptor-nivel-${nivel}`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(anadir).not.toHaveBeenCalled();
  });

  it("vuelve a pulsarlo cierra el panel sin rehacer nada", () => {
    const anadir = vi.fn();
    render(<BotonHacerlaViva contexto={contexto({})} anadir={anadir} />);
    fireEvent.click(screen.getByRole("button", { name: "Hacerla viva" }));
    fireEvent.click(screen.getByRole("button", { name: "Ocultar el plan" }));
    expect(screen.queryByRole("region", { name: "Contenido vivo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hacerla viva" })).toBeInTheDocument();
    expect(anadir).not.toHaveBeenCalled();
  });
});
