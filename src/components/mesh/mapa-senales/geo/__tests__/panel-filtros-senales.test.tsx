import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderCrudo, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { PanelFiltrosSenales, ETIQUETA_MEDIO, ETIQUETA_ORIGEN, ETIQUETA_CAPA, CAPAS_RED, MEDIOS, ORIGENES, type FiltroSenales } from "../panel-filtros-senales";
import { LISTA_BANDAS } from "@/lib/senales/espectro/bandas";
import type { BandaConocida } from "@/lib/senales/espectro/bandas";

const FILTRO_VACIO: FiltroSenales = {
  frecuencia: { minKhz: null, maxKhz: null },
  ancho: { minKhz: null, maxKhz: null },
  capas: [],
  medios: [],
  origenes: [],
  soloCompatibles: false,
  texto: "",
};

const render = (ui: React.ReactElement) => renderCrudo(<AppearanceProvider>{ui}</AppearanceProvider>);

function renderPanel(props: Partial<React.ComponentProps<typeof PanelFiltrosSenales>> = {}) {
  return render(
    <PanelFiltrosSenales
      filtro={FILTRO_VACIO}
      onCambiar={vi.fn()}
      visibles={10}
      ocultasSinDato={3}
      {...props}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PanelFiltrosSenales", () => {
  it("renderiza el panel con título y contador de señales", () => {
    renderPanel({ visibles: 12, ocultasSinDato: 3 });
    const header = screen.getByRole("heading", { name: /Filtros de señales/i });
    expect(header.parentElement?.parentElement).toHaveTextContent(/12de15señales/i);
    expect(screen.getByText(/3 sin dato de frecuencia \(no se pueden filtrar\)/i)).toBeInTheDocument();
  });

  it("muestra atajos de banda desde bandas.ts", () => {
    renderPanel();
    LISTA_BANDAS.forEach((banda) => {
      // El botón tiene aria-label con la etiqueta y el rango
      const escaped = banda.etiqueta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(screen.getByRole("button", { name: new RegExp(escaped, "i") })).toBeInTheDocument();
    });
  });

  it("cambiar rango de frecuencia por banda llama a onCambiar con kHz correctos", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    const bandaWifi24 = LISTA_BANDAS.find((b) => b.id === "wifi-2.4")!;
    fireEvent.click(screen.getByRole("button", { name: new RegExp(bandaWifi24.etiqueta, "i") }));
    expect(onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        frecuencia: { minKhz: bandaWifi24.inicioKhz, maxKhz: bandaWifi24.finKhz },
      })
    );
  });

  it("entrada manual de frecuencia con unidad kHz/MHz/GHz llama a onCambiar en kHz", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    const inputMin = screen.getByLabelText(/frecuencia mínima/i);
    const inputMax = screen.getByLabelText(/frecuencia máxima/i);
    const selectUnidad = screen.getByLabelText(/unidad de frecuencia/i);
    fireEvent.change(inputMin, { target: { value: "2400" } });
    fireEvent.change(inputMax, { target: { value: "2500" } });
    fireEvent.change(selectUnidad, { target: { value: "MHz" } });
    // onCambiar se llama en cada cambio; comprobamos la última llamada
    expect(onCambiar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        frecuencia: { minKhz: 2400000, maxKhz: 2500000 },
      })
    );
  });

  it("ancho de banda en kHz/MHz llama a onCambiar en kHz", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    const inputAnchoMin = screen.getByLabelText(/ancho mínimo/i);
    const inputAnchoMax = screen.getByLabelText(/ancho máximo/i);
    const selectUnidadAncho = screen.getByLabelText(/unidad de ancho/i);
    fireEvent.change(inputAnchoMin, { target: { value: "20" } });
    fireEvent.change(inputAnchoMax, { target: { value: "40" } });
    fireEvent.change(selectUnidadAncho, { target: { value: "MHz" } });
    expect(onCambiar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ancho: { minKhz: 20000, maxKhz: 40000 },
      })
    );
  });

  it("casillas de capa (propia, pública, comunidad, privada, externa) llaman a onCambiar", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    CAPAS_RED.forEach((capa) => {
      const etiqueta = ETIQUETA_CAPA[capa];
      const checkbox = screen.getByRole("checkbox", { name: etiqueta });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          capas: expect.arrayContaining([capa]),
        })
      );
    });
  });

  it("casillas de medio y origen llaman a onCambiar", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    MEDIOS.forEach((medio) => {
      const etiqueta = ETIQUETA_MEDIO[medio];
      const checkbox = screen.getByRole("checkbox", { name: etiqueta });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          medios: expect.arrayContaining([medio]),
        })
      );
    });
    ORIGENES.forEach((origen) => {
      const etiqueta = ETIQUETA_ORIGEN[origen];
      const checkbox = screen.getByRole("checkbox", { name: etiqueta });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          origenes: expect.arrayContaining([origen]),
        })
      );
    });
  });

  it("'Solo compatibles con este aparato' llama a onCambiar", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    const checkbox = screen.getByRole("checkbox", { name: /solo compatibles con este aparato/i });
    fireEvent.click(checkbox);
    expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ soloCompatibles: true }));
  });

  it("buscador de texto llama a onCambiar", () => {
    const onCambiar = vi.fn();
    renderPanel({ onCambiar });
    const input = screen.getByRole("searchbox", { name: /buscar/i });
    fireEvent.change(input, { target: { value: "wifi" } });
    expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ texto: "wifi" }));
  });

  it("botón 'Limpiar' devuelve el filtro vacío", () => {
    const onCambiar = vi.fn();
    const filtroConDatos: FiltroSenales = {
      frecuencia: { minKhz: 2400000, maxKhz: 2500000 },
      ancho: { minKhz: 20000, maxKhz: 40000 },
      capas: ["propia"],
      medios: ["wifi"],
      origenes: ["medida"],
      soloCompatibles: true,
      texto: "test",
    };
    render(<PanelFiltrosSenales filtro={filtroConDatos} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />);
    fireEvent.click(screen.getByTestId("btn-limpiar"));
    expect(onCambiar).toHaveBeenLastCalledWith(FILTRO_VACIO);
  });

  it("aviso de señales sin dato de frecuencia aparece cuando ocultasSinDato > 0", () => {
    renderPanel({ ocultasSinDato: 5 });
    expect(screen.getByText(/5 sin dato de frecuencia \(no se pueden filtrar\)/i)).toBeInTheDocument();
  });

  it("aviso de señales sin dato NO aparece cuando ocultasSinDato = 0", () => {
    renderPanel({ ocultasSinDato: 0 });
    expect(screen.queryByText(/sin dato de frecuencia/i)).not.toBeInTheDocument();
  });

  it("controles tienen diana mínima de 44px (clases de tamaño táctil)", () => {
    renderPanel();
    const botones = screen.getAllByRole("button");
    botones.forEach((btn) => {
      expect(btn).toHaveClass("min-h-11");
    });
    const inputs = screen.getAllByRole("spinbutton");
    inputs.forEach((input) => {
      expect(input).toHaveClass("h-10");
    });
    // Los checkboxes están dentro de labels con min-h-11 (44px) - comprobamos el padre del checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => {
      const label = cb.closest("label");
      expect(label).toHaveClass("min-h-11");
    });
  });

  it("panel es usable a 360px (sin overflow horizontal)", () => {
    const { container } = renderPanel();
    expect(container).not.toHaveStyle("overflow-x: scroll");
    expect(container).not.toHaveStyle("overflow-x: auto");
  });
});