import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers);

// En este repo `globals` está en `false`: la limpieza automática de @testing-library no se registra sola.
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
      listNeurons: vi.fn().mockResolvedValue([
        {
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
        },
      ]),
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

// «@/lib/metagenesis/colmena» NO se mockea: es un módulo PURO (ni red, ni disco, ni procesos) y sus
// umbrales son el contrato (6 GB, 4 agentes, (RAM − 2) ÷ 2). Mockearlo tapaba justo lo que esta tarjeta
// tiene que acertar: lo que el aparato podría aportar sale de sus capacidades.

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

/* ─────────────────────────── Neurona de prueba ─────────────────────────── */

/**
 * Una neurona de este aparato con las capacidades que le diga cada caso: de ahí saca la tarjeta
 * lo que el aparato podría aportar (la estimación) y qué sistema es.
 */
function neurona(capacidades: Partial<Neuron["capabilities"]> = {}): Neuron {
  return {
    id: "test-id",
    name: "Test Neuron",
    kind: "desktop",
    capabilities: {
      platform: "macOS",
      browser: "Chrome 154",
      memoryGb: 8,
      cores: 8,
      touch: false,
      ...capacidades,
    },
    permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
    online: true,
    isThisDevice: true,
  };
}

/** Pinta el panel de Neuronas con una neurona de este aparato. */
async function pintar(capacidades: Partial<Neuron["capabilities"]> = {}) {
  vi.mocked(listNeurons).mockResolvedValue([neurona(capacidades)]);
  const NeuronasPanel = (await import("../neuronas-panel")).default;
  render(
    <AppearanceProvider>
      <ConfirmProvider>
        <NeuronasPanel brainId="test-brain-id" brainName="Test Brain" />
      </ConfirmProvider>
    </AppearanceProvider>,
  );
}

describe("NeuronasPanel · lo que este aparato podría aportar", () => {
  it("la estimación sale de las capacidades: 8 GB y 8 núcleos dan al menos 3 agentes", async () => {
    // macOS e iOS NO se reconocen hoy: el panel arma una UA con `capabilities.platform` ("macOS", "iOS")
    // y `soDesdeAgente` solo mira "macintosh|mac os x|macintel" o "iphone|ipad|ipod", así que en la Mac
    // y en el iPhone la tarjeta acaba diciendo «No reconozco este sistema.» (fallo real, fuera de estos
    // archivos). Aquí se prueba con un sistema que sí se reconoce: es la misma función pura.
    await pintar({ platform: "Linux", browser: "Firefox 140", memoryGb: 8, cores: 8 });
    await waitFor(() => {
      expect(screen.getByText("Con el trabajador instalado, al menos 3 agente(s) a la vez.")).toBeInTheDocument();
    });
  });

  it("un Android de 6 GB da un agente como mucho, y el panel lo dice", async () => {
    // Android se recorta a 1 agente (contrato §2). Con la batería cargando no entra el recorte del 20 %:
    // la batería llega en PORCENTAJE (0-100) y la función espera la fracción (0-1) — otro fallo real.
    await pintar({
      platform: "Android",
      browser: "Chrome 154",
      memoryGb: 6,
      cores: 4,
      touch: true,
      battery: { level: 100, charging: true },
    });
    await waitFor(() => {
      expect(screen.getByText("Con el trabajador instalado, 1 agente(s) a la vez.")).toBeInTheDocument();
    });
  });

  it("la tarjeta explica QUÉ, POR QUÉ y CÓMO, y no promete un comando que todavía no existe", async () => {
    await pintar();
    await waitFor(() => {
      expect(screen.getByText("Contenedor de agentes")).toBeInTheDocument();
    });
    expect(screen.getByText("QUÉ")).toBeInTheDocument();
    expect(screen.getByText("POR QUÉ")).toBeInTheDocument();
    expect(screen.getByText("CÓMO")).toBeInTheDocument();
    // El emisor de códigos aún no existe: la tarjeta lo dice en vez de enseñar un comando que no funciona.
    expect(screen.getByText(/el emisor de códigos esté disponible/)).toBeInTheDocument();
  });
});
