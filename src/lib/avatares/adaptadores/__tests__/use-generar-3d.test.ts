import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/react";
import { useGenerar3d } from "../use-generar-3d";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";

function TestGenerar3d({ destino }: { destino: Destino3D }) {
  const { estado, iniciarGeneracion } = useGenerar3d(destino);
  return (
    <div>
      <button
        data-testid="boton-generar"
        onClick={() => {
          const archivo = new File(["test"], "test.png", { type: "image/png" });
          iniciarGeneracion(archivo);
        }}
        disabled={!estado.idle}
      >
        Generar
      </button>
      <div data-testid="estado">
        <span data-testid="mensaje">{estado.mensaje}</span>
        <span data-testid="progreso">{estado.progreso}</span>
        <span data-testid="error">{estado.error ?? ""}</span>
      </div>
    </div>
  );
}

describe("useGenerar3d hook", () => {
  it("should be idle initially", () => {
    render(<TestGenerar3d destino="avatar" />);
    expect(screen.getByTestId("boton-generar")).toBeEnabled();
    expect(screen.getByTestId("mensaje")).toHaveTextContent("");
    expect(screen.getByTestId("progreso")).toHaveTextContent("0");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("should start generation on button click", async () => {
    render(<TestGenerar3d destino="protomolecula" />);
    await userEvent.click(screen.getByTestId("boton-generar"));
    await waitFor(() => {
      expect(screen.getByTestId("mensaje")).toHaveTextContent("Preparando imagen...");
    });
  });

  it("should show progress during generation", async () => {
    render(<TestGenerar3d destino="avatar" />);
    await userEvent.click(screen.getByTestId("boton-generar"));
    await waitFor(() => {
      expect(screen.getByTestId("mensaje")).toMatch(/Etapa.*:/);
    });
  });
});

vi.mock("@/lib/avatares/adn/optimizacion", () => {
  const actual = vi.importActual("@/lib/avatares/adn/optimizacion");
  return {
    ...actual,
    planOptimizacion: vi.fn((destino, vramGB) => ({
      destino,
      prioridad: "calidad",
      generador: { resolucion: 1024, pocaMemoria: false },
      remallado: { caras: 1000, modo: "organico" },
      lods: [1000, 500],
      texturaPx: 512,
      compresion: "meshopt",
      atlas: true,
      conservarOriginal: true,
      cerrada: false,
      pesoMaxMB: 10,
    })),
    siguienteIntento: vi.fn(),
    resolucionPara: vi.fn(),
  };
});
vi.mock("@/lib/avatares/adn/canalizacion", () => {
  const actual = vi.importActual("@/lib/avatares/adn/canalizacion");
  return {
    ...actual,
    planificar: vi.fn(() => ({
      pasos: [
        { etapa: "generar", motor: null, saltada: false, motivo: "Sin motor", descartes: [] },
        { etapa: "remallar", motor: actual.MOTORES_3D.find(m => m.id === "instant-meshes"), saltada: false, motivo: "Instant Meshes.", descartes: [] },
        { etapa: "riggear", motor: null, saltada: true, motivo: "Ya hay malla", descartes: [] },
        { etapa: "detallar", motor: null, saltada: true, motivo: "Detallar opcional", descartes: [] },
        { etapa: "animar", motor: actual.MOTORES_3D.find(m => m.id === "procedural"), saltada: false, motivo: "Procedural.", descartes: [] }
      ],
      listo: false,
      procedencia: []
    })),
  };
});
vi.mock("@/lib/avatares/adaptadores/almacen-adn", () => {
  const actual = vi.importActual("@/lib/avatares/adaptadores/almacen-adn");
  return {
    ...actual,
    saveAdnToLibrary: vi.fn().mockResolvedValue(undefined),
  };
});