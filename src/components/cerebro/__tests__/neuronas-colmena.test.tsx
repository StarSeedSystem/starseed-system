import { render, screen, waitFor, userEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

// Mock the necessary hooks and functions
vi.mock("@/lib/neurons/neurons", () => ({
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
   summarizeNeurons: vi.fn().mockReturnValue("1 neurona"),
   NEURON_EVENT: "test-neuron-event",
   thisDeviceId: vi.fn().mockReturnValue("test-device-id"),
   detectCapabilities: vi.fn().mockResolvedValue({
     platform: "macOS",
     browser: "Chrome 148",
     memoryGB: 8,
     cores: 4,
     touch: false,
   }),
   settingsFor: vi.fn().mockReturnValue({
     fileRequests: true,
     screenVoice: true,
     auroraListening: true,
     sync: true,
     role: "ambos",
     notes: "",
     casaos: { enabled: false, url: "" },
     syncBrains: true,
     syncLibrary: true,
     syncNeurons: true,
     syncExternal: false,
     connectivity: {},
   }),
   neuronHermioneSyncEnabled: vi.fn().mockReturnValue(false),
   isHermesLinked: vi.fn().mockReturnValue(false),
 }));

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
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    // Wait for the neuron data to load
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /instalar el trabajador/i })).toBeInTheDocument();
    });

    // Click the button to open the panel
    await userEvent.click(screen.getByRole("button", { name: /instalar el trabajador/i }));

    // Wait for the contenedor de agentes section to be visible
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
  });
});