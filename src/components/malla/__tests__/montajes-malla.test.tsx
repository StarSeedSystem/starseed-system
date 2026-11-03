/**
 * Montajes de los recibos de entrega de la malla en su pantalla real
 * (Ola 1012Q, contrato §6–§7): con dos recibos falsos se pintan DOS filas,
 * cada una con su dato y su estado; sin recibos se declara el vacío honesto.
 * Jsdom, sin tocar el store vivo: los recibos entran por el hook de la malla.
 * Prueba también PermisosAntenas: inventario honesto por plataforma y estado de permisos.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
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
import { DeliveryReceiptsPanel } from "@/components/mesh/delivery-receipts-panel";
import PermisosAntenas from "@/components/malla/permisos-antenas";
import { inventarioPorMedio } from "@/lib/malla/cristal/permisos-antenas";

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
  it("pinta dos filas con dos recibos falsos: dato, hora, estado, medio y ruta", async () => {
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
    expect(screen.getByText(/Servidor/)).toBeInTheDocument();
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
  const originalUserAgent = navigator.userAgent;
  const originalNavigator = { ...navigator };
  const originalWindow = { ...window };

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    vi.stubGlobal('window', {
      ...originalWindow,
      NDEFReader: undefined,
      __TAURI__: undefined,
    });
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detecta web-chromium y muestra inventario con 5 antenas", async () => {
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    
    await screen.findByText("Detectando plataforma y capacidades...");
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });
    
    expect(screen.getByText("Plataforma detectada: web-chromium")).toBeInTheDocument();
    
    const antenas = await screen.findAllByText(/WebRTC|Web Bluetooth|Web Serial|Web NFC|Geolocalización/);
    expect(antenas.length).toBeGreaterThanOrEqual(5);
  });

  it("marca Web Bluetooth como disponible cuando navigator.bluetooth existe", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Disponible: Sí")).toBeInTheDocument();
  });

  it("marca Web NFC como no disponible en web-chromium con motivo", async () => {
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Web NFC")).toBeInTheDocument();
    expect(screen.getByText("Disponible: No")).toBeInTheDocument();
    expect(screen.getByText("Disponible solo en Android")).toBeInTheDocument();
  });

  it("detecta web-safari y deshabilita Bluetooth, Serial y NFC", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      bluetooth: undefined,
      serial: undefined,
      geolocation: {},
    });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Plataforma detectada: web-safari")).toBeInTheDocument();
    expect(screen.getByText("No soportado en Safari")).toBeInTheDocument();
  });

  it("detecta web-firefox y deshabilita Bluetooth, Serial y NFC", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      bluetooth: undefined,
      serial: undefined,
      geolocation: {},
    });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Plataforma detectada: web-firefox")).toBeInTheDocument();
    expect(screen.getByText("No soportado en Firefox")).toBeInTheDocument();
  });

  it("detecta android-chromium y habilita NFC si existe NDEFReader", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      bluetooth: {},
      serial: undefined,
      geolocation: {},
    });
    vi.stubGlobal('window', { ...originalWindow, NDEFReader: class {} });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Plataforma detectada: android-chromium")).toBeInTheDocument();
  });

  it("detecta tauri-escritorio y muestra antenas nativas (Faro UDP, Meshtastic TCP, etc.)", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    vi.stubGlobal('window', { ...originalWindow, __TAURI__: true });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Plataforma detectada: tauri-escritorio")).toBeInTheDocument();
    expect(screen.getByText("Faro UDP multicast")).toBeInTheDocument();
    expect(screen.getByText("Meshtastic TCP")).toBeInTheDocument();
    expect(screen.getByText("Detección de Reticulum")).toBeInTheDocument();
  });

  it("detecta tauri-android y muestra antenas nativas Android", async () => {
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      bluetooth: {},
      serial: {},
      geolocation: {},
    });
    vi.stubGlobal('window', { ...originalWindow, __TAURI__: true });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Plataforma detectada: tauri-android")).toBeInTheDocument();
    expect(screen.getByText("Servicio en primer plano")).toBeInTheDocument();
    expect(screen.getByText("Bluetooth nativos")).toBeInTheDocument();
    expect(screen.getByText("USB nativos")).toBeInTheDocument();
  });

  it("muestra estado de permiso concedido desde localStorage", async () => {
    localStorage.setItem("permiso_Web Bluetooth", "true");
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    expect(screen.getByText("Permitido")).toBeInTheDocument();
  });

  it("botón Permitir solicita permiso y guarda en localStorage", async () => {
    const mockRequestDevice = vi.fn().mockResolvedValue({});
    vi.stubGlobal('navigator', {
      ...originalNavigator,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      bluetooth: { requestDevice: mockRequestDevice },
      serial: {},
      geolocation: {},
    });
    
    render(<EnMarco clase="l"><PermisosAntenas /></EnMarco>);
    await act(async () => { await new Promise(r => setTimeout(r, 100)); });
    
    const botonPermitir = screen.getByRole("button", { name: /Permitir/ });
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