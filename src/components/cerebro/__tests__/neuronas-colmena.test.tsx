import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

// Mock the navigator object
const mockNavigator = (userAgent: string, platform: string, deviceMemory: number | undefined, hardwareConcurrency: number | undefined, maxTouchPoints: number, connection: { saveData?: boolean; type?: string } | null, getBatteryPromise: Promise<{ charging: boolean; level: number }> | null) => {
  Object.defineProperty(window, 'navigator', {
    value: {
      userAgent,
      platform,
      deviceMemory,
      hardwareConcurrency,
      maxTouchPoints,
      connection,
      getBattery: () => getBatteryPromise,
    },
    writable: true
  });
};

// Mock the '@/lib/neurons/neurons' module
vi.mock("@/lib/neurons/neurons");

// Import the mocked functions and the panel
import { listNeurons, ensureThisNeuron } from "@/lib/neurons/neurons";
import NeuronasPanel from "../neuronas-panel";

// Mock the appearance context hook using the alias
vi.mock("@/context/appearance-context", () => ({
  useAppearance: () => ({
    config: {
      themeStore: {
        activeMode: "primary",
      },
      styling: {
        radius: 0.5,
      },
    },
    // We don't need to mock other properties for the Button component to work.
  }),
}));

describe("NeuronasPanel - Contenedor de agentes", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    Object.defineProperty(window, 'navigator', {
      value: {
        userAgent: "",
        platform: "",
        deviceMemory: undefined,
        hardwareConcurrency: undefined,
        maxTouchPoints: 0,
        connection: null,
        getBattery: () => Promise.resolve({ charging: false, level: 1 }),
      },
      writable: true
    });
  });

  it("muestra los botones de contenedor cuando la neurona tiene nodo", async () => {
    // Mock una neurona con nodo
    const mockNeuron = {
      id: "test-id",
      name: "Test Neurona",
      kind: "desktop",
      capabilities: {
        platform: "macOS",
        plataforma: "macOS",
        browser: "Chrome",
        memoryGb: 8,
        cores: 4,
        // ... other capabilities
      },
      permissions: {
        compute: true,
        storage: true,
        sync: true,
        agent: true,
        senses: true,
        wake: true,
      },
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      online: true,
      isThisDevice: true,
      // Fields we added for the task
      nodo: "test-node-id",
      enCurso: 2,
      contenedor: {
        activo: true,
        agentes: 2,
        apto: true,
        motivo: "",
      },
      desconectando: false,
      settings: {
        offerPublicInternet: false,
        // We can add other settings if needed, but we are not using them in the test.
      },
    };

    // Set the mock implementation for listNeurons and ensureThisNeuron
    listNeurons.mockResolvedValueOnce([mockNeuron]);
    ensureThisNeuron.mockResolvedValueOnce(mockNeuron);

    // Mock the navigator for Mac 8 GB
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
      "MacIntel",
      8,
      4,
      0,
      null,
      null
    );

    // Render the panel
    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />);

    // Wait for the content to load
    await waitFor(() => {
      expect(screen.getByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument();
    });

    // Check that the current neuron card is displayed
    const neuronCard = screen.getByText(/Test Neurona/i);
    expect(neuronCard).toBeInTheDocument();

    // Check that the "Contenedor de agentes" section is present
    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();

    // Check that the buttons are present (we expect three buttons: Desconectar, Dejar de usar como contenedor, Instalar el trabajador)
    // Note: The exact labels depend on the state.
    // We have contenedor.activo: true, so the button should be "Dejar de usar como contenedor"
    expect(screen.getByRole("button", { name: /Desconectar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dejar de usar como contenedor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instalar el trabajador/i })).toBeInTheDocument();
  });

  it("muestra la estimación y el botón de instalar cuando la neurona no tiene nodo", async () => {
    // Mock una neurona sin nodo
    const mockNeuron = {
      id: "test-id",
      name: "Test Neurona",
      kind: "desktop",
      capabilities: {
        platform: "macOS",
        plataforma: "macOS",
        browser: "Chrome",
        memoryGb: 8,
        cores: 4,
        // ... other capabilities
      },
      permissions: {
        compute: true,
        storage: true,
        sync: true,
        agent: true,
        senses: true,
        wake: true,
      },
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      online: true,
      isThisDevice: true,
      // Fields we added for the task
      nodo: null,
      enCurso: 0,
      contenedor: null,
      desconectando: false,
      settings: {
        offerPublicInternet: false,
        // We can add other settings if needed, but we are not using them in the test.
      },
    };

    // Set the mock implementation for listNeurons and ensureThisNeuron
    listNeurons.mockResolvedValueOnce([mockNeuron]);
    ensureThisNeuron.mockResolvedValueOnce(mockNeuron);

    // Mock the navigator for Mac 8 GB
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
      "MacIntel",
      8,
      4,
      0,
      null,
      null
    );

    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />);

    await waitFor(() => {
      expect(screen.getByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument();
    });

    const neuronCard = screen.getByText(/Test Neurona/i);
    expect(neuronCard).toBeInTheDocument();

    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();

    // Check the estimation text
    expect(screen.getByText(/Con el trabajador instalado, al menos 2 agente.s? a la vez/i)).toBeInTheDocument();

    // Check the install button
    expect(screen.getByRole("button", { name: /Instalar el trabajador/i })).toBeInTheDocument();
  });

  it("muestra que iPhone no puede trabajar", async () => {
    // Mock una neurona sin nodo
    const mockNeuron = {
      id: "test-id",
      name: "Test Neurona",
      kind: "mobile",
      capabilities: {
        platform: "iOS",
        plataforma: "iPhone",
        browser: "Safari",
        memoryGb: 4,
        cores: 2,
        // ... other capabilities
      },
      permissions: {
        compute: true,
        storage: true,
        sync: true,
        agent: true,
        senses: true,
        wake: true,
      },
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      online: true,
      isThisDevice: true,
      // Fields we added for the task
      nodo: null,
      enCurso: 0,
      contenedor: null,
      desconectando: false,
      settings: {
        offerPublicInternet: false,
        // We can add other settings if needed, but we are not using them in the test.
      },
    };

    // Set the mock implementation for listNeurons and ensureThisNeuron
    listNeurons.mockResolvedValueOnce([mockNeuron]);
    ensureThisNeuron.mockResolvedValueOnce(mockNeuron);

    // Mock the navigator for iPhone
    mockNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
      "iPhone",
      4,
      2,
      0,
      null,
      null
    );

    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />);

    await waitFor(() => {
      expect(screen.getByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument();
    });

    const neuronCard = screen.getByText(/Test Neurona/i);
    expect(neuronCard).toBeInTheDocument();

    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();

    // Check the estimation text for iPhone
    expect(screen.getByText(/iPhone y iPad no pueden trabajar como contenedor; sí pueden mirar y mandar órdenes/i)).toBeInTheDocument();

    // The install button should not be visible for iPhone
    expect(screen.queryByRole("button", { name: /Instalar el trabajador/i })).not.toBeInTheDocument();
  });

  it("muestra que Android con Termux puede tener 1 agente", async () => {
    // Mock una neurona sin nodo
    const mockNeuron = {
      id: "test-id",
      name: "Test Neurona",
      kind: "mobile",
      capabilities: {
        platform: "Android",
        plataforma: "Android",
        browser: "Chrome",
        memoryGb: 4,
        cores: 2,
        // ... other capabilities
      },
      permissions: {
        compute: true,
        storage: true,
        sync: true,
        agent: true,
        senses: true,
        wake: true,
      },
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      online: true,
      isThisDevice: true,
      // Fields we added for the task
      nodo: null,
      enCurso: 0,
      contenedor: null,
      desconectando: false,
      settings: {
        offerPublicInternet: false,
        // We can add other settings if needed, but we are not using them in the test.
      },
    };

    // Set the mock implementation for listNeurons and ensureThisNeuron
    listNeurons.mockResolvedValueOnce([mockNeuron]);
    ensureThisNeuron.mockResolvedValueOnce(mockNeuron);

    // Mock the navigator for Android
    mockNavigator(
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36",
      "Linux",
      4,
      2,
      0,
      { type: 'cellular' }, // Simulate cellular connection
      null
    );

    render(<NeuronasPanel brainId="test-brain" brainName="Test Brain" />);

    await waitFor(() => {
      expect(screen.getByText(/Neuronas — tus dispositivos/i)).toBeInTheDocument();
    });

    const neuronCard = screen.getByText(/Test Neurona/i);
    expect(neuronCard).toBeInTheDocument();

    expect(screen.getByText(/Contenedor de agentes/i)).toBeInTheDocument();

    // Check the estimation text for Android with red measured connection
    // With 4 GB RAM, 2 cores, but red measured -> should be limited to 1 agent
    expect(screen.getByText(/Con el trabajador instalado, 1 agente a la vez/i)).toBeInTheDocument();

    // Check the install button
    expect(screen.getByRole("button", { name: /Instalar el trabajador/i })).toBeInTheDocument();
  });
});