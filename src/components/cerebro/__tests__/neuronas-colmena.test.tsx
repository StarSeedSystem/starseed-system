import { render, screen, waitFor, userEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { botonesNeurona } from "@/lib/metagenesis/colmena";
import { NeuronCard } from "../neuronas-panel";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

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
      summarizeNeurons: vi.fn().mockReturnValue("1 neurona en tu cuenta · 1 online · 1 con IA local."),
      NEURON_EVENT: "starseed:neurons",
      thisDeviceId: vi.fn().mockReturnValue("test-device-id"),
      detectCapabilities: vi.fn().mockResolvedValue({
        platform: "macOS",
        browser: "Chrome 148",
        memoryGB: 8,
        cores: 4,
        touch: false,
      }),
    };
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

describe("NeuronCard", () => {
  const baseNeuron = {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders contenedor de agentes section", () => {
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={baseNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    expect(screen.getByText(/contenedor de agentes/i)).toBeInTheDocument();
  });

  it("shows estimation for Mac 8 GB", () => {
    const macNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "macOS",
        memoryGb: 8,
        cores: 8,
        touch: false,
      },
    };
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={macNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    // Should show estimation: 3 agents (since (8-2)/2 = 3, min(4,3,8) = 3)
    expect(screen.getByText(/3 agente/i)).toBeInTheDocument();
    expect(screen.getByText(/Instalar el trabajador/i)).toBeInTheDocument();
  });

  it("shows estimation for iPhone (iOS, 0 agents)", () => {
    const iphoneNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "iOS",
        memoryGb: 4,
        cores: 6,
        touch: true,
      },
    };
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={iphoneNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    // iPhone cannot work as contenedor: 0 agents
    expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    // The install button should not be visible for iOS? According to colmena.ts, instalar button is only for macos, linux, windows, android.
    // So for iOS, the instalar button should not be shown.
    expect(screen.queryByText(/Instalar el trabajador/i)).not.toBeInTheDocument();
  });

  it("shows estimation for Android (1 agent due to battery and red medida)", () => {
    const androidNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "Android",
        memoryGb: 6,
        cores: 4,
        touch: true,
        battery: { level: 15, charging: false }, // Low battery, not charging
      },
    };
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={androidNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    // Android: memoryGb=6 -> (6-2)/2 = 2, cores=4 -> min(4,2,4)=2, but then because Android: n = Math.min(n, 1) -> 1 agent
    // Also, battery level < 20% and not charging -> n = 0? Actually: if (s.bateria && !s.bateria.cargando) n = s.bateria.nivel < 0.2 ? 0 : Math.min(n, 1);
    // So with battery level 15% (<0.2) and not charging -> n = 0.
    expect(screen.getByText(/0 agente/i)).toBeInTheDocument();
    // The install button should be visible for Android
    expect(screen.getByText(/Instalar el trabajador/i)).toBeInTheDocument();
  });

  it("shows installation panel when button is clicked", async () => {
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={baseNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    const installButton = screen.getByRole("button", { name: /instalar el trabajador/i });
    expect(installButton).toBeInTheDocument();
    await userEvent.click(installButton);
    // The panel should open
    expect(screen.getByText(/QUÉ es el trabajador/i)).toBeInTheDocument();
    expect(screen.getByText(/POR QUÉ instalarlo/i)).toBeInTheDocument();
    expect(screen.getByText(/CÓMO instalarlo/i)).toBeInTheDocument();
    expect(screen.getByText(/Mientras no exista el emisor de códigos/i)).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: /copiar comando/i });
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton);
    // We expect a toast, but we don't test toasts in this unit test
  });
});