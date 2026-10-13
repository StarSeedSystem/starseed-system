import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { NeuronCard } from "@/components/cerebro/neuronas-panel";
import { type Neuron } from "@/lib/neurons/neurons";

const baseNeuron: Neuron = {
  id: "mac-a1b2c3",
  name: "MacBook Pro",
  kind: "laptop",
  role: "ambos",
  isThisDevice: false,
  online: true,
  last_seen_at: "2024-01-01T00:00:00Z",
  permissions: { sync: true, syncBrains: true, syncLibrary: true, syncNeurons: true, syncExternal: false },
  capabilities: {
    platform: "macos",
    memoryGb: 8,
    cores: 8,
    touch: false,
    battery: null,
    redMedida: false,
    syncDeviceId: "device1",
  },
  casaos: null,
  notes: null,
};

function pintar() {
  return render(
    <AppearanceProvider>
      <ConfirmProvider>
        <NeuronCard neuron={baseNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
      </ConfirmProvider>
    </AppearanceProvider>
  );
}

beforeEach(() => {
  pintar();
});

afterEach(() => {
  cleanup();
});

describe("NeuronCard Component Tests", () => {
  it("renders contenedor de agentes section", () => {
    expect(screen.getByText(/contenedor de agentes/i)).toBeInTheDocument();
  });

  it("shows estimation for Mac 8 GB", () => {
    const macNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "macOS",
        memoryGb: 8,
        cores: 8,
        touch: false,
      },
    };

    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={macNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    expect(screen.getByText(/3 agente/i)).toBeInTheDocument();
    expect(screen.getByText(/Instalar el trabajador/i)).toBeInTheDocument();
  });

  it("shows estimation for iPhone (iOS, 0 agents)", () => {
    const iphoneNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "iOS",
        memoryGb: 4,
        cores: 6,
        touch: true,
      },
    };

    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={iphoneNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor/i)).toBeInTheDocument();
    expect(screen.queryByText(/Instalar el trabajador/i)).not.toBeInTheDocument();
  });

  it("shows estimation for Android (1 agent due to battery and red medida)", () => {
    const androidNeuron = {
      ...baseNeuron,
      capabilities: {
        ...baseNeuron.capabilities,
        platform: "Android",
        memoryGb: 6,
        cores: 4,
        touch: true,
        battery: { level: 15, charging: false },
      },
    };

    render(
      <AppearanceProvider>
        <ConfirmProvider>
          <NeuronCard neuron={androidNeuron} live={true} brainId="brain1" brainName="Test Brain" onChanged={() => {}} />
        </ConfirmProvider>
      </AppearanceProvider>
    );

    expect(screen.getByText(/0 agente/i)).toBeInTheDocument();
    expect(screen.getByText(/Instalar el trabajador/i)).toBeInTheDocument();
  });

  it("shows installation panel when button is clicked", async () => {
    const { container } = pintar();

    const installButton = screen.getByRole("button", { name: /instalar el trabajador/i });
    expect(installButton).toBeInTheDocument();
    await userEvent.click(installButton);

    expect(screen.getByText(/QUÉ es el trabajador/i)).toBeInTheDocument();
    expect(screen.getByText(/POR QUÉ instalarlo/i)).toBeInTheDocument();
    expect(screen.getByText(/CÓMO instalarlo/i)).toBeInTheDocument();
    expect(screen.getByText(/Mientras no exista el emisor de códigos/i)).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: /copiar comando/i });
    expect(copyButton).toBeInTheDocument();
    await userEvent.click(copyButton);
  });
});
