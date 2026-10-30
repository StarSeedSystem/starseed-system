import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import { desdeEntregaMesh } from "@/lib/malla/cristal/adaptadores-recibos";
import { useDeliveryReceipts } from "@/ai/astraura/mesh";

// Mock the hooks
vi.mock("@/ai/astraura/mesh", () => ({
  useDeliveryReceipts: vi.fn(),
  useMeshState: () => ({
    status: "ready",
    nodes: [],
    region: "UNSET",
    self: { id: "test", num: 1 },
    transport: "serial",
  }),
}));

const mockReceipts = [
  {
    id: "dlv-test-1",
    scope: "neurona",
    cls: "P1",
    summary: "primer mensaje",
    hops: [
      { via: "wifi-mesh", label: "malla Wi‑Fi", role: "primary", status: "confirmed", detail: "entregado por malla", through: "nodo-1", at: Date.now() },
    ],
    status: "delivered" as const,
    startedAt: Date.now() - 1000,
    endedAt: Date.now(),
  },
  {
    id: "dlv-test-2",
    scope: "neurona",
    cls: "P1",
    summary: "segundo mensaje",
    hops: [
      { via: "webrtc", label: "WebRTC", role: "primary", status: "sent", detail: "enviado por WebRTC", through: "router-1", at: Date.now() },
    ],
    status: "sent" as const,
    startedAt: Date.now() - 1000,
    endedAt: Date.now(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("DeliveryReceiptsPanel", () => {
  it("renderiza sin errores cuando no hay recibos", () => {
    vi.mocked(useDeliveryReceipts).mockReturnValue([]);
    render(<DeliveryReceiptsPanel />);
    expect(screen.getByText("Sin recibos de entrega recientes")).toBeInTheDocument();
  });

  it("pinta dos filas con dos recibos falsos", async () => {
    vi.mocked(useDeliveryReceipts).mockReturnValue(mockReceipts);
    render(<DeliveryReceiptsPanel />);

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getByText("primer mensaje")).toBeInTheDocument();
    }, { timeout: 10000 });

    // Verify the content of both rows
    expect(screen.getByText("segundo mensaje")).toBeInTheDocument();
    expect(screen.getAllByText("Recibido").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enviado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("malla Wi‑Fi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WebRTC").length).toBeGreaterThan(0);
  });
});

describe("desdeEntregaMesh", () => {
  it("traduce delivered a recibido con medio y ruta", () => {
    const entrega = {
      status: "delivered" as const,
      hops: [
        { via: "wifi-mesh", status: "confirmed" },
        { via: "webrtc", status: "sent" },
      ],
    };
    const resultado = desdeEntregaMesh(entrega);
    expect(resultado.estado).toBe("recibido");
    expect(resultado.medio).toBe("wifi-mesh");
    expect(resultado.ruta).toEqual(["wifi-mesh", "webrtc"]);
  });

  it("traduce sent a enviado", () => {
    const entrega = {
      status: "sent" as const,
      hops: [
        { via: "ble", status: "sent" },
      ],
    };
    const resultado = desdeEntregaMesh(entrega);
    expect(resultado.estado).toBe("enviado");
    expect(resultado.medio).toBe("ble");
  });

  it("traduce queued a preparado", () => {
    const entrega = {
      status: "queued" as const,
      hops: [
        { via: "lora", status: "queued" },
      ],
    };
    const resultado = desdeEntregaMesh(entrega);
    expect(resultado.estado).toBe("preparado");
    expect(resultado.medio).toBe("lora");
  });

  it("traduce failed a fallido", () => {
    const entrega = {
      status: "failed" as const,
      hops: [
        { via: "webrtc", status: "failed" },
      ],
    };
    const resultado = desdeEntregaMesh(entrega);
    expect(resultado.estado).toBe("fallido");
    expect(resultado.medio).toBe("webrtc");
  });

  it("con vía desconocida da medio null", () => {
    const entrega = {
      status: "sent" as const,
      hops: [
        { via: "humo", status: "sent" },
      ],
    };
    const resultado = desdeEntregaMesh(entrega);
    expect(resultado.medio).toBeNull();
  });
});