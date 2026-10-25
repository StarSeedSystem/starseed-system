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
  const actual = await importOriginal<any>();
  return {
    ...(actual ?? {}),
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
    estimarDesdeNavegador: vi.fn((senales: any, touch: boolean) => {
      const ua = senales?.userAgent || senales?.plataforma || "";
      if (/iphone|ipad|ipod/i.test(ua) || (/macintosh|mac os x/i.test(ua) && touch)) {
        return { so: "ios", agentes: 0, explica: "iPhone y iPad no pueden trabajar como contenedor; sí pueden mirar y mandar órdenes." };
      }
      if (/android/i.test(ua)) {
        return { so: "android", agentes: 1, explica: "Con el trabajador instalado, 1 agente(s) a la vez." };
      }
      if (/linux/i.test(ua)) {
        return { so: "linux", agentes: 3, explica: "Con el trabajador instalado, al menos 3 agente(s) a la vez." };
      }
      if (/macintosh|mac os x|macintel/i.test(ua)) {
        return { so: "macos", agentes: 3, explica: "Con el trabajador instalado, al menos 3 agente(s) a la vez." };
      }
      if (/windows/i.test(ua)) {
        return { so: "windows", agentes: 3, explica: "Con el trabajador instalado, al menos 3 agente(s) a la vez." };
      }
      return actual.estimarDesdeNavegador ? actual.estimarDesdeNavegador(senales, touch) : { so: "otro", agentes: null, explica: "No reconozco este sistema." };
    }),
    comandoInstalar: vi.fn().mockReturnValue("curl -fsSL <origen>/trabajador.sh | bash -s -- --emparejar <codigo>"),
    soDesdeAgente: vi.fn((ua: string, plataforma = "", tactil = false) => {
      const t = `${ua} ${plataforma}`.toLowerCase();
      if (/iphone|ipad|ipod/.test(t) || (/macintosh|mac os x/.test(t) && tactil)) return "ios";
      if (/android/.test(t)) return "android";
      if (/windows/.test(t)) return "windows";
      if (/macintosh|mac os x|macintel/.test(t)) return "macos";
      if (/linux|x11|cros/.test(t)) return "linux";
      return "otro";
    }),
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

  it("una neurona de 8 GB y 8 núcleos: el panel estima 3 agentes a la vez", async () => {
    const { listNeurons } = await import("@/lib/neurons/neurons");
    (listNeurons as any).mockResolvedValue([
      {
        id: "test-id",
        name: "Test Neuron",
        kind: "desktop",
        capabilities: {
          platform: "Linux",
          browser: "Chrome 148",
          memoryGB: 8,
          cores: 8,
          touch: false,
        },
        permissions: {
          sync: true,
        },
        online: true,
        isThisDevice: true,
      },
    ]);
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/al menos 3 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un Android: el panel estima 1 agente (el tope del móvil)", async () => {
    const { listNeurons } = await import("@/lib/neurons/neurons");
    (listNeurons as any).mockResolvedValue([
      {
        id: "test-id",
        name: "Test Neuron",
        kind: "mobile",
        capabilities: {
          platform: "Android",
          browser: "Chrome 148",
          memoryGB: 6,
          cores: 4,
          touch: true,
        },
        permissions: {
          sync: true,
        },
        online: true,
        isThisDevice: true,
      },
    ]);
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/Con el trabajador instalado, 1 agente\(s\) a la vez/i)).toBeInTheDocument();
    });
  });

  it("un iPad: el panel dice que no puede trabajar como contenedor", async () => {
    const { listNeurons } = await import("@/lib/neurons/neurons");
    (listNeurons as any).mockResolvedValue([
      {
        id: "test-id",
        name: "Test Neuron",
        kind: "tablet",
        capabilities: {
          platform: "iPadOS",
          browser: "Safari",
          memoryGB: 4,
          cores: 6,
          touch: true,
        },
        permissions: {
          sync: true,
        },
        online: true,
        isThisDevice: true,
      },
    ]);
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    });
  });

  it("el panel de instalación explica el QUÉ, el POR QUÉ y el CÓMO (y avisa de que el comando aún no está)", async () => {
    const NeuronasPanel = (await import("../neuronas-panel")).default;
    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
        </ConfirmProvider>
      </AppearanceProvider>
    );
    await waitFor(() => {
      const els = screen.getAllByText("Contenedor de agentes");
      expect(els.length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("QUÉ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POR QUÉ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CÓMO").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/El comando de instalación se proporcionará cuando el emisor de códigos esté disponible/i).length,
    ).toBeGreaterThan(0);
  });
});