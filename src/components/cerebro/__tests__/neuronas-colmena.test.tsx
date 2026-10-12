import { render, screen } from "@testing-library/react";
import NeuronCard from "../neuronas-panel";
import { Neuron, NeuronCapabilities, NeuronPermissions, NeuronSettings } from "@/lib/neurons/neurons";
import { EstadoAutonomo, NodoVista } from "@/lib/metagenesis/remoto-nodos";
import { vi, describe, it, beforeEach, expect } from 'vitest';

// Mock the dependencies
vi.mock("@/lib/neurons/neurons");
vi.mock("@/lib/metagenesis/remoto-nodos-cliente");
vi.mock("@/lib/metagenesis/colmena");
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: {
      themeStore: {
        activeMode: 'primary',
      },
    },
  }),
}));

// Import the mocked functions
import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { botonesNeurona, estimarDesdeNavegador } from "@/lib/metagenesis/colmena";

// Mock data
const mockNeuron: Neuron = {
  id: "test-neuron-id",
  name: "Test Neuron",
  kind: "desktop",
  capabilities: {
    platform: "macOS",
    browser: "Chrome 148",
    deviceMemory: 8,
    hardwareConcurrency: 8,
    touch: false,
    // ... other capabilities
  } as NeuronCapabilities,
  permissions: {
    compute: true,
    storage: true,
    sync: true,
    agent: true,
    senses: true,
    wake: true,
  } as NeuronPermissions,
  last_seen_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  online: true,
  isThisDevice: false,
};

const mockNodeIds: Set<string> = new Set(["test-neuron-id"]);

const mockAutonomousState: EstadoAutonomo = {
  modo: "bus",
  lider: "test-neuron-id",
  termino: 1,
  autonomia: true,
  nodos: [
    {
      nodo: "test-neuron-id",
      medio: "neurona",
      etiqueta: "Neurona",
      modo: "real",
      vivo: true,
      lider: true,
      hace_ms: 1000,
      puntos: null,
      orquestadores: [],
      caidos: [],
      disco_gb: null,
      ram_libre_mb: null,
      trabajo: {},
    } as NodoVista,
  ],
  medidores: {},
  decisiones: [],
  ordenes: [],
  fotoHaceMs: null,
  liderSeco: false,
};

describe("NeuronCard - Contenedor de agentes section", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it("displays MetaGenesis buttons when neuron has a node", () => {
    // Mock the autonomous state to return the mock state
    vi.mocked(leerEstadoAutonomo).mockResolvedValue({
      ok: true,
      estado: mockAutonomousState,
    });

    // Mock the botonesNeurona function to return some buttons
    vi.mocked(botonesNeurona).mockReturnValue({
      desconectar: { visible: true, habilitado: true, etiqueta: "Desconectar", explica: "Test" },
      contenedor: { visible: true, habilitado: true, etiqueta: "Usar como contenedor", explica: "Test" },
      instalar: { visible: false, habilitado: false, etiqueta: "", explica: "" },
    });

    render(
      <NeuronCard
        neuron={mockNeuron}
        live={true}
        brainId={null}
        brainName={null}
        onChanged={() => {}}
        nodeIds={mockNodeIds}
      />
    );

    // Wait for the autonomous state to load (we need to wait for the useEffect)
    // Since we mocked the function to return immediately, we can check right away
    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();
    expect(screen.getByText(/Desconectar/i)).toBeInTheDocument();
    expect(screen.getByText(/Usar como contenedor/i)).toBeInTheDocument();
  });

  it("displays estimation and install button when neuron does not have a node", () => {
    // Mock the autonomous state to return an empty state
    vi.mocked(leerEstadoAutonomo).mockResolvedValue({
      ok: true,
      estado: {
        ...mockAutonomousState,
        nodos: [], // No nodes
      } as EstadoAutonomo,
    });

    // Mock the estimarDesdeNavegador function
    vi.mocked(estimarDesdeNavegador).mockReturnValue({
      so: "macos",
      agentes: 3,
      explica: "Con el trabajador instalado, al menos 3 agente(s) a la vez.",
    });

    render(
      <NeuronCard
        neuron={mockNeuron}
        live={true}
        brainId={null}
        brainName={null}
        onChanged={() => {}}
        nodeIds={new Set()} // Empty set, so neuron does not have a node
      />
    );

    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();
    expect(screen.getByText(/Contenedor de agentes:/i)).toBeInTheDocument();
    expect(screen.getByText(/al menos 3 agente/i)).toBeInTheDocument();
    expect(screen.getByText(/Instalar el trabajador/i)).toBeInTheDocument();
  });

  it("shows loading state when fetching autonomous state", () => {
    // Mock the autonomous state to return a pending promise
    vi.mocked(leerEstadoAutonomo).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ ok: true, estado: mockAutonomousState });
        }, 100);
      });
    });

    render(
      <NeuronCard
        neuron={mockNeuron}
        live={true}
        brainId={null}
        brainName={null}
        onChanged={() => {}}
        nodeIds={mockNodeIds}
      />
    );

    expect(screen.getByText(/Cargando estado de MetaGenesis/i)).toBeInTheDocument();
  });
});