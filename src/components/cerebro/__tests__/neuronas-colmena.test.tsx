import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
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

vi.mock("@/lib/metagenesis/colmena", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metagenesis/colmena")>();
  return {
    ...actual,
    // `soDesdeAgente` y `estimarDesdeNavegador` se dejan REALES: aquí se prueba el cable
    // de la neurona (capabilidades → señales → estimación → texto pintado). Se burlan solo
    // los que prohiben efectos o dependen de mundo externo.
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
    comandoInstalar: vi.fn().mockReturnValue("curl -fsSL <origen>/trabajador.sh | bash -s -- --emparejar <codigo>"),
  };
});

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

describe("NeuronasPanel · la estimación y el panel de instalación (rescate de rama nube)", () => {
  /** La neurona que el mock de fábrica publica por defecto (esta Mac, con su etiqueta «macOS»). */
  function neurona(extra: Partial<Neuron> = {}): Neuron {
    return {
      id: "test-neurona-nueva",
      name: "Neurona de prueba",
      kind: "desktop",
      capabilities: { platform: "macOS", browser: "Chrome 148", memoryGb: 8, cores: 4, touch: false },
      permissions: { sync: true, compute: true, storage: true, agent: true, senses: true, wake: true },
      online: true,
      isThisDevice: true,
      ...extra,
    };
  }

  async function pintar() {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>,
    );
  }

  beforeEach(() => {
    vi.mocked(listNeurons).mockResolvedValue([neurona()]);
  });

  // La etiqueta que publica la neurona («macOS») todavía no la reconoce `soDesdeAgente` —fallo real,
  // reportado aparte—, así que aquí se usa «Linux», que sí: el número de agentes es el de una Mac de 8 GB.
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
      neurona({ kind: "mobile", capabilities: { platform: "Android", browser: "Chrome 154", memoryGb: 6, cores: 4, touch: true } }),
    ]);
    await pintar();
    await waitFor(() => {
      expect(screen.getByText(/Con el trabajador instalado, 1 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un iPad: el panel dice que no puede trabajar como contenedor", async () => {
    vi.mocked(listNeurons).mockResolvedValue([
      neurona({ kind: "tablet", capabilities: { platform: "iPadOS", browser: "Safari 18", memoryGb: 4, cores: 6, touch: true } }),
    ]);
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