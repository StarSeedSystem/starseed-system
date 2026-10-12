import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NeuronasPanel from "../neuronas-panel"

// Mock the necessary hooks and functions
jest.mock("@/lib/neurons/presencia", () => ({
  usePresenciaNeuronas: () => ({
    conectado: true,
    medios: [{ n: "test-neuron-id" }],
  }),
}))

jest.mock("@/lib/neurons/neurons", () => ({
  ...jest.requireActual("@/lib/neurons/neurons"),
  ensureThisNeuron: async () => ({
    id: "test-neuron-id",
    name: "Test Neuron",
    kind: "desktop",
    capabilities: {
      platform: "macOS",
      browser: "Chrome 148",
      memoryGb: 8,
      cores: 4,
      battery: { level: 80, charging: true },
    },
    permissions: { sync: true },
    online: true,
    isThisDevice: true,
  }),
  listNeurons: async () => [
    {
      id: "test-neuron-id",
      name: "Test Neuron",
      kind: "desktop",
      capabilities: {
        platform: "macOS",
        browser: "Chrome 148",
        memoryGb: 8,
        cores: 4,
        battery: { level: 80, charging: true },
      },
      permissions: { sync: true },
      online: true,
      isThisDevice: true,
    },
  ],
  settingsFor: () => ({}),
  neuronHermioneSyncEnabled: () => false,
  isHermesLinked: () => false,
}))

jest.mock("@/lib/aurora/hermione-autosync", () => ({
  useHermioneStatus: () => ({
    status: "online",
    label: "Hermione en línea",
    pending: 0,
  }),
}))

jest.mock("@/lib/sync/realtime-sync", () => ({
  sendAccountBroadcast: jest.fn(),
}))

jest.mock("@/lib/brains/servers", () => ({
  saveServer: jest.fn().mockResolvedValue({ id: "test-server-id" }),
  linkServer: jest.fn().mockResolvedValue({ id: "test-link-id" }),
}))

jest.mock("@/ai/astraura/mesh", () => ({
  normalizeConnectivityConfig: () => ({}),
}))

describe("NeuronasPanel - Contenedor de agentes", () => {
  beforeEach(() => {
    // Mock navigator object for Mac 8 GB
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    })
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
    })
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: 4,
    })
    Object.defineProperty(navigator, "deviceMemory", {
      value: 8,
    })
    Object.defineProperty(navigator, "matchMedia", {
      value: jest.fn().mockImplementation((query) => ({
        matches: query === "(pointer: coarse)",
      })),
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("muestra la sección de contenedor de agentes para la neurona actual", async () => {
    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />)

    // Espera a que se cargue la neurona
    expect(await screen.findByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument()

    // Verifica que se muestre la sección de contenedor de agentes
    expect(await screen.findByText(/Contenedor de agentes/i)).toBeInTheDocument()

    // Verifica que se muestre la estimación (para Mac 8 GB debería ser 3 agentes)
    expect(await screen.findByText(/Con el trabajador instalado, al menos 3 agente/i)).toBeInTheDocument()

    // Verifica que se muestre el botón de instalar el trabajador
    const installButton = await screen.findByRole("button", {
      name: /instalar el trabajador/i,
    })
    expect(installButton).toBeInTheDocument()

    // Al hacer clic, se abre el panel de instalación
    await userEvent.click(installButton)
    expect(await screen.findByText(/Instalar el trabajador/i)).toBeInTheDocument()

    // En el panel, se muestra el mensaje sobre el emisor de códigos
    expect(
      await screen.findByText(
        /Mientras no exista el emisor de códigos \(necesita la migración de nodos, §8 del contrato\) el panel lo dice con esas palabras y no inventa un código/i
      )
    ).toBeInTheDocument()

    // Verifica que no se muestre el comando ni el botón de copiar
    expect(screen.queryByRole("button", { name: /copiar/i })).not.toBeInTheDocument()
  })

  test("muestra estimación para iPhone", async () => {
    // Mock navigator for iPhone
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    })
    Object.defineProperty(navigator, "platform", {
      value: "iPhone",
    })
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: 2,
    })
    Object.defineProperty(navigator, "deviceMemory", {
      value: 4,
    })

    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />)

    // Espera a que se cargue la neurona
    expect(await screen.findByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument()

    // Verifica que se muestre la sección de contenedor de agentes
    expect(await screen.findByText(/Contenedor de agentes/i)).toBeInTheDocument()

    // Verifica que se muestre la estimación para iPhone (0 agentes)
    expect(await screen.findByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument()
  })

  test("muestra estimación para Android", async () => {
    // Mock navigator for Android
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    })
    Object.defineProperty(navigator, "platform", {
      value: "Linux",
    })
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: 8,
    })
    Object.defineProperty(navigator, "deviceMemory", {
      value: 6,
    })

    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />)

    // Espera a que se cargue la neurona
    expect(await screen.findByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument()

    // Verifica que se muestre la sección de contenedor de agentes
    expect(await screen.findByText(/Contenedor de agentes/i)).toBeInTheDocument()

    // Verifica que se muestre la estimación para Android (1 agente debido a batería y red medida)
    expect(await screen.findByText(/Con el trabajador instalado, 1 agente/i)).toBeInTheDocument()
  })
})