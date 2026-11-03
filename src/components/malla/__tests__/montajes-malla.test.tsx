/**
 * Montajes de la malla de sílice en sus pantallas reales (Ola 1012Q, contrato
 * §6–§7): el widget del radar de internet (sección Actividad) y el panel de
 * recibos de entrega. Con dos recibos falsos se pintan DOS filas — dato, hora,
 * estado, medio y ruta— y sin recibos se declara el vacío honesto. Jsdom, sin
 * tocar el store vivo: los recibos entran por el hook de la malla doblado aquí.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import { InternetRadarWidget } from "@/components/dashboard/widgets/internet-radar-widget";

/** Recibo falso: `via` dice por dónde pasó el dato — «server» o «server-relay»
 *  para lo confirmado por el servidor, «wifi-direct» para la LAN. Lo usan el
 *  radar (Actividad) y el panel de recibos de entrega. */
const reciboFalso = (id: string, resumen: string, status: "delivered" | "sent", via = "server") => ({
  id,
  scope: "local-group",
  cls: "P1",
  summary: resumen,
  status,
  hops: [
    { via, label: "Servidor", role: "primary", status: "confirmed", detail: "fila creada", through: "nube", at: 1 },
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

describe("panel de recibos de entrega montado en Señales (contrato §6)", () => {
  it("con dos recibos falsos del hook pinta dos filas con dato, hora, estado, medio y ruta", () => {
    estado.recibos = [
      reciboFalso("dlv-uno", "Nota de prueba uno", "delivered", "server-relay"),
      reciboFalso("dlv-dos", "Nota de prueba dos", "sent", "wifi-direct"),
    ];
    render(<DeliveryReceiptsPanel />);
    const filas = screen.getAllByTestId("fila-recibo");
    expect(filas).toHaveLength(2);
    // Primera fila: confirmada por el relé → recibido, por Servidor.
    expect(within(filas[0]).getByText("Nota de prueba uno")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(filas[0]).getByText("Recibido")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Servidor")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/ruta: servidor/)).toBeInTheDocument();
    // Segunda fila: salió por la LAN → enviado, por Wi-Fi en la malla.
    expect(within(filas[1]).getByText("Nota de prueba dos")).toBeInTheDocument();
    expect(within(filas[1]).getByText("Enviado")).toBeInTheDocument();
    expect(within(filas[1]).getByText(/ruta: wifi-lan/)).toBeInTheDocument();
  });

  it("declara el vacío honesto cuando la malla aún no devuelve recibos", () => {
    render(<DeliveryReceiptsPanel />);
    expect(screen.queryByTestId("fila-recibo")).toBeNull();
    expect(screen.getByText(/aún no hay recibos/)).toBeInTheDocument();
  });
});
