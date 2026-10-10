/**
 * El mini radar (widgets y paneles estrechos) ya no es un instrumento aparte: es la vista plana del
 * mapa. Se comprueba su API de siempre, que no vuelve el barrido de adorno y que su ficha trae la
 * fuente de cada valor.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { AHORA, aparato, fila, medioPresencia, senal } from "@/lib/senales/__fixtures__/vivo";

const h = vi.hoisted(() => ({
  senales: [] as unknown[],
  filas: [] as unknown[],
  presencia: { conectado: true, medios: [] as unknown[] },
  mesh: {} as Record<string, unknown>,
  opciones: undefined as unknown,
}));

vi.mock("framer-motion", () => ({ useReducedMotion: () => false }));
vi.mock("@/ai/astraura/mesh", () => ({
  useMeshState: () => h.mesh,
  detectSignals: async () => [],
  subscribeConnectivity: () => () => undefined,
}));
vi.mock("../../use-detected-signals", () => ({ useDetectedSignals: () => ({ signals: h.senales, ble: {}, loadingNeurons: false, unavailable: [], refresh: () => undefined }) }));
vi.mock("../use-detected-signals", () => ({
  useDetectedSignals: (o: unknown) => {
    h.opciones = o;
    return { signals: h.senales, ble: {}, loadingNeurons: false, unavailable: [], refresh: () => undefined };
  },
  ordenarSenalesPorCalidad: (s: DetectedSignal[]) => [...s].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1) || a.id.localeCompare(b.id)),
}));
vi.mock("@/lib/network/malla-neuronas", () => ({ useMallaNeuronasEstado: () => ({ misDispositivos: h.filas, cercanas: [], loading: false }) }));
vi.mock("@/lib/neurons/presencia", () => ({ usePresenciaNeuronas: () => h.presencia }));
vi.mock("@/lib/malla/registro-enlaces-locales", () => ({ useEnlacesLocales: () => [] }));
vi.mock("@/lib/neurons/medio", () => ({ describirMedio: () => ({ id: "m-yo", tipo: "navegador", etiqueta: "Chrome · localhost" }) }));
vi.mock("@/lib/neurons/senales-medio", async () => ({ medirSenales: async () => (await import("@/lib/senales/__fixtures__/vivo")).SENALES_MEDIO }));
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "uid-yo" }));
vi.mock("../signal-detail", () => ({
  SignalDetailCard: ({ signal, ficha }: { signal: DetectedSignal; ficha?: { secciones: unknown[] } }) => (
    <div data-testid="ficha">{`Ficha de ${signal.label} · ${ficha?.secciones.length ?? 0} secciones`}</div>
  ),
}));

import { SignalsRadar } from "../signals-radar";

beforeEach(() => {
  h.mesh = { status: "ready", transport: "serial", region: "EU_868", edges: [], remoteTopologies: [], self: undefined, nodes: [] };
  h.senales = [senal("lora:7", { label: "Nodo Norte", quality: 0.9, lastHeard: AHORA }), aparato("n1", { label: "Mi Mac", quality: 1 })];
  h.filas = [fila("yo", { esEsteDispositivo: true }), fila("n1")];
  h.presencia = { conectado: true, medios: [medioPresencia("n1", "m1")] };
  h.opciones = undefined;
});
afterEach(() => cleanup());

describe("SignalsRadar (mini radar)", () => {
  test("es la vista plana: sin barrido giratorio y con descripción accesible", () => {
    const { container } = render(<SignalsRadar />);
    expect(container.querySelector(".ss-radar-beam")).toBeNull();
    expect(screen.getByRole("group", { name: /Radar de señales: 2 señal/ })).toBeInTheDocument();
  });

  test("conserva su API: el registro de cuenta se apaga en compacto y se puede forzar", () => {
    render(<SignalsRadar compact />);
    expect(h.opciones).toEqual({ accountRegistry: false });
    cleanup();
    render(<SignalsRadar compact accountRegistry />);
    expect(h.opciones).toEqual({ accountRegistry: true });
  });

  test("fuera de compacto, pulsar una marca abre la ficha con su fuente; en compacto, una línea", () => {
    render(<SignalsRadar />);
    fireEvent.click(screen.getByRole("button", { name: /Nodo Norte/ }));
    expect(screen.getByTestId("ficha")).toHaveTextContent(/Ficha de Nodo Norte · \d+ secciones/);
    cleanup();
    render(<SignalsRadar compact />);
    fireEvent.click(screen.getByRole("button", { name: /Nodo Norte/ }));
    expect(screen.queryByTestId("ficha")).not.toBeInTheDocument();
    expect(screen.getByText("Nodo Norte", { selector: "span" })).toBeInTheDocument();
  });

  test("pulsar «Tú» enseña la ficha de este aparato", () => {
    render(<SignalsRadar />);
    fireEvent.click(screen.getByRole("button", { name: "Tú, esta neurona" }));
    expect(screen.getByTestId("ficha-panel")).toBeInTheDocument();
  });

  test("sin señales dice la verdad: no inventa actividad", () => {
    h.senales = [];
    render(<SignalsRadar />);
    expect(screen.getByText(/ninguna señal externa detectada todavía/)).toBeInTheDocument();
  });

  test("la leyenda solo sale fuera de compacto y si se pide", () => {
    render(<SignalsRadar showLegend />);
    expect(screen.getByLabelText("Leyenda corta")).toBeInTheDocument();
    cleanup();
    render(<SignalsRadar showLegend={false} />);
    expect(screen.queryByLabelText("Leyenda corta")).not.toBeInTheDocument();
    cleanup();
    render(<SignalsRadar compact showLegend />);
    expect(screen.queryByLabelText("Leyenda corta")).not.toBeInTheDocument();
  });
});
