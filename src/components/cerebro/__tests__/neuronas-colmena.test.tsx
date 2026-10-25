import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
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

vi.mock("@/lib/metagenesis/colmena", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/metagenesis/colmena")>();
  return {
    ...actual,
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
    // Rescate 2026-10-25: `estimarDesdeNavegador` y `soDesdeAgente` son PURAS,
    // así que corren de verdad y las capacidades de cada neurona se reflejan
    // en el panel (Linux/Android/iPad dan textos distintos).
    estimarDesdeNavegador: vi.fn(actual.estimarDesdeNavegador),
    soDesdeAgente: vi.fn(actual.soDesdeAgente),
    comandoInstalar: vi.fn().mockReturnValue("curl -fsSL <origen>/trabajador.sh | bash -s -- --emparejar <codigo>"),
  };
});

/** Neurona completa con los mínimos que el panel espera (por defecto: este dispositivo). */
function neurona(parcial: Partial<Neuron>): Neuron {
  return {
    id: "n-prueba",
    name: "Neurona de prueba",
    kind: "desktop",
    capabilities: {
      platform: "macOS",
      browser: "Chrome 148",
      memoryGb: 8,
      cores: 4,
      touch: false,
    },
    permissions: { sync: true },
    online: true,
    isThisDevice: true,
    ...parcial,
  } as Neuron;
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
  afterEach(cleanup);

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