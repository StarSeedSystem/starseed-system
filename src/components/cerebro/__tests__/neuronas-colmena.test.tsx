import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { listNeurons, type Neuron, type NeuronCapabilities } from "@/lib/neurons/neurons";
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
          memoryGb: 8,
          cores: 4,
          touch: false,
        },
        permissions: {
          sync: true,
        },
        online: true,
        isThisDevice: true,
      }),
      listNeurons: vi.fn(),
      summarizeNeurons: vi.fn().mockReturnValue("1 neurona en tu cuenta · 1 online · 1 con IA local."),
      NEURON_EVENT: "starseed:neurons",
      thisDeviceId: vi.fn().mockReturnValue("test-device-id"),
      detectCapabilities: vi.fn().mockResolvedValue({
        platform: "macOS",
        browser: "Chrome 148",
        memoryGb: 8,
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

/** Una neurona completa con las capacidades que el panel lee de verdad. */
function neurona(capabilities: Partial<NeuronCapabilities> = {}): Neuron {
  return {
    id: "test-id",
    name: "Test Neuron",
    kind: "desktop",
    capabilities: {
      platform: "Linux",
      browser: "Chrome 148",
      memoryGb: 8,
      cores: 8,
      touch: false,
      ...capabilities,
    },
    permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
    online: true,
    isThisDevice: true,
  };
}

async function pintar() {
  const NeuronasPanel = (await import("../neuronas-panel")).default;
  render(
    <AppearanceProvider>
      <ConfirmProvider>
        <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
      </ConfirmProvider>
    </AppearanceProvider>
  );
}

describe("NeuronasPanel", () => {
  beforeEach(() => {
    vi.mocked(listNeurons).mockResolvedValue([neurona()]);
  });
  afterEach(() => cleanup());

  it("renders the contenedor de agentes section for the actual neuron", async () => {
    await pintar();

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });

    // Check that the contenedor de agentes section is present
    expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
  });

  it("una neurona de 8 GB y 8 núcleos: el panel estima 3 agentes a la vez", async () => {
    // «macOS» todavía no lo reconoce `soDesdeAgente` (fallo real, reportado aparte): se usa «Linux», que sí.
    vi.mocked(listNeurons).mockResolvedValue([neurona({ platform: "Linux", memoryGb: 8, cores: 8 })]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/al menos 3 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un Android: el panel estima 1 agente (el tope del móvil)", async () => {
    vi.mocked(listNeurons).mockResolvedValue([neurona({ platform: "Android", memoryGb: 6, cores: 4, touch: true })]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/Con el trabajador instalado, 1 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un iPad: el panel dice que no puede trabajar como contenedor", async () => {
    vi.mocked(listNeurons).mockResolvedValue([neurona({ platform: "iPadOS", memoryGb: 4, cores: 6, touch: true })]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    });
  });

  it("el panel de instalación explica el QUÉ, el POR QUÉ y el CÓMO (y avisa de que el comando aún no está)", async () => {
    await pintar();
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
    expect(screen.getByText("QUÉ")).toBeInTheDocument();
    expect(screen.getByText("POR QUÉ")).toBeInTheDocument();
    expect(screen.getByText("CÓMO")).toBeInTheDocument();
    expect(
      screen.getByText(/El comando de instalación se proporcionará cuando el emisor de códigos esté disponible/i),
    ).toBeInTheDocument();
  });
});