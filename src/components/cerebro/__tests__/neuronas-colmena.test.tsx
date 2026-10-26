import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

// Con `globals: false` no hay limpieza automática entre pruebas: los renders
// previos seguirían pegados al body y «Contenedor de agentes» aparecería
// duplicado. La hacemos a mano tras cada prueba.
afterEach(() => cleanup());

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

import {
  DEFAULT_PERMISSIONS,
  listNeurons,
  type Neuron,
  type NeuronCapabilities,
  type NeuronKind,
} from "@/lib/neurons/neurons";

// La colmena es PURA (sin window, sin red): se usa la de verdad — son sus
// umbrales y sus textos lo que estos casos fijan contra el panel.
vi.mock("@/lib/metagenesis/colmena", async (importOriginal) => ({
  ...(await importOriginal()),
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

describe("NeuronasPanel · estimación del contenedor con la colmena real", () => {
  /** Neurona de la cuenta con la forma que hoy espera `listNeurons` (esta-neurona). */
  function neurona(
    parcial: {
      id?: string;
      name?: string;
      kind?: NeuronKind;
      capabilities?: Partial<NeuronCapabilities>;
    } = {},
  ): Neuron {
    return {
      id: parcial.id ?? "test-id",
      name: parcial.name ?? "Test Neuron",
      kind: parcial.kind ?? "desktop",
      capabilities: {
        platform: "macOS",
        browser: "Chrome 148",
        memoryGb: 8,
        cores: 4,
        touch: false,
        ...parcial.capabilities,
      },
      permissions: { ...DEFAULT_PERMISSIONS, sync: true },
      online: true,
      isThisDevice: true,
    };
  }

  /** Pinta el panel y espera a que la sección del contenedor esté en pantalla. */
  async function pintar(): Promise<void> {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
  }

  it("una neurona de Linux con 8 GB y 8 núcleos: el panel estima 3 agentes a la vez", async () => {
    vi.mocked(listNeurons).mockResolvedValue([
      neurona({ capabilities: { platform: "Linux", browser: "Chrome 150", memoryGb: 8, cores: 8, touch: false } }),
    ]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/al menos 3 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un Android: el panel estima 1 agente (el tope del móvil)", async () => {
    vi.mocked(listNeurons).mockResolvedValue([
      neurona({
        kind: "mobile",
        capabilities: { platform: "Android", browser: "Chrome 154", memoryGb: 6, cores: 4, touch: true },
      }),
    ]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/Con el trabajador instalado, 1 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un iPad: el panel dice que no puede trabajar como contenedor", async () => {
    vi.mocked(listNeurons).mockResolvedValue([
      neurona({
        kind: "tablet",
        capabilities: { platform: "iPadOS", browser: "Safari 18", memoryGb: 4, cores: 6, touch: true },
      }),
    ]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    });
  });

  it("el panel de instalación explica el QUÉ, el POR QUÉ y el CÓMO (y avisa de que el comando aún no está)", async () => {
    await pintar();
    expect(screen.getByText("QUÉ")).toBeInTheDocument();
    expect(screen.getByText("POR QUÉ")).toBeInTheDocument();
    expect(screen.getByText("CÓMO")).toBeInTheDocument();
    expect(
      screen.getByText(/El comando de instalación se proporcionará cuando el emisor de códigos esté disponible/i),
    ).toBeInTheDocument();
  });
});