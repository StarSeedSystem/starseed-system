import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppearanceProvider } from "@/context/appearance-context";
import { PanelFiltrosSenales } from "../panel-filtros-senales";
import { FILTRO_VACIO } from "@/lib/senales/espectro/filtros";

function renderPanel(props: Partial<{
  filtro: typeof FILTRO_VACIO;
  onCambiar: (f: typeof FILTRO_VACIO) => void;
  visibles: number;
  ocultasSinDato: number;
}> = {}) {
  const onCambiar = vi.fn();
  return render(
    <AppearanceProvider>
      <PanelFiltrosSenales
        filtro={props.filtro ?? FILTRO_VACIO}
        onCambiar={props.onCambiar ?? onCambiar}
        visibles={props.visibles ?? 10}
        ocultasSinDato={props.ocultasSinDato ?? 0}
      />
    </AppearanceProvider>
  );
}

afterEach(() => cleanup());

describe("PanelFiltrosSenales", () => {
  it("renderiza el panel con título y resumen de señales", () => {
    renderPanel({ visibles: 12, ocultasSinDato: 3 });
    expect(screen.getByText(/12 de 15 señales/i)).toBeInTheDocument();
    expect(screen.getByText(/3 sin dato de frecuencia \(no se pueden filtrar\)/i)).toBeInTheDocument();
  });

  it("muestra «0 de 0 señales» cuando no hay ninguna", () => {
    renderPanel({ visibles: 0, ocultasSinDato: 0 });
    expect(screen.getByText(/0 de 0 señales/i)).toBeInTheDocument();
  });

  it("no muestra aviso de sin dato cuando ocultasSinDato es 0", () => {
    renderPanel({ visibles: 5, ocultasSinDato: 0 });
    expect(screen.queryByText(/sin dato de frecuencia/i)).not.toBeInTheDocument();
  });

  describe("atajos de banda (frecuencia)", () => {
    it("tiene botones para bandas conocidas: Wi-Fi 2,4 GHz, Wi-Fi 5 GHz, LoRa 868 MHz", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: /Wi-Fi 2,4 GHz/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Wi-Fi 5 GHz/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /LoRa 868 MHz/i })).toBeInTheDocument();
    });

    it("al pulsar un atajo de banda llama a onCambiar con el rango correcto en kHz", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const btn24 = screen.getByRole("button", { name: /Wi-Fi 2,4 GHz/i });
      fireEvent.click(btn24);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          frecuenciaKhz: expect.objectContaining({ desde: 2401000, hasta: 2483000 }),
        })
      );
    });

    it("el atajo de LoRa 868 MHz usa el rango correcto en kHz", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const btn868 = screen.getByRole("button", { name: /LoRa 868 MHz/i });
      fireEvent.click(btn868);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          frecuenciaKhz: expect.objectContaining({ desde: 863000, hasta: 870000 }),
        })
      );
    });
  });

  describe("entrada manual de frecuencia con unidad", () => {
    it("tiene campos para Desde y Hasta con selector de unidad (kHz/MHz/GHz)", () => {
      renderPanel();
      expect(screen.getByLabelText("Frecuencia desde")).toBeInTheDocument();
      expect(screen.getByLabelText("Frecuencia hasta")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Unidad frecuencia desde" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Unidad frecuencia hasta" })).toBeInTheDocument();
    });

    it("cambiar el valor manual llama a onCambiar con kHz correctos", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const inputDesde = screen.getByLabelText("Frecuencia desde");
      fireEvent.change(inputDesde, { target: { value: "2450" } });
      const selectUnidad = screen.getByRole("combobox", { name: "Unidad frecuencia desde" });
      fireEvent.change(selectUnidad, { target: { value: "MHz" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          frecuenciaKhz: expect.objectContaining({ desde: 2450000 }),
        })
      );
    });

    it("unidad GHz convierte correctamente a kHz", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const inputDesde = screen.getByLabelText("Frecuencia desde");
      fireEvent.change(inputDesde, { target: { value: "2450" } });
      const selectUnidad = screen.getByRole("combobox", { name: "Unidad frecuencia desde" });
      fireEvent.change(selectUnidad, { target: { value: "GHz" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          frecuenciaKhz: expect.objectContaining({ desde: 2450000 }),
        })
      );
    });

    it("unidad kHz convierte correctamente", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const inputDesde = screen.getByLabelText("Frecuencia desde");
      fireEvent.change(inputDesde, { target: { value: "2450" } });
      const selectUnidad = screen.getByRole("combobox", { name: "Unidad frecuencia desde" });
      fireEvent.change(selectUnidad, { target: { value: "kHz" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          frecuenciaKhz: expect.objectContaining({ desde: 2450000 }),
        })
      );
    });
  });

  describe("ancho de banda (kHz/MHz)", () => {
    it("tiene campos para ancho Desde y Hasta con selector de unidad", () => {
      renderPanel();
      expect(screen.getByLabelText("Ancho desde")).toBeInTheDocument();
      expect(screen.getByLabelText("Ancho hasta")).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Unidad ancho desde" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Unidad ancho hasta" })).toBeInTheDocument();
    });

    it("cambiar ancho llama a onCambiar con kHz correctos", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const inputDesde = screen.getByLabelText("Ancho desde");
      fireEvent.change(inputDesde, { target: { value: "20000" } });
      const selectUnidad = screen.getByRole("combobox", { name: "Unidad ancho desde" });
      fireEvent.change(selectUnidad, { target: { value: "MHz" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          anchoKhz: expect.objectContaining({ desde: 20000 }),
        })
      );
    });
  });

  describe("casillas de capa (propia, pública, comunidad, privada, externa)", () => {
    it("renderiza switches para las 5 capas", () => {
      renderPanel();
      expect(screen.getByRole("switch", { name: /Capa Propia/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Capa Pública/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Capa Comunidad/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Capa Privada/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Capa Externa/i })).toBeInTheDocument();
    });

    it("cambiar una capa llama a onCambiar con el array correcto", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const checkbox = screen.getByRole("switch", { name: /Capa Pública/i });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          capas: ["publica"],
        })
      );
    });
  });

  describe("casillas de medio y origen", () => {
    it("renderiza switches para medios (wifi, bluetooth, lora, celular, malla, internet, estacion, sdr)", () => {
      renderPanel();
      expect(screen.getByRole("switch", { name: /Medio Wi-Fi/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Medio Bluetooth/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Medio LoRa/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Medio Celular/i })).toBeInTheDocument();
    });

    it("renderiza switches para orígenes (medida, declarada, estimada)", () => {
      renderPanel();
      expect(screen.getByRole("switch", { name: /Origen Medida/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Origen Declarada/i })).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Origen Estimada/i })).toBeInTheDocument();
    });

    it("cambiar medio llama a onCambiar con array correcto", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const checkbox = screen.getByRole("switch", { name: /Medio LoRa/i });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          medios: ["lora"],
        })
      );
    });

    it("cambiar origen llama a onCambiar con array correcto", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const checkbox = screen.getByRole("switch", { name: /Origen Estimada/i });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          origenes: ["estimada"],
        })
      );
    });
  });

  describe("solo compatibles con este aparato", () => {
    it("renderiza switch para compatibilidad", () => {
      renderPanel();
      expect(screen.getByRole("switch", { name: /Solo compatibles con este aparato/i })).toBeInTheDocument();
    });

    it("cambiar compatibilidad llama a onCambiar con true/false", () => {
      const onCambiar = vi.fn();
      let filtroActual = FILTRO_VACIO;
      const { rerender } = render(
        <AppearanceProvider>
          <PanelFiltrosSenales
            filtro={filtroActual}
            onCambiar={(nuevo) => {
              filtroActual = nuevo;
              onCambiar(nuevo);
            }}
            visibles={10}
            ocultasSinDato={0}
          />
        </AppearanceProvider>
      );
      const checkbox = screen.getByRole("switch", { name: /Solo compatibles con este aparato/i });
      fireEvent.click(checkbox);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          soloCompatibles: true,
        })
      );
      rerender(
        <AppearanceProvider>
          <PanelFiltrosSenales
            filtro={filtroActual}
            onCambiar={(nuevo) => {
              filtroActual = nuevo;
              onCambiar(nuevo);
            }}
            visibles={10}
            ocultasSinDato={0}
          />
        </AppearanceProvider>
      );
      fireEvent.click(screen.getByRole("switch", { name: /Solo compatibles con este aparato/i }));
      expect(onCambiar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          soloCompatibles: false,
        })
      );
    });
  });

  describe("buscador de texto", () => {
    it("renderiza input de búsqueda", () => {
      renderPanel();
      expect(screen.getByRole("searchbox", { name: /buscar/i })).toBeInTheDocument();
    });

    it("escribir en buscador llama a onCambiar con el texto", () => {
      const onCambiar = vi.fn();
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={FILTRO_VACIO} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const input = screen.getByRole("searchbox", { name: /buscar/i });
      fireEvent.change(input, { target: { value: "lora" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          texto: "lora",
        })
      );
    });
  });

  describe("botón Limpiar", () => {
    it("renderiza botón Limpiar", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: /limpiar/i })).toBeInTheDocument();
    });

    it("pulsar Limpiar llama a onCambiar con filtro vacío", () => {
      const onCambiar = vi.fn();
      const filtroConDatos = {
        frecuenciaKhz: { desde: 2400000, hasta: 2500000 },
        capas: ["publica"] as const,
        texto: "test",
      };
      render(
        <AppearanceProvider>
          <PanelFiltrosSenales filtro={filtroConDatos} onCambiar={onCambiar} visibles={10} ocultasSinDato={0} />
        </AppearanceProvider>
      );
      const btnLimpiar = screen.getByRole("button", { name: /limpiar/i });
      fireEvent.click(btnLimpiar);
      expect(onCambiar).toHaveBeenCalledWith({});
    });
  });

  describe("accesibilidad y usabilidad", () => {
    it("los switches tienen etiquetas accesibles", () => {
      renderPanel();
      const switches = screen.getAllByRole("switch");
      switches.forEach((sw) => {
        expect(sw).toHaveAttribute("aria-label");
      });
    });

    it("los inputs tienen aria-label", () => {
      renderPanel();
      const inputs = screen.getAllByRole("spinbutton");
      inputs.forEach((input) => {
        expect(input).toHaveAttribute("aria-label");
      });
      const searchbox = screen.getByRole("searchbox");
      expect(searchbox).toHaveAttribute("aria-label");
    });

    it("funciona a 360px (contenedor responsive)", () => {
      renderPanel({ visibles: 5, ocultasSinDato: 2 });
      const panel = screen.getByTestId("panel-filtros-senales");
      expect(panel).toBeInTheDocument();
    });
  });
});