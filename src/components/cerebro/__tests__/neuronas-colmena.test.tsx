import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
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

// `@/lib/metagenesis/colmena` NO se simula: es puro (sin red, sin disco) y lo que se prueba aquí es
// que el panel estima DE VERDAD, con las capacidades que publica la neurona.

import { listNeurons, type Neuron } from "@/lib/neurons/neurons";

/** La neurona tal como la publica `detectCapabilities`: el panel estima a partir de sus capacidades. */
const NEURON: Neuron = {
  id: "test-id",
  name: "Test Neuron",
  kind: "desktop",
  capabilities: { platform: "Linux", browser: "Chrome 148", memoryGb: 8, cores: 4, touch: false },
  permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
  online: true,
  isThisDevice: true,
};

/** La misma neurona con otras capacidades. */
function neurona(capabilities: Partial<Neuron["capabilities"]>): Neuron {
  return { ...NEURON, capabilities: { ...NEURON.capabilities, ...capabilities } };
}

async function pintar() {
  const NeuronasPanel = (await import("../neuronas-panel")).default;
  return render(
    <AppearanceProvider>
      <ConfirmProvider>
        <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
      </ConfirmProvider>
    </AppearanceProvider>
  );
}

describe("NeuronasPanel · la sección «Contenedor de agentes»", () => {
  beforeEach(() => {
    vi.mocked(listNeurons).mockResolvedValue([NEURON]);
  });
  afterEach(() => cleanup());

  it("renders the contenedor de agentes section for the actual neuron", async () => {
    await pintar();

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
  });

  it("una neurona de 8 GB y 8 núcleos: el panel estima 3 agentes a la vez", async () => {
    // La etiqueta que publica la neurona («macOS») todavía no la reconoce `soDesdeAgente` —fallo real, reportado
    // aparte—, así que aquí se usa «Linux», que sí: el número de agentes es el de una Mac de 8 GB.
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