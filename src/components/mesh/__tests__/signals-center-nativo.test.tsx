/**
 * SignalsCenter — comportamiento nativo (Tauri) vs web.
 * ====================================================
 * En la app nativa de macOS (tauri-escritorio) cada antena enseña lo que la app
 * sí hace (BLE, serie/USB, Wi‑Fi, malla) o «no disponible en este aparato» con
 * el motivo real; NO se ofrece instalar la app dentro de la app.
 * En la web todo sigue igual.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { SignalSource } from "@/ai/astraura/mesh/signals";

const h = vi.hoisted(() => ({
  mesh: {} as Record<string, unknown>,
  signals: [] as SignalSource[],
  tauri: null as unknown,
  platform: {} as Record<string, unknown>,
  native: {} as Record<string, unknown>,
  detectSignals: vi.fn(),
  detectPlatform: vi.fn(),
  recommendNative: vi.fn(),
  tauriGlobal: vi.fn(),
}));

vi.mock("framer-motion", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/nativa/info-neurona", () => ({
  tauriGlobal: () => h.tauri,
}));
vi.mock("@/ai/astraura/mesh", () => ({
  useMeshState: () => h.mesh,
  detectSignals: (...args: unknown[]) => h.detectSignals(...args),
  detectPlatform: () => h.platform,
  recommendNative: () => h.native,
  subscribeConnectivity: () => () => undefined,
  startMeshSubsystem: () => undefined,
  hasAccountSession: async () => false,
  getConnectivitySettings: () => ({ defaultRadio: "serial" }),
  setNeuronPosition: () => false,
  connectMesh: async () => undefined,
  connectWifiNode: async () => undefined,
}));
vi.mock("@/components/mesh/detected-signals-panel", () => ({
  DetectedSignalsPanel: () => <div data-testid="detected-panel" />,
}));
vi.mock("@/components/mesh/mapa-senales/mapa-senales", () => ({
  MapaSenales: () => <div data-testid="mapa-senales" />,
}));
vi.mock("@/components/mesh/panel-inferencia", () => ({
  PanelInferencia: () => <div data-testid="panel-inferencia" />,
}));
vi.mock("@/components/mesh/red-mesh-center", () => ({
  RedMeshCenter: () => <div data-testid="red-mesh-center" />,
}));
vi.mock("@/components/mesh/actividad-red-recibida", () => ({
  ActividadRedRecibida: () => <div data-testid="actividad-red" />,
}));
vi.mock("@/components/network/router-center", () => ({
  RouterCenter: () => <div data-testid="router-center" />,
}));
vi.mock("@/components/connectivity/connectivity-config-panel", () => ({
  ConnectivityConfigPanel: () => <div data-testid="connectivity-config" />,
}));
vi.mock("@/lib/astraura/config-ui", () => ({
  openAstrauraConfig: vi.fn(),
}));
vi.mock("@/lib/astraura/neuron-persona-systems", () => ({
  ALL_PERSONAS: "*",
  personaChips: () => [],
  getRawOverrides: () => ({ senales: { porAntena: {} } }),
  subscribeNeuronPersona: (cb: () => void) => { cb(); return () => undefined; },
}));
vi.mock("@/lib/neurons/neurons", () => ({
  thisDeviceId: () => "dev-test",
}));
vi.mock("@/lib/aurora/voz-starseed/capacidades", () => ({
  detectarCapacidades: async () => ({ supertonic: false, movil: false, daemonLocal: false }),
}));
vi.mock("@/lib/aurora/voz-starseed/motor", () => ({
  soporteSupertonic: () => ({ disponible: false, motivo: "no disponible" }),
  nivelParaVoz: () => "nube",
}));
vi.mock("@/lib/aurora/voz-unica", () => ({
  hablar: async () => true,
}));
vi.mock("@/components/malla/panel-reticula", () => ({
  PanelReticula: () => <div data-testid="reticula" />,
}));
vi.mock("@/components/malla/panel-mapa-vias", () => ({
  PanelMapaViasVivo: () => <div data-testid="mapa-vias" />,
}));
vi.mock("@/components/malla/motor-cristal-mount", () => ({
  MotorCristalMount: () => <div data-testid="motor-cristal" />,
  useMotorCristal: () => ({ estado: "listo" }),
}));
vi.mock("@/components/malla/permisos-antenas", () => ({
  default: () => <div data-testid="permisos-antenas" />,
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  usePrompt: () => async () => undefined,
}));

import { SignalsCenter } from "../signals-center";

const MESH_READY = {
  status: "ready",
  transport: "serial",
  region: "EU_868",
  edges: [],
  remoteTopologies: [],
  self: undefined,
  nodes: [{ isSelf: true, presence: "online" as const }],
};

const SIGNALS_BASE: SignalSource[] = [
  {
    kind: "mesh",
    label: "Malla P2P (LoRa)",
    status: "active",
    detail: "1 nodo al alcance · telecom sin operadores",
    controllable: true,
    bands: "868 MHz (EU_868)",
    actions: ["Abrir Red Mesh", "Conectar radio"],
  },
  {
    kind: "gps",
    label: "GPS / Ubicación",
    status: "available",
    detail: "Disponible · pedirá permiso para ubicar",
    controllable: true,
    bands: "GNSS 1,2–1,6 GHz",
    actions: ["Ubicar esta neurona"],
  },
  {
    kind: "bluetooth",
    label: "Bluetooth / BLE",
    status: "available",
    detail: "Web Bluetooth disponible · conectar radios BLE",
    controllable: true,
    bands: "2,4 GHz",
    actions: ["Conectar por BLE"],
  },
  {
    kind: "serial",
    label: "Serie / USB",
    status: "available",
    detail: "Web Serial disponible · puertos autorizados",
    controllable: true,
    bands: "radio LoRa por USB",
    actions: ["Conectar radio USB"],
  },
  {
    kind: "nfc",
    label: "NFC",
    status: "unsupported",
    detail: "Web NFC no soportado (disponible en Chrome Android)",
    controllable: false,
    bands: "13,56 MHz",
    actions: [],
  },
  {
    kind: "wifi",
    label: "Wi-Fi",
    status: "available",
    detail: "Red externa activa · lleva la malla por IP a un nodo Meshtastic de tu red (TCP); Wi-Fi directo/local → app nativa",
    controllable: false,
    bands: "2,4 / 5 / 6 GHz",
    actions: ["Conectar nodo Wi-Fi", "App nativa"],
  },
  {
    kind: "cellular",
    label: "Datos celulares",
    status: "unsupported",
    detail: "El navegador no expone la antena celular · úsala para la malla vía app nativa",
    controllable: false,
    bands: "700 MHz – 3,5 GHz (operador)",
    actions: ["App nativa"],
  },
  {
    kind: "telephony",
    label: "Telefonía (voz)",
    status: "info",
    detail: "Sin API web de telefonía: informativo. La voz soberana viaja por la malla/servidor, no por operador",
    controllable: false,
    bands: "700 MHz – 2,6 GHz (operador)",
    actions: [],
  },
];

const PLATFORM_WEB = {
  os: "macos",
  browser: "chrome",
  mobile: false,
  webBluetooth: true,
  webSerial: true,
  webNfc: false,
  standalone: false,
};

const PLATFORM_TAURI = {
  os: "macos",
  browser: "tauri",
  mobile: false,
  webBluetooth: false,
  webSerial: false,
  webNfc: false,
  standalone: true,
};

const NATIVE_WEB_NEEDED = {
  needed: true,
  title: "StarSeed OS en Mac",
  reason: "La malla ya corre dentro del OS en tu navegador (protocolo Meshtastic embebido) por relé web. Instala StarSeed OS como app (barra de direcciones → Instalar) para radios por BLE/USB, nodos por Wi-Fi/TCP y antenas con permisos incluidos. En Chrome/Edge ya puedes conectar radios desde la web.",
  unlocks: [
    "la malla web por relé (YA activa, sin instalar nada)",
    "radios directos por BLE/USB y nodos por Wi-Fi/TCP",
    "múltiples bandas y antenas simultáneas y continuas",
    "uso en segundo plano (permisos incluidos en la app instalada)",
  ],
  links: [
    { label: "Instalar StarSeed OS (app)", url: "https://starseed-os.vercel.app/", kind: "web" as const },
    { label: "Protocolo Meshtastic (código abierto del OS)", url: "https://github.com/meshtastic", kind: "repo" as const },
  ],
};

const NATIVE_TAURI_NOT_NEEDED = {
  needed: false,
  title: "StarSeed OS en Mac",
  reason: "La malla ya corre dentro del OS en tu navegador (protocolo Meshtastic embebido) por relé web.",
  unlocks: [],
  links: [],
};

beforeEach(() => {
  h.mesh = MESH_READY;
  h.signals = SIGNALS_BASE;
  h.tauri = null;
  h.platform = PLATFORM_WEB;
  h.native = NATIVE_WEB_NEEDED;
  h.detectSignals.mockResolvedValue(SIGNALS_BASE);
  h.detectPlatform.mockReturnValue(PLATFORM_WEB);
  h.recommendNative.mockReturnValue(NATIVE_WEB_NEEDED);
  h.tauriGlobal.mockReturnValue(null);
});

afterEach(() => cleanup());

describe("SignalsCenter — plataforma web", () => {
  it("muestra los textos de navegador para antenas sin API (Bluetooth, Serial, NFC, celular)", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Web Bluetooth no soportado en este navegador|Web Bluetooth disponible/)).toBeInTheDocument();
    });
  });

  it("muestra la recomendación de instalar la app nativa", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Instalar StarSeed OS \(app\)/)).toBeInTheDocument();
    });
    await vi.waitFor(() => {
      expect(screen.getByText(/StarSeed OS en Mac/)).toBeInTheDocument();
    });
  });

  it("muestra 'App nativa' como acción en Wi-Fi y celular (dos botones)", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /App nativa/ });
      expect(buttons).toHaveLength(2);
    });
  });
});

describe("SignalsCenter — app nativa Tauri (tauri-escritorio)", () => {
  beforeEach(() => {
    h.tauri = { core: { invoke: vi.fn() }, app: { getVersion: vi.fn() } };
    h.platform = PLATFORM_TAURI;
    h.native = NATIVE_TAURI_NOT_NEEDED;
    h.detectPlatform.mockReturnValue(PLATFORM_TAURI);
    h.recommendNative.mockReturnValue(NATIVE_TAURI_NOT_NEEDED);
    h.tauriGlobal.mockReturnValue({ core: { invoke: vi.fn() }, app: { getVersion: vi.fn() } });
    // En Tauri las señales nativas son distintas: BLE/Serial sí funcionan, no hay "Web Bluetooth"
    h.signals = [
      {
        kind: "mesh",
        label: "Malla P2P (LoRa)",
        status: "active",
        detail: "1 nodo al alcance · telecom sin operadores",
        controllable: true,
        bands: "868 MHz (EU_868)",
        actions: ["Abrir Red Mesh", "Conectar radio"],
      },
      {
        kind: "gps",
        label: "GPS / Ubicación",
        status: "available",
        detail: "Disponible · pedirá permiso para ubicar",
        controllable: true,
        bands: "GNSS 1,2–1,6 GHz",
        actions: ["Ubicar esta neurona"],
      },
      {
        kind: "bluetooth",
        label: "Bluetooth / BLE",
        status: "active",
        detail: "BLE nativo activo · conecta radios Meshtastic por Bluetooth",
        controllable: true,
        bands: "2,4 GHz",
        actions: ["Conectar por BLE"],
      },
      {
        kind: "serial",
        label: "Serie / USB",
        status: "active",
        detail: "Serie nativo activo · radios LoRa por USB",
        controllable: true,
        bands: "radio LoRa por USB",
        actions: ["Conectar radio USB"],
      },
      {
        kind: "nfc",
        label: "NFC",
        status: "unsupported",
        detail: "NFC no disponible en este aparato (macOS no expone NFC)",
        controllable: false,
        bands: "13,56 MHz",
        actions: [],
      },
      {
        kind: "wifi",
        label: "Wi-Fi",
        status: "active",
        detail: "Wi-Fi nativo activo · malla por TCP a nodos de tu red + escaneo de redes",
        controllable: true,
        bands: "2,4 / 5 / 6 GHz",
        actions: ["Conectar nodo Wi-Fi", "Escanear redes"],
      },
      {
        kind: "cellular",
        label: "Datos celulares",
        status: "unsupported",
        detail: "Datos celulares no disponibles en este aparato (macOS sin módem)",
        controllable: false,
        bands: "700 MHz – 3,5 GHz (operador)",
        actions: [],
      },
      {
        kind: "telephony",
        label: "Telefonía (voz)",
        status: "info",
        detail: "Telefonía no disponible en este aparato (macOS sin módem)",
        controllable: false,
        bands: "700 MHz – 2,6 GHz (operador)",
        actions: [],
      },
    ];
    h.detectSignals.mockResolvedValue(h.signals);
  });

  it("NO muestra textos de navegador ('Web Bluetooth', 'Web Serial', 'Sin API')", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.queryByText(/Web Bluetooth no soportado en este navegador/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Web Serial no soportado/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Sin API/)).not.toBeInTheDocument();
    });
  });

  it("muestra estados nativos reales: BLE activo, Serie activo, Wi-Fi activo", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.getByText(/BLE nativo activo/)).toBeInTheDocument();
      expect(screen.getByText(/Serie nativo activo/)).toBeInTheDocument();
      expect(screen.getByText(/Wi-Fi nativo activo/)).toBeInTheDocument();
    });
  });

  it("muestra 'no disponible en este aparato' con motivo real para NFC, celular, telefonía", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.getByText(/NFC no disponible en este aparato/)).toBeInTheDocument();
      expect(screen.getByText(/Datos celulares no disponibles en este aparato/)).toBeInTheDocument();
      expect(screen.getByText(/Telefonía no disponible en este aparato/)).toBeInTheDocument();
    });
  });

  it("NO ofrece 'Instalar StarSeed OS (app)' ni 'StarSeed OS en Mac · recomendado' estando en la app", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.queryByText(/Instalar StarSeed OS \(app\)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/StarSeed OS en Mac · recomendado/)).not.toBeInTheDocument();
    });
  });

  it("NO muestra 'App nativa' como acción en Wi-Fi y celular", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: /App nativa/ })).not.toBeInTheDocument();
    });
  });

  it("muestra acciones nativas: 'Escanear redes' en Wi-Fi", async () => {
    render(<SignalsCenter />);
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /Escanear redes/ })).toBeInTheDocument();
    });
  });
});