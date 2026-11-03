/**
 * Montajes de los recibos de entrega y de los permisos de antenas de la malla
 * en su pantalla real (Ola 1012Q, contrato §6–§7): con dos recibos falsos se
 * pintan DOS filas, cada una con su dato y su estado; sin recibos se declara
 * el vacío honesto. El panel de recibos acepta sus recibos por prop (costura
 * de pruebas, sin tocar el store vivo) y PermisosAntenas declara su
 * inventario honesto por plataforma.
 * Jsdom.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, act, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "@/components/dashboard/widgets/_social-d/pruebas/prueba-marco";
import type { DeliveryReceipt, DeliveryStatus, HopStatus } from "@/ai/astraura/mesh/delivery";
import type { TrafficClass } from "@/ai/astraura/mesh/types";
import type { TransmitScope, TransmitVia } from "@/ai/astraura/mesh/synaptic-router";

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
import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import PermisosAntenas from "@/components/malla/permisos-antenas";
import { inventarioPorMedio } from "@/lib/malla/cristal/permisos-antenas";

const reciboFalso = (id: string, resumen: string, status: DeliveryStatus) => ({
  id,
  scope: "local-group" as TransmitScope,
  cls: "P1" as TrafficClass,
  summary: resumen,
  status,
  hops: [
    { via: "server" as TransmitVia, label: "Servidor", role: "primary" as const, status: "confirmed" as HopStatus, detail: "fila creada", through: "nube", at: 1 },
  ],
  startedAt: 1,
  endedAt: 2,
});

afterEach(() => {
  cleanup();
  estado.recibos = [];
  vi.clearAllMocks();
  localStorage.clear();
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

describe("DeliveryReceiptsPanel — los mismos recibos montados en Señales", () => {
  it("pinta una fila por cada recibo (dos recibos falsos → dos filas), con dato, hora, estado y medio", () => {
    render(
      <EnMarco clase="l">
        <DeliveryReceiptsPanel
          recibos={[
            reciboFalso("dlv-uno", "Nota de prueba uno", "delivered"),
            reciboFalso("dlv-dos", "Nota de prueba dos", "sent"),
          ]}
        />
      </EnMarco>,
    );
    expect(screen.getByTestId("recibos-entrega")).toBeInTheDocument();
    expect(screen.getAllByTestId("fila-recibo")).toHaveLength(2);
    expect(screen.getByText("Nota de prueba uno")).toBeInTheDocument();
    expect(screen.getByText("Nota de prueba dos")).toBeInTheDocument();
    // El adaptador traduce 'delivered' → 'recibido' y 'sent' → 'enviado'.
    expect(screen.getByText("Recibido")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
  });

  it("declara su vacío honesto cuando todavía no hay recibos", () => {
    render(<EnMarco clase="l"><DeliveryReceiptsPanel recibos={[]} /></EnMarco>);
    expect(screen.queryAllByTestId("fila-recibo")).toHaveLength(0);
    expect(screen.getByText(/aún no hay recibos/)).toBeInTheDocument();
  });
});

describe("PermisosAntenas — el inventario honesto por plataforma", () => {
  // PermisosAntenas detecta la plataforma del entorno real; para que la prueba
  // sea determinista clavamos Chromium de escritorio con sus antenas (sin
  // NDEFReader, para que el NFC declare su motivo honesto).
  const montarEnChromium = async (permisoPrevio?: string) => {
    if (permisoPrevio) localStorage.setItem(permisoPrevio, "true");
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 Chrome", bluetooth: {}, serial: {}, geolocation: {} });
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  };

  afterEach(() => vi.unstubAllGlobals());

  it("declara la plataforma, las cinco antenas y su disponibilidad honesta", async () => {
    await montarEnChromium();
    expect(screen.getByText(/Plataforma detectada: web-chromium/)).toBeInTheDocument();
    for (const antena of ["WebRTC", "Web Bluetooth", "Web Serial", "Web NFC", "Geolocalización"]) {
      expect(within(screen.getByText(antena).closest("div") as HTMLElement).getByText(/^Disponible:/)).toBeInTheDocument();
    }
    // El NFC en escritorio Chromium no está: dice por qué, sin prometer.
    const nfc = screen.getByText("Web NFC").closest("div") as HTMLElement;
    expect(within(nfc).getByText("Disponible: No")).toBeInTheDocument();
    expect(within(nfc).getByText("Motivo: Disponible solo en Android")).toBeInTheDocument();
  });

  it("recuerda el permiso concedido y lo marca en su fila", async () => {
    await montarEnChromium("permiso_Web Bluetooth");
    const bt = screen.getByText("Web Bluetooth").closest("div") as HTMLElement;
    expect(within(bt).getByText(/Permitido/)).toBeInTheDocument();
    // Y en lo no concedido ofrece el botón para pedírselo a la persona.
    const geo = screen.getByText("Geolocalización").closest("div") as HTMLElement;
    expect(within(geo).getByRole("button", { name: /Permitir/ })).toBeInTheDocument();
  });
});

describe("inventarioPorMedio — la función pura que alimenta el inventario", () => {
  it("web-chromium: WebRTC siempre, el NFC nunca y lo demás según capacidades", () => {
    const inv = inventarioPorMedio({ plataforma: "web-chromium", tieneBluetooth: true, tieneSerial: false, tieneNfc: false, tieneGeo: true });
    expect(inv.find((a) => a.antena === "WebRTC")?.disponible).toBe(true);
    expect(inv.find((a) => a.antena === "Web Bluetooth")?.disponible).toBe(true);
    expect(inv.find((a) => a.antena === "Web Serial")?.disponible).toBe(false);
    expect(inv.find((a) => a.antena === "Web NFC")?.motivo).toBe("Disponible solo en Android");
    expect(inv.find((a) => a.antena === "Geolocalización")?.disponible).toBe(true);
  });

  it("tauri-escritorio: el faro UDP, Meshtastic y Reticulum por escritorio, la serie según puertos", () => {
    const inv = inventarioPorMedio({ plataforma: "tauri-escritorio", tieneBluetooth: true, tieneSerial: true, tieneNfc: false, tieneGeo: false });
    for (const antena of ["Faro UDP multicast", "Meshtastic TCP", "Detección de Reticulum"]) {
      expect(inv.find((a) => a.antena === antena)?.disponible).toBe(true);
    }
    expect(inv.find((a) => a.antena === "Radios por serie")?.disponible).toBe(true);
  });
});
