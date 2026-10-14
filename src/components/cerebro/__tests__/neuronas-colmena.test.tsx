import { render, screen, waitFor } from "@testing-library/react";

// Mock the necessary hooks and functions
vi.mock("@/lib/neurons/neurons", () => ({
  usePresenciaNeuronas: () => ({
    medios: [],
    conectado: false,
  }),
  ensureThisNeuron: vi.fn().mockResolvedValue({
    id: "test-id",
    name: "Test Neuron",
    kind: "desktop",
    capabilities: {
      platform: "macOS",
      browser: "Chrome 148",
      memoryGB: 8,
      cores: 4,
      touch: false,
    },
    permissions: {
      sync: true,
    },
    online: true,
    isThisDevice: true,
  }),
  listNeurons: vi.fn().mockResolvedValue([
    {
      id: "test-id",
      name: "Test Neuron",
      kind: "desktop",
      capabilities: {
        platform: "macOS",
        browser: "Chrome 148",
        memoryGB: 8,
        cores: 4,
        touch: false,
      },
      permissions: {
        sync: true,
      },
      online: true,
      isThisDevice: true,
    },
  ]),
}));

vi.mock("@/lib/aurora/hermione-autosync", () => ({
  useHermioneStatus: vi.fn().mockReturnValue({
    status: "online",
    label: "Hermione en línea",
    pending: 0,
  }),
}));

vi.mock("@/lib/sync/realtime-sync", () => ({
  sendAccountBroadcast: vi.fn(),
  deviceId: vi.fn().mockReturnValue("test-sync-device-id"),
}));

vi.mock("@/lib/brains/servers", () => ({
  saveServer: vi.fn().mockResolvedValue({ id: "test-server-id" }),
  linkServer: vi.fn().mockResolvedValue({ id: "test-link-id" }),
}));

vi.mock("@/lib/metagenesis/colmena", () => ({
  botonesNeurona: vi.fn().mockReturnValue({
    desconectar: {
      visible: true,
      habilitado: true,
      etiqueta: "Desconectar",
      explica: "Guarda el trabajo a medias y lo pasa a otro contenedor.",
      confirmar: false,
    },
    contenedor: {
      visible: true,
      habilitado: true,
      etiqueta: "Usar como contenedor (3 agente(s))",
      explica: "Este aparato coge tareas de la cola como la Mac.",
      confirmar: false,
    },
    instalar: {
      visible: false,
      habilitado: false,
      etiqueta: "",
      explica: "",
    },
  }),
  estimarDesdeNavegador: vi.fn().mockReturnValue({
    so: "macos",
    agentes: 3,
    explica: "Con el trabajador instalado, al menos 3 agente(s) a la vez.",
  }),
  comandoInstalar: vi.fn().mockReturnValue("curl -fsSL <origen>/trabajador.sh | bash -s -- --emparejar <codigo>"),
}));

describe("NeuronasPanel", () => {
  it("renders the contenedor de agentes section for the actual neuron", async () => {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(<NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />);

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Test Neuron")).toBeInTheDocument();
    });

    // Check that the contenedor de agentes section is present
    expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
  });
});