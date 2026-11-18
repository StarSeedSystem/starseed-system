import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderCrudo, screen, waitFor } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { PanelFiltrosSenales } from "../panel-filtros-senales";
import type { FiltroSenales } from "../panel-filtros-senales-tipos";
import { filtrarSenales, contarFiltradas, FILTRO_INICIAL } from "@/lib/senales/geo/filtros";
import type { SenalEspectro } from "@/lib/senales/espectro/tipos";

const render = (ui: React.ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const senalesFijas: readonly SenalEspectro[] = [
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
    fuente: "escaneo del sistema",
    medidoEn: 1_700_000_000_000,
    zona: "abcde",
    vinculo: { tipo: "neurona", id: "n1" },
    compatibles: [{ con: "neurona", que: "conexión", posible: true, motivo: "mismo canal" }],
  },
  {
    id: "s2",
    medio: "bluetooth",
    banda: "Bluetooth / BLE 2,4 GHz",
    frecuenciaKhz: 2441000,
    anchoKhz: 1000,
    fuerzaDbm: -60,
    calidad: 0.6,
    origen: "medida",
    capa: "privada",
    fuente: "enlace BLE",
    medidoEn: 1_700_000_000_001,
    zona: "bcdef",
    vinculo: { tipo: "neurona", id: "n2" },
    compatibles: [{ con: "neurona", que: "conexión", posible: true, motivo: "mismo canal" }],
  },
  {
    id: "s3",
    medio: "lora",
    banda: "LoRa 868 MHz",
    frecuenciaKhz: 868500,
    anchoKhz: 125000,
    fuerzaDbm: -110,
    calidad: 0.4,
    origen: "declarada",
    capa: "publica",
    fuente: "declaración del dueño",
    medidoEn: 1_700_000_000_002,
    zona: "cdefg",
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
    capa: "comunidad",
    fuente: "estimación por modelo",
    medidoEn: 1_700_000_000_003,
    zona: "defgh",
    vinculo: { tipo: "neurona", id: "n4" },
    compatibles: [],
  },
];

describe("PanelFiltrosSenales integración con filtros puros", () => {
  function expectContador(visibles: number, total: number) {
    const header = screen.getByRole("heading", { name: /Filtros de señales/i });
    const container = header.parentElement?.parentElement;
    expect(container).toHaveTextContent(new RegExp(`${visibles}de${total}señales`, "i"));
  }

  it("muestra 'N de M señales' con el total correcto", () => {
    const onCambiar = vi.fn();
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, FILTRO_INICIAL);
    render(<PanelFiltrosSenales filtro={FILTRO_INICIAL} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);
  });

  it("filtrar por banda (frecuencia 2.4 GHz) cambia el recuento", () => {
    const onCambiar = vi.fn();
    const filtro24: FiltroSenales = { ...FILTRO_INICIAL, frecuencia: { minKhz: 2400000, maxKhz: 2500000 } };
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, filtro24);
    render(<PanelFiltrosSenales filtro={filtro24} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);
    const filtradas = filtrarSenales(senalesFijas, filtro24);
    expect(filtradas.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filtrar por capa (pública) cambia el recuento", () => {
    const onCambiar = vi.fn();
    const filtroPublica: FiltroSenales = { ...FILTRO_INICIAL, capas: ["publica"] };
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, filtroPublica);
    render(<PanelFiltrosSenales filtro={filtroPublica} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);
    const filtradas = filtrarSenales(senalesFijas, filtroPublica);
    expect(filtradas.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filtrar por medio (Wi-Fi) cambia el recuento", () => {
    const onCambiar = vi.fn();
    const filtroWifi: FiltroSenales = { ...FILTRO_INICIAL, medios: ["wifi"] };
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, filtroWifi);
    render(<PanelFiltrosSenales filtro={filtroWifi} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);
    const filtradas = filtrarSenales(senalesFijas, filtroWifi);
    expect(filtradas.map((s) => s.id)).toEqual(["s1", "s4"]);
  });

  it("filtrar por origen (medida) cambia el recuento", () => {
    const onCambiar = vi.fn();
    const filtroMedida: FiltroSenales = { ...FILTRO_INICIAL, origenes: ["medida"] };
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, filtroMedida);
    render(<PanelFiltrosSenales filtro={filtroMedida} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);
    const filtradas = filtrarSenales(senalesFijas, filtroMedida);
    expect(filtradas.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("quitar todos los filtros (Limpiar) muestra todo", async () => {
    const onCambiar = vi.fn();
    const filtroConFiltros: FiltroSenales = { ...FILTRO_INICIAL, capas: ["publica"], medios: ["wifi"] };
    const { visibles, ocultasSinDato } = contarFiltradas(senalesFijas, filtroConFiltros);
    render(<PanelFiltrosSenales filtro={filtroConFiltros} onCambiar={onCambiar} visibles={visibles} ocultasSinDato={ocultasSinDato} />);
    expectContador(visibles, visibles + ocultasSinDato);

    fireEvent.click(screen.getByTestId("btn-limpiar"));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(FILTRO_INICIAL));
  });

  it("checkboxes de capa/medio/origen actualizan el filtro", async () => {
    const onCambiar = vi.fn();
    render(<PanelFiltrosSenales filtro={FILTRO_INICIAL} onCambiar={onCambiar} visibles={4} ocultasSinDato={0} />);

    fireEvent.click(screen.getByLabelText("Pública"));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ capas: ["publica"] })));

    fireEvent.click(screen.getByLabelText("Wi-Fi"));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ medios: ["wifi"] })));

    fireEvent.click(screen.getByLabelText("Medida"));
    await waitFor(() => expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ origenes: ["medida"] })));
  });
});