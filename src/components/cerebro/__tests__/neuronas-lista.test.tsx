import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import NeuronasLista, { detectarDuplicadas, detectarOlvidadas, pasaBusqueda, pasaFiltro } from "@/components/cerebro/neuronas-lista";
import { AppearanceProvider } from "@/context/appearance-context";
import type { Neuron } from "@/lib/neurons/neurons";
expect.extend(matchers);

const AHORA = Date.parse("2026-11-26T12:00:00Z");
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString();
const PERMISOS = { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true };

function neurona(id: string, name: string, extra: Partial<Neuron> = {}): Neuron {
  return { id, name, kind: "laptop", capabilities: { platform: "macOS" }, permissions: PERMISOS, last_seen_at: hace(0), created_at: hace(90), online: true, ...extra };
}

const NEURONAS: Neuron[] = [
  neurona("a", "Maggaboard", { isThisDevice: true }),
  neurona("b", "maggaboard", { online: false, last_seen_at: hace(2) }),
  neurona("c", "iseed maggadroid", { kind: "mobile", online: false, last_seen_at: hace(45), capabilities: { platform: "Android" } }),
  neurona("d", "Servidor Oracle", { kind: "server", capabilities: { platform: "Linux" } }),
];

function montar(neuronas: Neuron[] = NEURONAS) {
  const acciones = { onAbrirFicha: vi.fn(), onApagarPermisos: vi.fn(), onArchivar: vi.fn(), onFusionar: vi.fn() };
  render(
    <AppearanceProvider>
      <NeuronasLista neuronas={neuronas} ahora={AHORA} {...acciones} />
    </AppearanceProvider>,
  );
  return acciones;
}

afterEach(cleanup);

describe("lógica pura de la lista de neuronas", () => {
  it("detecta dos «Maggaboard» aunque cambien las mayúsculas", () => {
    const d = detectarDuplicadas(NEURONAS);
    expect(d).toHaveLength(1);
    expect(d[0].motivo).toBe("mismo-nombre");
    expect(d[0].ids).toEqual(["a", "b"]);
  });

  it("marca olvidada solo a la de más de 30 días y nunca a este aparato", () => {
    expect(detectarOlvidadas(NEURONAS, AHORA).map((n) => n.id)).toEqual(["c"]);
    const vieja = neurona("z", "Vieja", { isThisDevice: true, last_seen_at: hace(200), created_at: hace(300) });
    expect(detectarOlvidadas([vieja], AHORA)).toEqual([]);
  });

  it("filtra y busca", () => {
    expect(pasaFiltro(NEURONAS[2], "moviles")).toBe(true);
    expect(pasaFiltro(NEURONAS[2], "en-linea")).toBe(false);
    expect(pasaBusqueda(NEURONAS[2], "android")).toBe(true);
    expect(pasaBusqueda(NEURONAS[3], "android")).toBe(false);
  });
});

describe("NeuronasLista montada", () => {
  it("muestra el estado vacío sin neuronas", () => {
    montar([]);
    expect(screen.getByTestId("neuronas-vacio")).toBeInTheDocument();
  });

  it("lista todas y cuenta duplicadas y olvidadas en el botón del asistente", () => {
    montar();
    expect(screen.getAllByTestId("neurona-item")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Duplicadas y olvidadas \(2\)/ })).toBeInTheDocument();
  });

  it("busca y avisa cuando nada coincide", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Buscar neuronas"), { target: { value: "oracle" } });
    expect(screen.getAllByTestId("neurona-item")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Buscar neuronas"), { target: { value: "no existe" } });
    expect(screen.getByTestId("sin-resultados")).toBeInTheDocument();
  });

  it("el asistente propone fusionar y solo actúa tras confirmar", () => {
    const acc = montar();
    fireEvent.click(screen.getByRole("button", { name: /Duplicadas y olvidadas/ }));
    const asistente = screen.getByTestId("asistente-duplicadas");
    fireEvent.click(within(asistente).getByRole("button", { name: "Proponer fusionar" }));
    expect(acc.onFusionar).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId("confirmar-accion")).getByRole("button", { name: "Confirmar" }));
    expect(acc.onFusionar).toHaveBeenCalledWith(["a", "b"]);
  });

  it("cancelar no archiva nada", () => {
    const acc = montar();
    fireEvent.click(screen.getByRole("button", { name: /Duplicadas y olvidadas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Archivar olvidadas" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(acc.onArchivar).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirmar-accion")).toBeNull();
  });

  it("la selección múltiple apaga permisos con confirmación", () => {
    const acc = montar();
    fireEvent.click(screen.getByLabelText("Elegir Servidor Oracle"));
    fireEvent.click(screen.getByRole("button", { name: "Apagar permisos" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(acc.onApagarPermisos).toHaveBeenCalledWith(["d"]);
  });
});
