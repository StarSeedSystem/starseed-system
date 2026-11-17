"use client";

import "@testing-library/jest-dom/vitest";
import { cleanup, render as renderCrudo, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { AjustesNeurona } from "../../ajustes-centro";
import type { CentroNeurona } from "@/lib/senales/centro";

const render = (ui: React.ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

vi.mock("@/ai/astraura/mesh/privacy", () => ({
  getMeshPrivacy: () => ({
    publicRadar: "visible" as const,
    shareName: true,
    shareAvatar: true,
    shareDevice: true,
    sharePosition: false,
    visibility: "account" as const,
    relayUse: "all" as const,
  }),
  getConnectivitySettings: () => ({ publicInternet: true }),
  setMeshPrivacy: vi.fn(),
  MESH_PRIVACY_EVENT: "mesh:privacy",
  CONNECTIVITY_EVENT: "mesh:connectivity",
  DEFAULT_MESH_PRIVACY: {
    publicRadar: "anonymous" as const,
    shareName: true,
    shareAvatar: false,
    shareDevice: false,
    sharePosition: false,
    visibility: "account" as const,
    relayUse: "all" as const,
  },
}));

vi.mock("@/lib/malla/internet/ajustes-banco", () => ({
  getAjustesBanco: () => ({
    activo: false,
    modo: "diario" as const,
    diarioMb: 100,
    ventanas: [],
  }),
  setAjustesBanco: vi.fn(),
  AJUSTES_BANCO_EVENT: "malla:banco",
  calcularRestanteHoyMb: () => 100,
}));

vi.mock("@/lib/neurons/neurons", () => ({
  setNeuronName: vi.fn(),
  thisDeviceId: () => "device-1",
}));

vi.mock("@/lib/malla/internet/conexion-limitada", () => ({
  clasificarConexion: vi.fn(() => ({ estado: "desconocida", fuente: "ninguna", motivo: "test" })),
}));

beforeEach(() => {
  vi.resetModules();
  cleanup();
  Object.defineProperty(navigator, "connection", {
    value: undefined,
    configurable: true,
  });
});

const centroMock: CentroNeurona = {
  nombreNeurona: "Test Neurona",
  sinNombre: false,
  iniciales: "TN",
  nombrePerfil: "Perfil Test",
  usuario: "@test",
  subtitulo: "Subtítulo",
  textoMedios: "Medios",
  avatar: { modo: "iniciales", url: null, motivo: "test" },
  radar: { emision: "publica", titulo: "Visible", motivo: null, lineas: [] },
  mediosAbiertos: 1,
  datos: [],
};

const propsBase = {
  centro: centroMock,
  neuronaId: "neurona-1",
  verPublicos: true,
  onVerPublicos: vi.fn(),
  onNombre: vi.fn(),
};

describe("AjustesNeurona — sección Internet compartido", () => {
  it("renderiza el bloque «Internet compartido» una vez cuando textosInternet está disponible", async () => {
    const { TextosInternet } = await import("@/lib/malla/internet/tipos");
    const { clasificarConexion } = await import("@/lib/malla/internet/conexion-limitada");
    vi.mocked(clasificarConexion).mockReturnValue({ estado: "no-limitada", fuente: "navegador", motivo: "WiFi" });
    Object.defineProperty(navigator, "connection", {
      value: { type: "wifi", saveData: false, effectiveType: "4g", addEventListener: vi.fn(), removeEventListener: vi.fn() },
      configurable: true,
    });
    render(<AjustesNeurona {...propsBase} textosInternet={TextosInternet} />);
    await waitFor(() => {
      const secciones = screen.getAllByRole("region", { name: /internet compartido/i });
      expect(secciones).toHaveLength(1);
    });
  });

  it("no renderiza el bloque «Internet compartido» cuando textosInternet está ausente", () => {
    render(<AjustesNeurona {...propsBase} />);
    const seccion = screen.queryByRole("region", { name: /internet compartido/i });
    expect(seccion).not.toBeInTheDocument();
  });

  it("mantiene los ajustes existentes (nombre, privacidad, modo banco, ver públicos)", () => {
    render(<AjustesNeurona {...propsBase} />);
    expect(screen.getByLabelText(/nombre de la neurona/i)).toBeInTheDocument();
    expect(screen.getByText(/privacidad del radar público/i)).toBeInTheDocument();
    expect(screen.getByText(/compartir internet/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ver los datos públicos de otras cuentas/i)).toBeInTheDocument();
  });

  it("usa clasificación «desconocida» en el primer render sin navigator.connection", async () => {
    const { TextosInternet } = await import("@/lib/malla/internet/tipos");
    const { clasificarConexion } = await import("@/lib/malla/internet/conexion-limitada");
    vi.mocked(clasificarConexion).mockReturnValue({ estado: "desconocida", fuente: "ninguna", motivo: "sin conexión" });
    Object.defineProperty(navigator, "connection", {
      value: undefined,
      configurable: true,
    });
    render(<AjustesNeurona {...propsBase} textosInternet={TextosInternet} />);
    await waitFor(() => {
      const seccion = screen.getByRole("region", { name: /internet compartido/i });
      expect(seccion).toBeInTheDocument();
    });
  });
});