import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

  // Mock the necessary hooks and functions
  vi.mock("@/lib/neurons/neurons", async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
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