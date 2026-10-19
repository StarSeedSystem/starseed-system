import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PanelReticula } from "../panel-reticula";

describe("PanelReticula", () => {
  const mockBaseEstado = {
    meshHealth: { score: 0.5 },
    nodes: [
      { num: 1, isSelf: true, shortName: "self" },
      { num: 2, shortName: "node2", role: "CLIENT" },
      { num: 3, shortName: "node3", role: "ROUTER" }
    ],
    edges: [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 1, to: 3 }
    ]
  };

  beforeEach(() => {
    // Mock the crypto.subtle.digest function
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (algorithm: string, data: Uint8Array) => {
          // Return a mock hash buffer (for SHA-256, 32 bytes)
          return new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]).buffer;
        })
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the header", () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    const header = screen.getByRole("heading", { level: 2 });
    expect(header.textContent).toBe("Sólido amorfo en tiempo real");
  });

  it("shows estado subenfriado when meshHealth.score is 0.5", () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    const estadoSection = screen.getByTestId("estado-section");
    const estadoText = estadoSection.querySelector("span");
    expect(estadoText.textContent).toBe("Estado: subenfriado");
  });

  it("shows temperatura bar", () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    const temperatureIcon = screen.getByTestId("temperature-icon");
    expect(temperatureIcon).toBeInTheDocument();
    // Check that the bar has the correct width (50% for score 0.5)
    const temperatureBar = screen.getByTestId("temperature-bar");
    expect(temperatureBar.getAttribute("style")).toContain("width: 50%");
  });

  it("shows footprint when computed", async () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    // Wait for the footprint to move past the loading state
    const footprintLabel = screen.getByText(/Huella corta:/i);
    expect(footprintLabel).toBeInTheDocument();
    // The footprint code should be present (we mocked it to return a hash)
    const footprintSection = screen.getByTestId("footprint-section");
    const footprintCode = footprintSection.querySelector("code");
    expect(footprintCode.textContent).toBe("12345678"); // First 8 hex digits of our mock hash
  });

  it("shows puentes list", async () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    const puentesSection = screen.getByTestId("puentes-section");
    const puentesLabel = puentesSection.getByText(/Puentes ordenados por coste/i);
    expect(puentesLabel).toBeInTheDocument();
    // We should see at least one bridge entry
    const puentesList = screen.getByTestId("puentes-list");
    // Check that the list contains a row with node2 ↔ node3
    const bridgeRow = await screen.findByText(/node2 ↔ node3/i);
    expect(bridgeRow).toBeInTheDocument();
  });

  it("shows coordinación section", () => {
    render(<PanelReticula estado={mockBaseEstado} />);
    const coordinacionSection = screen.getByTestId("coordinacion-section");
    const coordinacionLabel = coordinacionSection.getByText(/Coordinación de neuronas/i);
    expect(coordinacionLabel).toBeInTheDocument();
    // We should see the coordination media text
    const coordMedia = coordinacionSection.getByText(/Coordinación media:/i);
    expect(coordMedia).toBeInTheDocument();
    // Check that the coordination container exists
    const coordinacionContainer = screen.getByTestId("coordinacion-container");
    expect(coordinacionContainer).toBeInTheDocument();
  });

  it("shows empty state when no other neurons", () => {
    const mockEstado = {
      meshHealth: { score: 0.5 },
      nodes: [{ num: 1, isSelf: true, shortName: "self" }],
      edges: []
    };
    render(<PanelReticula estado={mockEstado} />);
    const emptyState = screen.getByTestId("empty-state");
    const zapIcon = screen.getByRole("img", { name: /zap/i });
    const emptyText = screen.getByText(/aún no llegó ninguna señal de otra neurona/i);
    expect(emptyText.textContent).toBe("aún no llegó ninguna señal de otra neurona");
  });
});