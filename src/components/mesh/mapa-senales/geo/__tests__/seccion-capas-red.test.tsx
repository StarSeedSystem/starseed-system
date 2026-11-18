import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as renderCrudo, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { SeccionCapas } from "../seccion-capas";
import type { EstadoCapas, LecturaPublicadas } from "@/lib/senales/geo/capas";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";

const T = 1_700_000_000_000;

function senal(capa: SenalEspectro["capa"], origen: SenalEspectro["origen"], id: string): SenalEspectro {
  return {
    id, medio: "wifi", banda: "2.4 GHz", frecuenciaKhz: 2437000, anchoKhz: 20000, fuerzaDbm: -45,
    calidad: 0.8, origen, capa, fuente: "publicada por su dueño", medidoEn: T, zona: "A1",
    compatibles: [],
  };
}

const ESTADO: EstadoCapas = { activas: [], opacidad: {} };

const BASE = {
  onAlternar: vi.fn(),
  onOpacidad: vi.fn(),
  permiso: "desconocido" as const,
  compartir: false,
  canal: { union: "sin-intentar" as const, motivo: "todavía no se intentó unir el canal privado de posición" },
  onCompartir: vi.fn(),
  onUbicarme: vi.fn(),
};

const render = (publicadas?: LecturaPublicadas) =>
  renderCrudo(
    <AppearanceProvider>
      <SeccionCapas estado={ESTADO} {...BASE} publicadas={publicadas} />
    </AppearanceProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SeccionCapas: rótulos de las capas grupo «red» (AUD1117 F2)", () => {
  it("con filas de prueba en tres capas, cada capa del panel dice su resumen y la cuarta, «sin publicar»", () => {
    render({
      senales: [
        senal("publica", "medida", "s1"),
        senal("publica", "declarada", "s2"),
        senal("comunidad", "estimada", "s3"),
        senal("privada", "medida", "s4"),
      ],
      estado: "ok",
      cargando: false,
    });
    expect(screen.getByTestId("rotulo-panel-red-publica")).toHaveTextContent("2 señales");
    expect(screen.getByTestId("rotulo-panel-red-publica")).toHaveTextContent("1 medidas · 1 declaradas");
    expect(screen.getByTestId("rotulo-panel-red-comunidad")).toHaveTextContent("1 señal · 1 estimadas");
    expect(screen.getByTestId("rotulo-panel-red-privada")).toHaveTextContent("1 señal");
    expect(screen.getByTestId("rotulo-panel-red-externa")).toHaveTextContent("sin publicar");
  });

  it("sin filas, cada capa del panel dice «sin publicar», nunca un cero fingido", () => {
    render({ senales: [], estado: "ok", cargando: false });
    for (const id of ["red-publica", "red-comunidad", "red-privada", "red-externa"]) {
      expect(screen.getByTestId(`rotulo-panel-${id}`)).toHaveTextContent("sin publicar");
    }
  });

  it("si la tabla no existe, el panel dice el motivo", () => {
    render({ senales: [], estado: "sin-tabla", motivo: "la tabla os_senales_publicas no existe en este proyecto", cargando: false });
    expect(screen.getByTestId("rotulo-panel-red-publica")).toHaveTextContent("la tabla os_senales_publicas no existe en este proyecto");
  });

  it("si la lectura falla, el panel dice el motivo", () => {
    render({ senales: [], estado: "error", motivo: "permission denied", cargando: false });
    expect(screen.getByTestId("rotulo-panel-red-privada")).toHaveTextContent("permission denied");
  });

  it("sin lectura alguna, el panel lo dice en vez de fingir un estado", () => {
    render(undefined);
    expect(screen.getByTestId("rotulo-panel-red-publica")).toHaveTextContent("sin lectura de las señales publicadas");
  });
});
