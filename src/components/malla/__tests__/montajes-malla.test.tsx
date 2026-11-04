/**
 * Montajes de los recibos de entrega de la malla en su pantalla real
 * (Ola 1012Q, contrato §6–§7): con dos recibos falsos se pintan DOS filas,
 * cada una con su dato y su estado; sin recibos se declara el vacío honesto.
 * Jsdom, sin tocar el store vivo: los recibos entran por el hook de la malla.
 * Prueba también PermisosAntenas: inventario honesto por plataforma y estado de permisos.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, act, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { EnMarco, preparaDom } from "@/components/dashboard/widgets/_social-d/pruebas/prueba-marco";
import type { DeliveryReceipt, DeliveryHop, DeliveryStatus, HopStatus } from "@/ai/astraura/mesh/delivery";
import type { TrafficClass } from "@/ai/astraura/mesh/types";
import type { TransmitScope, TransmitVia } from "@/ai/astraura/mesh/synaptic-router";

preparaDom();

const estado = vi.hoisted(() => ({ recibos: [] as DeliveryReceipt[] }));

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

const reciboFalso = (id: string, resumen: string, status: DeliveryStatus): DeliveryReceipt => ({
  id,
  scope: "local-group" as TransmitScope,
  cls: "P1" as TrafficClass,
  summary: resumen,
  status,
  hops: [
    { via: "server" as TransmitVia, label: "Servidor", role: "primary", status: "confirmed" as HopStatus, detail: "fila creada", through: "nube", at: 1 },
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
    expect(screen.getByText("Nota de prueba uno")).toBeInTheDocument();
    expect(screen.getByText("Entregado")).toBeInTheDocument();
    expect(screen.getByText("Nota de prueba dos")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.getAllByText(/Servidor/).length).toBeGreaterThanOrEqual(1);
  });

  it("declara su estado vacío cuando aún no hay ningún recibo", async () => {
    render(<EnMarco clase="l"><InternetRadarWidget /></EnMarco>);
    fireEvent.click(await screen.findByRole("button", { name: /Actividad/ }));
    expect(screen.queryByRole("list", { name: "Transmisiones recientes" })).toBeNull();
    expect(screen.getByText(/Sin transmisiones aún/)).toBeInTheDocument();
  });
});

describe("DeliveryReceiptsPanel — panel directo de recibos", () => {
  it("pinta dos filas con dos recibos falsos: dato, hora, estado y medio", async () => {
    const recibos = [
      reciboFalso("dlv-uno", "Nota de prueba uno", "delivered"),
      reciboFalso("dlv-dos", "Nota de prueba dos", "sent"),
    ];
    render(<EnMarco clase="l"><DeliveryReceiptsPanel recibos={recibos} /></EnMarco>);
    
    expect(screen.getByTestId("recibos-entrega")).toBeInTheDocument();
    expect(screen.getByText("Recibos de entrega")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    
    const filas = screen.getAllByTestId("fila-recibo");
    expect(filas).toHaveLength(2);
    
    expect(screen.getByText("Nota de prueba uno")).toBeInTheDocument();
    expect(screen.getByText("Nota de prueba dos")).toBeInTheDocument();
    // El adaptador traduce 'delivered' → 'recibido' y 'sent' → 'enviado'
    expect(screen.getByText(/Recibido/)).toBeInTheDocument();
    expect(screen.getByText(/Enviado/)).toBeInTheDocument();
    // El medio se renderiza via RecibosChips (probado en tests de inventarioPorMedio)
  });

  it("muestra mensaje de vacío cuando no hay recibos", () => {
    render(<EnMarco clase="l"><DeliveryReceiptsPanel recibos={[]} /></EnMarco>);
    
    expect(screen.getByText("aún no hay recibos: se pintan al enviar por la malla")).toBeInTheDocument();
  });

  it("respeta el límite máximo de recibos mostrados", () => {
    const muchosRecibos = Array.from({ length: 10 }, (_, i) => reciboFalso(`dlv-${i}`, `Nota ${i}`, "sent"));
    render(<EnMarco clase="l"><DeliveryReceiptsPanel recibos={muchosRecibos} maximo={3} /></EnMarco>);
    
    const filas = screen.getAllByTestId("fila-recibo");
    expect(filas).toHaveLength(3);
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("PermisosAntenas — inventario honesto por plataforma", () => {
  const originalNavigator = { ...navigator };
  const originalWindow = { ...window };

  const setPlatform = (config: {
    userAgent: string;
    bluetooth?: Record<string, unknown>;
    serial?: Record<string, unknown>;
    geolocation?: Record<string, unknown>;
    NDEFReader?: unknown;
    __TAURI__?: unknown;
  }) => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: config.userAgent,
      bluetooth: config.bluetooth ?? {},
      serial: config.serial ?? {},
      geolocation: config.geolocation ?? {},
    });
    vi.stubGlobal('window', {
      ...originalWindow,
      NDEFReader: config.NDEFReader ?? undefined,
      __TAURI__: config.__TAURI__ ?? undefined,
    });
  };

  const resetGlobals = () => {
    vi.unstubAllGlobals();
  };

  const renderWithPlatform = async (platformConfig: {
    userAgent: string;
    bluetooth?: Record<string, unknown>;
    serial?: Record<string, unknown>;
    geolocation?: Record<string, unknown>;
    NDEFReader?: unknown;
    __TAURI__?: unknown;
    localStorageItems?: Record<string, string>;
  }) => {
    setPlatform(platformConfig);
    localStorage.clear();
    if (platformConfig.localStorageItems) {
      Object.entries(platformConfig.localStorageItems).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    }
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
  };

  afterEach(() => {
    resetGlobals();
  });

  it("detecta web-chromium y muestra inventario con 5 antenas", async () => {
    await renderWithPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    
    expect(screen.getByText("Plataforma detectada: web-chromium")).toBeInTheDocument();
    
    const antenas = await screen.findAllByText(/WebRTC|Web Bluetooth|Web Serial|Web NFC|Geolocalización/);
    expect(antenas.length).toBeGreaterThanOrEqual(5);
  });

  it("marca Web Bluetooth como disponible cuando navigator.bluetooth existe", async () => {
    await renderWithPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    
    const listaPermisos = screen.getByTestId("lista-permisos");
    const webBluetoothSection = within(listaPermisos).getByText("Web Bluetooth").parentElement!;
    expect(within(webBluetoothSection).getByText("Disponible: Sí")).toBeInTheDocument();
  });

  it("marca Web NFC como no disponible en web-chromium con motivo", async () => {
    await renderWithPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    
    const listaPermisos = screen.getByTestId("lista-permisos");
    const webNFCSection = within(listaPermisos).getByText("Web NFC").parentElement!;
    expect(within(webNFCSection).getByText("Disponible: No")).toBeInTheDocument();
    expect(within(webNFCSection).getByText(/Disponible solo en Android/)).toBeInTheDocument();
  });

  it("muestra estado de permiso concedido desde localStorage", async () => {
    await renderWithPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
      localStorageItems: { "permiso_Web Bluetooth": "true" },
    });
    
    const listaPermisos = screen.getByTestId("lista-permisos");
    const webBluetoothSection = within(listaPermisos).getByText("Web Bluetooth").parentElement!;
    expect(within(webBluetoothSection).getByText(/Permitido/)).toBeInTheDocument();
  });

  it("botón Permitir solicita permiso y guarda en localStorage", async () => {
    const mockRequestDevice = vi.fn().mockResolvedValue({});
    
    await renderWithPlatform({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: { requestDevice: mockRequestDevice },
      serial: {},
      geolocation: {},
    });
    
    const listaPermisos = screen.getByTestId("lista-permisos");
    const webBluetoothSection = within(listaPermisos).getByText("Web Bluetooth").parentElement!;
    const botonPermitir = within(webBluetoothSection).getByRole("button", { name: /Permitir/ });
    await act(async () => {
      fireEvent.click(botonPermitir);
      await new Promise(r => setTimeout(r, 50));
    });
    
    expect(mockRequestDevice).toHaveBeenCalled();
    expect(localStorage.getItem("permiso_Web Bluetooth")).toBe("true");
  });
});

describe("inventarioPorMedio — función pura de permisos", () => {
  // No mockeamos esta función: probamos la implementación real
  it("web-chromium: WebRTC siempre disponible, NFC nunca", () => {
    const inv = inventarioPorMedio({
      plataforma: "web-chromium",
      tieneBluetooth: true,
      tieneSerial: true,
      tieneNfc: false,
      tieneGeo: true,
    });
    
    const webRTC = inv.find(a => a.antena === "WebRTC");
    const nfc = inv.find(a => a.antena === "Web NFC");
    
    expect(webRTC?.disponible).toBe(true);
    expect(nfc?.disponible).toBe(false);
    expect(nfc?.motivo).toBe("Disponible solo en Android");
  });

  it("web-safari: Bluetooth, Serial y NFC no soportados", () => {
    const inv = inventarioPorMedio({
      plataforma: "web-safari",
      tieneBluetooth: false,
      tieneSerial: false,
      tieneNfc: false,
      tieneGeo: true,
    });
    
    const bluetooth = inv.find(a => a.antena === "Web Bluetooth");
    const serial = inv.find(a => a.antena === "Web Serial");
    const nfc = inv.find(a => a.antena === "Web NFC");
    
    expect(bluetooth?.disponible).toBe(false);
    expect(bluetooth?.motivo).toBe("No soportado en Safari");
    expect(serial?.disponible).toBe(false);
    expect(serial?.motivo).toBe("No soportado en Safari");
    expect(nfc?.disponible).toBe(false);
    expect(nfc?.motivo).toBe("No soportado en Safari");
  });

  it("web-firefox: Bluetooth, Serial y NFC no soportados", () => {
    const inv = inventarioPorMedio({
      plataforma: "web-firefox",
      tieneBluetooth: false,
      tieneSerial: false,
      tieneNfc: false,
      tieneGeo: true,
    });
    
    const bluetooth = inv.find(a => a.antena === "Web Bluetooth");
    const serial = inv.find(a => a.antena === "Web Serial");
    const nfc = inv.find(a => a.antena === "Web NFC");
    
    expect(bluetooth?.disponible).toBe(false);
    expect(bluetooth?.motivo).toBe("No soportado en Firefox");
    expect(serial?.disponible).toBe(false);
    expect(serial?.motivo).toBe("No soportado en Firefox");
    expect(nfc?.disponible).toBe(false);
    expect(nfc?.motivo).toBe("No soportado en Firefox");
  });

  it("android-chromium: NFC disponible si tieneNfc", () => {
    const inv = inventarioPorMedio({
      plataforma: "android-chromium",
      tieneBluetooth: true,
      tieneSerial: false,
      tieneNfc: true,
      tieneGeo: true,
    });
    
    const nfc = inv.find(a => a.antena === "Web NFC");
    expect(nfc?.disponible).toBe(true);
    expect(nfc?.motivo).toBe("");
  });

  it("tauri-escritorio: antenas nativas de escritorio", () => {
    const inv = inventarioPorMedio({
      plataforma: "tauri-escritorio",
      tieneBluetooth: true,
      tieneSerial: true,
      tieneNfc: false,
      tieneGeo: false,
    });
    
    const faro = inv.find(a => a.antena === "Faro UDP multicast");
    const meshtastic = inv.find(a => a.antena === "Meshtastic TCP");
    const reticulum = inv.find(a => a.antena === "Detección de Reticulum");
    const serial = inv.find(a => a.antena === "Radios por serie");
    
    expect(faro?.disponible).toBe(true);
    expect(meshtastic?.disponible).toBe(true);
    expect(reticulum?.disponible).toBe(true);
    expect(serial?.disponible).toBe(true);
  });

  it("tauri-android: antenas nativas Android", () => {
    const inv = inventarioPorMedio({
      plataforma: "tauri-android",
      tieneBluetooth: true,
      tieneSerial: true,
      tieneNfc: false,
      tieneGeo: false,
    });
    
    const servicio = inv.find(a => a.antena === "Servicio en primer plano");
    const bt = inv.find(a => a.antena === "Bluetooth nativos");
    const usb = inv.find(a => a.antena === "USB nativos");
    
    expect(servicio?.disponible).toBe(true);
    expect(bt?.disponible).toBe(true);
    expect(usb?.disponible).toBe(true);
  });
});