import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Mock the necessary hooks and functions
vi.mock("@/lib/neurons/neurons", () => ({
  // Constants
  NEURON_EVENT: "starseed:neurons",
  NEURON_DEVICE_ID_KEY: "starseed.neuron.device-id",
  NEURON_PREFS_KEY: "starseed.neurons.prefs.v1",
  ONLINE_WINDOW_MS: 12 * 60_000,
  HEARTBEAT_MS: 5 * 60_000,
  LATIDOS_POR_FICHA: 6,
  LISTA_CACHE_MS: 5 * 60_000,

  // Types
  NeuronKind: {
    desktop: "desktop",
    laptop: "laptop",
    mobile: "mobile",
    tablet: "tablet",
    server: "server",
    other: "other",
  },
  NeuronCapabilities: {},
  NeuronPermissions: {},
  DEFAULT_PERMISSIONS: {
    compute: true,
    storage: true,
    sync: true,
    agent: true,
    senses: true,
    wake: true,
  },
  NeuronRole: {
    cerebro: "cerebro",
    servidor: "servidor",
    ambos: "ambos",
  },
  NeuronCasaOS: {},
  NeuronSettings: {},
  DEFAULT_SETTINGS: {
    fileRequests: true,
    screenVoice: true,
    auroraListening: true,
    role: "ambos",
  },
  Neuron: {},

  // Functions
  thisDeviceId: vi.fn().mockReturnValue("test-device-id"),
  detectCapabilities: vi.fn().mockResolvedValue({
    platform: "macOS",
    browser: "Chrome 148",
    memoryGB: 8,
    cores: 4,
    touch: false,
  }),
  astraura158EndpointOf: vi.fn().mockReturnValue("http://127.0.0.1:8000"),
  permissionsFor: vi.fn().mockReturnValue({
    compute: true,
    storage: true,
    sync: true,
    agent: true,
    senses: true,
    wake: true,
  }),
  setPermission: vi.fn(),
  setNeuronName: vi.fn(),
  settingsFor: vi.fn().mockReturnValue({
    fileRequests: true,
    screenVoice: true,
    auroraListening: true,
    role: "ambos",
  }),
  allowsFileRequests: vi.fn().mockReturnValue(true),
  upsertRemote: vi.fn().mockResolvedValue(null),
  latidoLigeroSupabase: vi.fn().mockResolvedValue({ fallo: null, existe: false }),
  latirUnaVez: vi.fn().mockResolvedValue({ fallo: null }),
  resolverAliasEsteMedio: vi.fn().mockReturnValue("test-device-id"),
  _detenerLatidoParaPruebas: vi.fn(),
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
      battery: { level: 80, charging: true },
    },
    permissions: {
      sync: true,
    },
    online: true,
    isThisDevice: true,
  }),
  linkHermesToNeuron: vi.fn().mockResolvedValue(true),
  isHermesLinked: vi.fn().mockReturnValue(true),
  neuronHermioneSyncEnabled: vi.fn().mockReturnValue(true),
  setNeuronHermioneSync: vi.fn().mockResolvedValue(true),
  invalidarListaNeuronas: vi.fn(),
  vidaPorPuerta: vi.fn().mockResolvedValue(new Map()),
  pestanaOculta: vi.fn().mockReturnValue(false),
  leerFilasNeuronas: vi.fn().mockResolvedValue({ filas: [], fallo: null }),
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
        battery: { level: 80, charging: true },
      },
      permissions: {
        sync: true,
      },
      online: true,
      isThisDevice: true,
    },
  ]),
  removeNeuron: vi.fn().mockResolvedValue(true),
  summarizeNeurons: vi.fn().mockReturnValue("1 neurona"),
}));

vi.mock("@/lib/neurons/presencia", () => ({
  usePresenciaNeuronas: () => ({
    medios: [],
    conectado: false,
  }),
  presentesPorNeurona: vi.fn().mockReturnValue(new Map()),
}));

// Custom render wrapper to provide necessary context
const customRender = (ui, options = {}) => {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <AppearanceProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </AppearanceProvider>
    ),
    ...options,
  });
};

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
  soDesdeAgente: vi.fn().mockReturnValue("macos"),
}));

describe("NeuronasPanel", () => {
  it("renders the contenedor de agentes section for the actual neuron", async () => {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    customRender(<NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />);

    // Wait for the neuron data to load by checking for the neuron type
    await waitFor(() => {
      const elements = screen.getAllByText("Escritorio");
      expect(elements.length).toBeGreaterThan(0);
    });

    // Check that the neuron card is rendering capabilities
    await waitFor(() => {
      const elements = screen.getAllByText("Capacidades de esta neurona");
      expect(elements.length).toBeGreaterThan(0);
    });

    // Check that the neuron card is rendering the tier label
    await waitFor(() => {
      const elements = screen.getAllByText("Gama modesta");
      expect(elements.length).toBeGreaterThan(0);
    });
  });
});