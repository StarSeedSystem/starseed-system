/**
 * Montajes de los recibos de entrega de la malla en su pantalla real
 * (Ola 1012Q, contrato §6–§7): con dos recibos falsos se pintan DOS filas,
 * cada una con su dato y su estado; sin recibos se declara el vacío honesto.
 * Jsdom, sin tocar el store vivo: los recibos entran por el hook de la malla.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "@/components/dashboard/widgets/_social-d/pruebas/prueba-marco";

preparaDom();

const estado = vi.hoisted(() => ({ recibos: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "yo" }));
vi.mock("@/components/mesh/signals-radar", () => ({
  SignalsRadar: () => <div data-testid="radar-senales" />,
}));
vi.mock("@/ai/astraura/mesh", () => ({
  useMeshState: () => ({
    status: "idle",
    region: "EU_868",
    nodes: [],
    wifiHealth: { score: 0.9 },
    self: undefined,
  }),
  useNearbyBeacons: () => [],
  useDeliveryReceipts: () => estado.recibos,
  describeBands: () => [
    { id: "server", label: "Servidor · nube pública", kind: "internet", active: true, detail: "Alcance global", metrics: [], quick: [] },
  ],
  hasRelayKey: () => false,
  applyModemPreset: async () => true,
  recommendPreset: () => ({ presetKey: "LONG_FAST" }),
  getActiveModemPreset: () => "UNSET",
  refreshNearbyNow: () => undefined,
  transmit: async () => ({}),
}));

import { InternetRadarWidget } from "@/components/dashboard/widgets/internet-radar-widget";

const reciboFalso = (id: string, resumen: string, status: "delivered" | "sent") => ({
  id,
  scope: "local-group",
  cls: "P1",
  summary: resumen,
  status,
  hops: [
    { via: "server", label: "Servidor", role: "primary", status: "confirmed", detail: "fila creada", through: "nube", at: 1 },
  ],
  startedAt: 1,
  endedAt: 2,
});

afterEach(() => {
  cleanup();
  estado.recibos = [];
});

describe("recibos de entrega montados en la pantalla de malla", () => {
  it("pinta una fila por cada recibo de entrega (dos recibos falsos → dos filas)", async () => {
    estado.recibos = [
      reciboFalso("dlv-uno", "Nota de prueba uno", "delivered"),
      reciboFalso("dlv-dos", "Nota de prueba dos", "sent"),
    ];
    render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
    fireEvent.click(await screen.findByRole("button", { name: /Actividad/ }));
    const lista = await screen.findByRole("list", { name: "Transmisiones recientes" });
    expect(lista.querySelectorAll("li")).toHaveLength(2);
    // Cada fila enseña su dato y su estado traducido al modelo único.
    expect(screen.getByText("Nota de prueba uno")).toBeInTheDocument();
    expect(screen.getByText("Entregado")).toBeInTheDocument();
    expect(screen.getByText("Nota de prueba dos")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    // El medio de la ruta confirmada («server») se publica como pastilla.
    expect(screen.getAllByText(/Servidor/).length).toBeGreaterThanOrEqual(1);
  });

  it("declara su estado vacío cuando aún no hay ningún recibo", async () => {
    render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
    fireEvent.click(await screen.findByRole("button", { name: /Actividad/ }));
    expect(screen.queryByRole("list", { name: "Transmisiones recientes" })).toBeNull();
    expect(screen.getByText(/Sin transmisiones aún/)).toBeInTheDocument();
  });
});

// ── Panel de recibos de entrega (DeliveryReceiptsPanel) montado en Señales ──
// Los recibos entran por la prop de inyección para no depender del reloj del
// store: cada fila trae dato, hora, estado, medio (pastilla) y ruta.

import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import type { DeliveryReceipt } from "@/ai/astraura/mesh/delivery";

/** Recibo fijo del mesh, con hora fija para no depender del reloj ni de la red. */
const reciboEntregaFalso = (
  id: string,
  resumen: string,
  status: "delivered" | "sent",
): DeliveryReceipt => ({
  id,
  scope: "private",
  cls: "P2",
  summary: resumen,
  hops: [
    {
      via: "server-relay",
      label: "Relé del servidor",
      role: "primary",
      status: status === "delivered" ? "confirmed" : "sent",
      detail: "prueba",
      at: 1759000000000,
    },
  ],
  status,
  startedAt: 1759000000000,
  endedAt: 1759000000000,
});

describe("DeliveryReceiptsPanel montado en Señales", () => {
  afterEach(() => {
    cleanup();
  });

  it("pinta una fila por cada recibo (dos recibos falsos → dos filas)", () => {
    render(
      <DeliveryReceiptsPanel
        recibos={[
          reciboEntregaFalso("dlv-uno", "Nota de prueba uno", "delivered"),
          reciboEntregaFalso("dlv-dos", "Nota de prueba dos", "sent"),
        ]}
      />,
    );
    expect(screen.getAllByTestId("fila-recibo")).toHaveLength(2);
    // Cada fila enseña su dato y su estado traducido al modelo único.
    expect(screen.getByText("Nota de prueba uno")).not.toBeNull();
    expect(screen.getByText("Recibido")).not.toBeNull();
    expect(screen.getByText("Nota de prueba dos")).not.toBeNull();
    expect(screen.getByText("Enviado")).not.toBeNull();
    // El medio de la ruta confirmada («server-relay») se publica como pastilla.
    expect(screen.getAllByText("Servidor").length).toBeGreaterThanOrEqual(1);
  });

  it("declara su estado vacío cuando aún no hay ningún recibo", () => {
    render(<DeliveryReceiptsPanel recibos={[]} />);
    expect(screen.queryAllByTestId("fila-recibo")).toHaveLength(0);
    expect(screen.getByText(/aún no hay recibos/)).not.toBeNull();
  });
});
