import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { within } from "@testing-library/dom";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

let mockNeuronOverride = null;

// Mock the necessary hooks and functions
vi.mock("@/lib/neurons/neurons", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual ?? {}),
    usePresenciaNeuronas: () => ({
      medios: [],
      conectado: false,
    }),
    ensureThisNeuron: vi.fn().mockResolvedValue({
      id: "test-id",
      name: "Test Neuron",
      kind: "desktop",
      capabilities: mockNeuronOverride?.capabilities ?? {
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
      isThisDevice: mockNeuronOverride?.isThisDevice ?? true,
    }),
    listNeurons: vi.fn().mockResolvedValue([
      {
        id: "test-id",
        name: "Test Neuron",
        kind: "desktop",
        capabilities: mockNeuronOverride?.capabilities ?? {
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
        isThisDevice: mockNeuronOverride?.isThisDevice ?? true,
      },
    ]),
    summarizeNeurons: vi.fn().mockReturnValue("1 neurona en tu cuenta · 1 online · 1 con IA local."),
    NEURON_EVENT: "starseed:neurons",
    thisDeviceId: vi.fn().mockReturnValue("test-device-id"),
    detectCapabilities: vi.fn().mockResolvedValue(mockNeuronOverride?.capabilities ?? {
      platform: "macOS",
      browser: "Chrome 148",
      memoryGB: 8,
      cores: 4,
      touch: false,
    }),
  };
});

afterEach(() => {
  mockNeuronOverride = null;
});


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
  soDesdeAgente: vi.fn().mockImplementation((ua, _, touch) => {
    // Mock implementation: return a fixed SO based on the platform in ua
    if (ua.includes("macOS")) return "macos";
    if (ua.includes("Windows")) return "windows";
    if (ua.includes("Linux")) return "linux";
    return "unknown";
  }),
}));

describe("NeuronasPanel", () => {
  it("renders the contenedor de agentes section for the actual neuron", async () => {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Check that the contenedor de agentes section is present
    expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
});

  it("shows estimation for Mac 8 GB", async () => {
    mockNeuronOverride = {
      capabilities: {
        platform: "macOS",
        browser: "Chrome 148",
        memoryGB: 8,
        cores: 8,
        touch: false,
      },
      isThisDevice: true,
    };

    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Capacidades de esta neurona")).toBeInTheDocument();
    });

    // Get the neuron card div
    const neuronCard = await screen.findByText("Capacidades de esta neurona");
    const neuronCardDiv = neuronCard.parentElement as HTMLElement;
    // Wait for the contenedor de agentes text within the neuron card
    await waitFor(() => {
      expect(within(neuronCardDiv).getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Get the container div for the installation panel
    const container = await screen.findByText(/Contenedor de agentes/i);
    const containerDiv = container.parentElement as HTMLElement;
    // Check the estimation text within the container
    expect(within(containerDiv).getByText(/al menos 3 agente/i)).toBeInTheDocument();
    // Check the install button within the container
    expect(within(containerDiv).getByRole("button", { name: /instalar el trabajador/i })).toBeInTheDocument();
  });

  it("shows estimation for iPhone (iOS, 0 agents)", async () => {
    mockNeuronOverride = {
      capabilities: {
        platform: "iOS",
        browser: "Safari",
        memoryGB: 4,
        cores: 6,
        touch: true,
      },
      isThisDevice: true,
    };

    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Capacidades de esta neurona")).toBeInTheDocument();
    });

    // Get the neuron card div
    const neuronCard = await screen.findByText("Capacidades de esta neurona");
    const neuronCardDiv = neuronCard.parentElement as HTMLElement;
    // Wait for the contenedor de agentes text within the neuron card
    await waitFor(() => {
      expect(within(neuronCardDiv).getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Get the container div for the installation panel
    const container = await screen.findByText(/Contenedor de agentes/i);
    const containerDiv = container.parentElement as HTMLElement;
    // iPhone cannot work as contenedor: 0 agents
    expect(within(containerDiv).getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    // The install button should not be visible for iOS
    expect(within(containerDiv).queryByText(/Instalar el trabajador/i)).not.toBeInTheDocument();
  });

  it("shows estimation for Android (1 agent due to battery and red medida)", async () => {
    mockNeuronOverride = {
      capabilities: {
        platform: "Android",
        browser: "Chrome",
        memoryGB: 6,
        cores: 4,
        touch: true,
        battery: { level: 15, charging: false },
      },
      isThisDevice: true,
    };

    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Test Neuron")).toBeInTheDocument();
    });

    // Get the neuron card div
    const neuronCard = await screen.findByText("Test Neuron");
    const neuronCardDiv = neuronCard.parentElement as HTMLElement;
    // Wait for the contenedor de agentes text within the neuron card
    await waitFor(() => {
      expect(within(neuronCardDiv).getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Get the container div for the installation panel
    const container = await screen.findByText(/Contenedor de agentes/i);
    const containerDiv = container.parentElement as HTMLElement;
    // Android: memoryGb=6 -> (6-2)/2 = 2, cores=4 -> min(4,2,4)=2, but then because Android: n = Math.min(n, 1) -> 1 agent
    // Also, battery level < 20% and not charging -> n = 0.
    expect(within(containerDiv).getByText(/0 agente/i)).toBeInTheDocument();
    // The install button should be visible for Android
    expect(within(containerDiv).getByRole("button", { name: /instalar el trabajador/i })).toBeInTheDocument();
  });

  it("shows installation panel when button is clicked", async () => {
    mockNeuronOverride = {
      capabilities: {
        platform: "macOS",
        browser: "Chrome 148",
        memoryGB: 8,
        cores: 4,
        touch: false,
      },
      isThisDevice: true,
    };

    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Test Neuron")).toBeInTheDocument();
    });

    // Get the neuron card div
    const neuronCard = await screen.findByText("Test Neuron");
    const neuronCardDiv = neuronCard.parentElement as HTMLElement;
    // Wait for the contenedor de agentes text within the neuron card
    await waitFor(() => {
      expect(within(neuronCardDiv).getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Get the container div for the installation panel
    const container = await screen.findByText(/Contenedor de agentes/i);
    const containerDiv = container.parentElement as HTMLElement;
    // Check the installation panel contents
    expect(within(containerDiv).getByText(/QUÉ/i)).toBeInTheDocument();
    expect(within(containerDiv).getByText(/POR QUÉ/i)).toBeInTheDocument();
    expect(within(containerDiv).getByText(/CÓMO/i)).toBeInTheDocument();
    // Check the QUÉ description
    expect(within(containerDiv).getByText(/El trabajador permite que esta neurona procese tareas del enjambre como lo hace la Mac./i)).toBeInTheDocument();

    // Click the install button (should be present)
    const installButton = within(containerDiv).getByRole("button", { name: /instalar el trabajador/i });
    expect(installButton).toBeInTheDocument();
    await userEvent.click(installButton);
    // After clicking, the panel should still be visible (no change in current implementation)
    expect(within(containerDiv).getByText(/QUÉ/i)).toBeInTheDocument();
    expect(within(containerDiv).getByText(/POR QUÉ/i)).toBeInTheDocument();
    expect(within(containerDiv).getByText(/CÓMO/i)).toBeInTheDocument();
  });
