import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as renderCrudo, screen, fireEvent } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { SeccionCapas } from "../seccion-capas";
import type { EstadoCapas } from "@/lib/senales/geo/capas";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";
import type { FiltroSenales } from "../panel-filtros-senales";

const ESTADO: EstadoCapas = { activas: ["red-publica", "red-privada"], opacidad: {} };

const BASE = {
  onAlternar: vi.fn(),
  onOpacidad: vi.fn(),
  permiso: "desconocido" as const,
  compartir: false,
  canal: { union: "sin-intentar" as const, motivo: "todavía no se intentó unir el canal privado de posición" },
  onCompartir: vi.fn(),
  onUbicarme: vi.fn(),
};

const SENALES_FIJAS: readonly SenalEspectro[] = [
  {
    id: "s1",
    medio: "wifi",
    banda: "Wi-Fi 2,4 GHz",
    frecuenciaKhz: 2437000,
    anchoKhz: 20000,
    fuerzaDbm: -45,
    calidad: 0.8,
    origen: "medida",
    capa: "publica",
    fuente: "escaneo",
    medidoEn: 1_000_000,
    zona: "casa",
    vinculo: { tipo: "neurona", id: "n1" },
    compatibles: [],
  },
  {
    id: "s2",
    medio: "bluetooth",
    banda: "BLE",
    frecuenciaKhz: 2441000,
    anchoKhz: 1000,
    fuerzaDbm: -60,
    calidad: 0.6,
    origen: "medida",
    capa: "privada",
    fuente: "sistema",
    medidoEn: 1_000_000,
    zona: "oficina",
    vinculo: { tipo: "neurona", id: "n2" },
    compatibles: [],
  },
  {
    id: "s3",
    medio: "lora",
    banda: "LoRa 868 MHz",
    frecuenciaKhz: 868500,
    anchoKhz: 125000,
    fuerzaDbm: -90,
    calidad: 0.3,
    origen: "declarada",
    capa: "comunidad",
    fuente: "usuario",
    medidoEn: 1_000_000,
    zona: "campo",
    vinculo: { tipo: "neurona", id: "n3" },
    compatibles: [],
  },
  {
    id: "s4",
    medio: "wifi",
    banda: "Wi-Fi 5 GHz",
    frecuenciaKhz: 5500000,
    anchoKhz: 40000,
    fuerzaDbm: -50,
    calidad: 0.9,
    origen: "estimada",
    capa: "publica",
    fuente: "modelo",
    medidoEn: 1_000_000,
    zona: "casa",
    vinculo: { tipo: "neurona", id: "n1" },
    compatibles: [],
  },
  {
    id: "s5",
    medio: "wifi",
    banda: "Wi-Fi 2,4 GHz",
    frecuenciaKhz: null,
    anchoKhz: null,
    fuerzaDbm: -70,
    calidad: null,
    origen: "medida",
    capa: "publica",
    fuente: "escaneo",
    medidoEn: 1_000_000,
    zona: "casa",
    vinculo: { tipo: "neurona", id: "n1" },
    compatibles: [],
  },
];

const FILTRO_VACIO: FiltroSenales = {
  frecuencia: { minKhz: null, maxKhz: null },
  ancho: { minKhz: null, maxKhz: null },
  capas: [],
  medios: [],
  origenes: [],
  soloCompatibles: false,
  texto: "",
};

const render = (props: { todasLasSenales?: readonly SenalEspectro[]; filtroSenales?: FiltroSenales; onCambiarFiltroSenales?: (f: FiltroSenales) => void } = {}) =>
  renderCrudo(
    <AppearanceProvider>
      <SeccionCapas estado={ESTADO} {...BASE} publicadas={{ estado: "ok" }} {...props} />
    </AppearanceProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SeccionCapas: panel de filtros AQ03", () => {
  it("renderiza el panel de filtros con contador de señales", () => {
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: vi.fn() });
    expect(screen.getByTestId("panel-filtros-senales")).toBeInTheDocument();
    const panel = screen.getByTestId("panel-filtros-senales");
    const contador = panel.querySelector('div[class*="flex"][class*="items-center"][class*="gap-1.5"]');
    expect(contador).toHaveTextContent(/4de5señales/i);
    expect(screen.getByText(/1 sin dato de frecuencia/i)).toBeInTheDocument();
  });

  it("filtro por banda (Wi-Fi 2,4 GHz) reduce el recuento", () => {
    const onCambiar = vi.fn();
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: onCambiar });

    const botonBanda = screen.getByRole("button", { name: /wi-fi 2,4 ghz/i });
    fireEvent.click(botonBanda);

    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        frecuencia: { minKhz: 2401000, maxKhz: 2483000 },
      })
    );
  });

  it("filtro por capa (pública) reduce el recuento", () => {
    const onCambiar = vi.fn();
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: onCambiar });

    const checkboxPublica = screen.getByRole("checkbox", { name: /pública/i });
    fireEvent.click(checkboxPublica);

    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        capas: expect.arrayContaining(["publica"]),
      })
    );
  });

  it("filtro por medio (wifi) reduce el recuento", () => {
    const onCambiar = vi.fn();
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: onCambiar });

    const checkboxWifi = screen.getByRole("checkbox", { name: /wi-fi/i });
    fireEvent.click(checkboxWifi);

    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        medios: expect.arrayContaining(["wifi"]),
      })
    );
  });

  it("filtro por origen (medida) reduce el recuento", () => {
    const onCambiar = vi.fn();
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: onCambiar });

    const checkboxMedida = screen.getByRole("checkbox", { name: /medida/i });
    fireEvent.click(checkboxMedida);

    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        origenes: expect.arrayContaining(["medida"]),
      })
    );
  });

  it("botón Limpiar devuelve el filtro vacío", () => {
    const onCambiar = vi.fn();
    const filtroConDatos: FiltroSenales = {
      frecuencia: { minKhz: 2400000, maxKhz: 2500000 },
      ancho: { minKhz: null, maxKhz: null },
      capas: ["publica"],
      medios: ["wifi"],
      origenes: ["medida"],
      soloCompatibles: false,
      texto: "test",
    };
    render({ todasLasSenales: SENALES_FIJAS, filtroSenales: filtroConDatos, onCambiarFiltroSenales: onCambiar });

    fireEvent.click(screen.getByTestId("btn-limpiar"));
    expect(onCambiar).toHaveBeenLastCalledWith(FILTRO_VACIO);
  });

  it("sin señales, el contador muestra 0 de 0", () => {
    render({ todasLasSenales: [], filtroSenales: FILTRO_VACIO, onCambiarFiltroSenales: vi.fn() });
    const panel = screen.getByTestId("panel-filtros-senales");
    const contador = panel.querySelector('div[class*="flex"][class*="items-center"][class*="gap-1.5"]');
    expect(contador).toHaveTextContent(/0de0señales/i);
    expect(screen.queryByText(/sin dato de frecuencia/i)).not.toBeInTheDocument();
  });
});