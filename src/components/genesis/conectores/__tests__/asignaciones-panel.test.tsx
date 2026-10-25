import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PanelAsignaciones, anadirA, conSugeridas, moverEn, peldanoDe, quitarDe } from "../asignaciones-panel";
import type { CandidatoAsignacion, EntradaCatalogo, FilaAsignacion, Peldano } from "../asignaciones-panel";

const catalogo: EntradaCatalogo[] = [
  { id: "astraura-local", nombre: "Astraura 1.58 local", tipo: "modelo", gratis: null, privacidad: "local" },
  { id: "llm7", nombre: "LLM7", tipo: "proveedor", gratis: { nota: "30 por minuto" }, privacidad: "nube-sin-retencion" },
  { id: "premium", nombre: "Premium", tipo: "proveedor", gratis: null, privacidad: "nube-con-retencion" },
  { id: "vecino", nombre: "Vecino de malla", tipo: "modelo", gratis: null, deMalla: true },
  { id: "actions", nombre: "Acciones de GitHub", tipo: "contenedor", gratis: null },
];

const candidato = (id: string, nombre: string, peldano: Peldano, motivo = "m"): CandidatoAsignacion => ({ id, nombre, peldano, motivo });

const sugeridas: FilaAsignacion[] = [
  { clave: "escritor", etiqueta: "Escritor", cadena: [candidato("astraura-local", "Astraura 1.58 local", "local"), candidato("llm7", "LLM7", "gratis")] },
  { clave: "aprendizaje", etiqueta: "Director de aprendizaje", cadena: [candidato("llm7", "LLM7", "gratis")] },
];

const iniciales: FilaAsignacion[] = [
  { clave: "escritor", etiqueta: "Escritor", cadena: [candidato("llm7", "LLM7", "gratis"), candidato("astraura-local", "Astraura 1.58 local", "local")] },
];

afterEach(() => cleanup());

describe("peldaño y mutaciones puras (sin red ni disco)", () => {
  it("deduce el peldaño de cada opción del catálogo", () => {
    expect(peldanoDe(catalogo[0])).toBe("local");
    expect(peldanoDe(catalogo[1])).toBe("gratis");
    expect(peldanoDe(catalogo[2])).toBe("pago");
    expect(peldanoDe(catalogo[3])).toBe("malla");
    expect(peldanoDe(catalogo[4])).toBe("contenedor");
  });

  it("añade, quita, mueve y restaura sin tocar las filas de entrada", () => {
    const añadidas = anadirA(iniciales, "escritor", catalogo[2]);
    expect(añadidas[0].cadena.map((c) => c.id)).toEqual(["llm7", "astraura-local", "premium"]);
    expect(añadidas[0].cadena[2]).toMatchObject({ peldano: "pago" });
    expect(añadidas[0].cadena[2].motivo).toContain("De pago");
    const deNuevo = anadirA(añadidas, "escritor", catalogo[2]);
    expect(deNuevo[0].cadena).toHaveLength(3);
    expect(iniciales[0].cadena).toHaveLength(2);
    const quitadas = quitarDe(deNuevo, "escritor", "astraura-local");
    expect(quitadas[0].cadena.map((c) => c.id)).toEqual(["llm7", "premium"]);
    const movidas = moverEn(quitadas, "escritor", 0, 1);
    expect(movidas[0].cadena.map((c) => c.id)).toEqual(["premium", "llm7"]);
    const restauradas = conSugeridas(sugeridas);
    restauradas[0].cadena[0].peldano = "pago";
    expect(sugeridas[0].cadena[0].peldano).toBe("local");
  });
});

describe("PanelAsignaciones en pantalla", () => {
  it("pinta el peldaño con su motivo, reordena arrastrando y guardar entrega las filas", () => {
    const guardar = vi.fn();
    render(<PanelAsignaciones filas={iniciales} sugeridas={sugeridas} catalogo={catalogo} onGuardar={guardar} />);
    expect(screen.getAllByTestId("asignaciones-fila")).toHaveLength(1);
    expect(screen.getByTestId("peldano-llm7")).toHaveTextContent("Gratis");
    expect(screen.getByTestId("asignaciones-guardar")).toHaveTextContent("Guardar");
    fireEvent.dragStart(screen.getByTestId("candidato-llm7"));
    fireEvent.drop(screen.getByTestId("candidato-astraura-local"));
    expect(screen.getAllByTestId(/^candidato-/).map((n) => n.getAttribute("data-testid"))).toEqual([
      "candidato-astraura-local",
      "candidato-llm7",
    ]);
    fireEvent.click(screen.getByTestId("asignaciones-guardar"));
    expect(guardar).toHaveBeenCalledOnce();
    const filas = guardar.mock.calls[0][0] as FilaAsignacion[];
    expect(filas[0].cadena.map((c) => c.id)).toEqual(["astraura-local", "llm7"]);
  });

  it("añade del catálogo, quita y «Restaurar sugeridas» vuelve a las cadenas sugeridas", () => {
    render(<PanelAsignaciones filas={iniciales} sugeridas={sugeridas} catalogo={catalogo} />);
    fireEvent.change(screen.getByTestId("anadir-escritor"), { target: { value: "premium" } });
    fireEvent.click(screen.getByTestId("boton-anadir-escritor"));
    expect(screen.getByTestId("candidato-premium")).toBeInTheDocument();
    expect(screen.getByTestId("peldano-premium")).toHaveTextContent("Pago");
    expect(screen.getByText(/De pago/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar LLM7 de Escritor" }));
    expect(screen.queryByTestId("candidato-llm7")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("asignaciones-restaurar"));
    expect(screen.getAllByTestId("asignaciones-fila")).toHaveLength(2);
    expect(screen.getByTestId("candidato-astraura-local")).toBeInTheDocument();
    expect(screen.getAllByTestId("candidato-llm7")).toHaveLength(2);
    expect(screen.queryByTestId("candidato-premium")).not.toBeInTheDocument();
  });

  it("en PoliGenesis democrático guardar propone a votación", () => {
    const guardar = vi.fn();
    render(<PanelAsignaciones filas={iniciales} sugeridas={sugeridas} catalogo={catalogo} democrata onGuardar={guardar} />);
    expect(screen.getByTestId("asignaciones-guardar")).toHaveTextContent("Proponer a votación");
    fireEvent.click(screen.getByTestId("asignaciones-guardar"));
    expect(guardar).toHaveBeenCalledOnce();
    const filas = guardar.mock.calls[0][0] as FilaAsignacion[];
    expect(filas[0].cadena.map((c) => c.id)).toEqual(iniciales[0].cadena.map((c) => c.id));
  });
});
