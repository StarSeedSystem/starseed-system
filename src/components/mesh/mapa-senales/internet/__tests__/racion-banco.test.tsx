import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RacionBanco } from "../racion-banco";
import type { AjustesBanco, VentanaBanco } from "@/lib/malla/internet/tipos";

const textosBase = {
  bancoTitulo: "Modo banco",
  racionDiaria: "Ración diaria",
  programacion: "Programación",
  mb: "MB",
  gb: "GB",
};

const extraBase = {
  desde: "Desde",
  hasta: "Hasta",
  limite: "Límite",
};

const VENTANA_DEFECTO: VentanaBanco = {
  desde: "",
  hasta: "",
  horaDesde: "00:00",
  horaHasta: "23:59",
  limiteMb: 0,
};

function crearBanco(sobrescrituras: Partial<AjustesBanco> = {}): AjustesBanco {
  return {
    activo: false,
    modo: "diario",
    diarioMb: 0,
    ventanas: [],
    ...sobrescrituras,
  };
}

function renderRacion(props: Partial<{
  banco: AjustesBanco;
  onCambiar: (b: AjustesBanco) => void;
  textos: typeof textosBase;
  extra: typeof extraBase;
}> = {}) {
  const onCambiar = vi.fn();
  return render(
    <RacionBanco
      banco={props.banco ?? crearBanco()}
      onCambiar={props.onCambiar ?? onCambiar}
      textos={props.textos ?? textosBase}
      extra={props.extra ?? extraBase}
    />
  );
}

afterEach(() => cleanup());

describe("RacionBanco", () => {
  describe("estructura de pestañas", () => {
    it("renderiza el tablist con dos pestañas accesibles", () => {
      renderRacion();
      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Ración diaria/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Programación/i })).toBeInTheDocument();
    });

    it("la primera pestaña (ración diaria) está activa por defecto", () => {
      renderRacion();
      const tabRacion = screen.getByRole("tab", { name: /Ración diaria/i });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      expect(tabRacion).toHaveAttribute("aria-selected", "true");
      expect(tabProgramacion).toHaveAttribute("aria-selected", "false");
    });

    it("cambia de pestaña al hacer clic", () => {
      renderRacion();
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      expect(tabProgramacion).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Ración diaria/i })).toHaveAttribute("aria-selected", "false");
    });

    it("navega entre pestañas con teclado (flechas)", () => {
      renderRacion();
      const tabRacion = screen.getByRole("tab", { name: /Ración diaria/i });
      fireEvent.keyDown(tabRacion, { key: "ArrowRight" });
      expect(screen.getByRole("tab", { name: /Programación/i })).toHaveAttribute("aria-selected", "true");
      fireEvent.keyDown(screen.getByRole("tab", { name: /Programación/i }), { key: "ArrowLeft" });
      expect(tabRacion).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("pestaña: ración diaria", () => {
    it("muestra input numérico y selector MB/GB", () => {
      renderRacion();
      expect(screen.getByLabelText(/Ración diaria/i)).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /MB|GB/i })).toBeInTheDocument();
    });

    it("guarda 2 GB como 2000 MB en onCambiar", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      const select = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      fireEvent.change(input, { target: { value: "2" } });
      fireEvent.change(select, { target: { value: "GB" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 2000 })
      );
    });

    it("acepta coma decimal y la convierte a punto (con unidad GB)", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      const select = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "GB" } });
      fireEvent.change(input, { target: { value: "1,5" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 1500 })
      );
    });

    it("acepta punto decimal (con unidad GB)", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      const select = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "GB" } });
      fireEvent.change(input, { target: { value: "1.5" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 1500 })
      );
    });

    it("no permite valores negativos (emite 0)", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "-10" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 0 })
      );
    });

    it("no emite valores que el almacén rechazaría (Number.isFinite y >= 0)", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "abc" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 0 })
      );
    });

    it("muestra el valor actual en MB cuando el banco tiene datos", () => {
      renderRacion({ banco: crearBanco({ diarioMb: 2000 }) });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      expect(input.value).toBe("2");
      const select = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      expect(select.value).toBe("GB");
    });

    it("cambiar unidad de GB a MB actualiza el valor mostrado", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: crearBanco({ diarioMb: 2000 }), onCambiar });
      const select = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "MB" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ diarioMb: 2000 })
      );
    });
  });

  describe("pestaña: programación", () => {
    it("muestra lista vacía inicialmente", () => {
      renderRacion();
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      expect(screen.queryByRole("listbox")).toBeInTheDocument();
      expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("botón añadir ventana crea una nueva ventana con valores por defecto", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const btnAnadir = screen.getByRole("button", { name: /añadir ventana/i });
      fireEvent.click(btnAnadir);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          modo: "programado",
          ventanas: expect.arrayContaining([
            expect.objectContaining(VENTANA_DEFECTO),
          ]),
        })
      );
    });

    it("muestra la ventana añadida con inputs de fecha, hora y límite", () => {
      const onCambiar = vi.fn();
      renderRacion({ onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      fireEvent.click(screen.getByRole("button", { name: /añadir ventana/i }));
      expect(screen.getByLabelText(/Desde/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Hasta/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Hora desde/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Hora hasta/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Límite/i)).toBeInTheDocument();
    });

    it("botón quitar ventana elimina esa ventana específica", () => {
      const onCambiar = vi.fn();
      const bancoConVentana = crearBanco({
        modo: "programado",
        ventanas: [VENTANA_DEFECTO, VENTANA_DEFECTO],
      });
      renderRacion({ banco: bancoConVentana, onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const botonesQuitar = screen.getAllByRole("button", { name: /Quitar ventana/i });
      fireEvent.click(botonesQuitar[0]);
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          ventanas: expect.arrayContaining([expect.objectContaining(VENTANA_DEFECTO)]),
        })
      );
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({ ventanas: expect.arrayContaining([expect.anything()]) })
      );
    });

    it("cambiar fecha desde/hasta actualiza la ventana", () => {
      const onCambiar = vi.fn();
      const bancoConVentana = crearBanco({
        modo: "programado",
        ventanas: [{ ...VENTANA_DEFECTO }],
      });
      renderRacion({ banco: bancoConVentana, onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const inputDesde = screen.getByLabelText(/Desde/i) as HTMLInputElement;
      fireEvent.change(inputDesde, { target: { value: "2026-12-01" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({ desde: "2026-12-01" }),
          ]),
        })
      );
    });

    it("cambiar hora desde/hasta actualiza la ventana", () => {
      const onCambiar = vi.fn();
      const bancoConVentana = crearBanco({
        modo: "programado",
        ventanas: [{ ...VENTANA_DEFECTO }],
      });
      renderRacion({ banco: bancoConVentana, onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const inputHoraDesde = screen.getByLabelText(/Hora desde/i) as HTMLInputElement;
      fireEvent.change(inputHoraDesde, { target: { value: "08:00" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({ horaDesde: "08:00" }),
          ]),
        })
      );
    });

    it("cambiar límite con coma decimal lo guarda en MB", () => {
      const onCambiar = vi.fn();
      const bancoConVentana = crearBanco({
        modo: "programado",
        ventanas: [{ ...VENTANA_DEFECTO }],
      });
      renderRacion({ banco: bancoConVentana, onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const inputLimite = screen.getByLabelText(/Límite/i) as HTMLInputElement;
      const selectUnidad = screen.getByRole("combobox", { name: /MB|GB/i }) as HTMLSelectElement;
      fireEvent.change(selectUnidad, { target: { value: "GB" } });
      fireEvent.change(inputLimite, { target: { value: "1,5" } });
      expect(onCambiar).toHaveBeenCalledWith(
        expect.objectContaining({
          ventanas: expect.arrayContaining([
            expect.objectContaining({ limiteMb: 1500 }),
          ]),
        })
      );
    });

    it("no permite más de 12 ventanas", () => {
      const onCambiar = vi.fn();
      const doceVentanas = Array.from({ length: 12 }, () => ({ ...VENTANA_DEFECTO }));
      const bancoCon12 = crearBanco({ modo: "programado", ventanas: doceVentanas });
      renderRacion({ banco: bancoCon12, onCambiar });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const btnAnadir = screen.getByRole("button", { name: /añadir ventana/i });
      fireEvent.click(btnAnadir);
      expect(onCambiar).not.toHaveBeenCalledWith(
        expect.objectContaining({ ventanas: expect.arrayContaining([expect.anything()]) })
      );
      expect(btnAnadir).toBeDisabled();
    });

    it("cada ventana tiene botón quitar con etiqueta accesible única", () => {
      const bancoCon2 = crearBanco({
        modo: "programado",
        ventanas: [{ ...VENTANA_DEFECTO }, { ...VENTANA_DEFECTO }],
      });
      renderRacion({ banco: bancoCon2 });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const botonesQuitar = screen.getAllByRole("button", { name: /Quitar ventana/i });
      expect(botonesQuitar).toHaveLength(2);
      botonesQuitar.forEach((btn) => {
        expect(btn).toHaveAttribute("aria-label");
        expect(btn.getAttribute("aria-label")!.length).toBeGreaterThan(0);
      });
    });
  });

  describe("persistencia al cambiar de pestaña", () => {
    it("cambiar a programación y volver a ración mantiene el valor diario", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: crearBanco({ diarioMb: 1500 }), onCambiar });
      const input = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      expect(input.value).toBe("1.5");
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      const tabRacion = screen.getByRole("tab", { name: /Ración diaria/i });
      fireEvent.click(tabRacion);
      const inputDespues = screen.getByLabelText(/Ración diaria/i) as HTMLInputElement;
      expect(inputDespues.value).toBe("1.5");
    });

    it("cambiar a ración y volver a programación mantiene las ventanas", () => {
      const bancoConVentanas = crearBanco({
        modo: "programado",
        ventanas: [{ ...VENTANA_DEFECTO, desde: "2026-12-01", limiteMb: 1000 }],
      });
      renderRacion({ banco: bancoConVentanas });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      expect(screen.getByLabelText(/Desde/i)).toHaveValue("2026-12-01");
      const tabRacion = screen.getByRole("tab", { name: /Ración diaria/i });
      fireEvent.click(tabRacion);
      fireEvent.click(tabProgramacion);
      expect(screen.getByLabelText(/Desde/i)).toHaveValue("2026-12-01");
    });
  });

  describe("accesibilidad y estilo", () => {
    it("los inputs tienen objetivo táctil de al menos 44px (clase h-11)", () => {
      renderRacion();
      const input = screen.getByLabelText(/Ración diaria/i);
      expect(input).toHaveClass("h-11");
    });

    it("usa los textos inyectados, no hardcodeados", () => {
      const textosCustom = {
        bancoTitulo: "Ahorro",
        racionDiaria: "Cuota diaria",
        programacion: "Horarios",
        mb: "Megas",
        gb: "Gigas",
      };
      renderRacion({ textos: textosCustom });
      expect(screen.getByRole("tab", { name: /Cuota diaria/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Horarios/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Cuota diaria/i)).toBeInTheDocument();
    });

    it("usa los textos extra inyectados para etiquetas de ventana", () => {
      const extraCustom = { desde: "Inicio", hasta: "Fin", limite: "Tope" };
      renderRacion({ extra: extraCustom });
      const tabProgramacion = screen.getByRole("tab", { name: /Programación/i });
      fireEvent.click(tabProgramacion);
      fireEvent.click(screen.getByRole("button", { name: /añadir ventana/i }));
      expect(screen.getByLabelText(/Inicio/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Fin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Tope/i)).toBeInTheDocument();
    });

    it("tiene foco visible en elementos interactivos", () => {
      renderRacion();
      const tab = screen.getByRole("tab", { name: /Ración diaria/i });
      expect(tab).toHaveClass("focus-visible:ring-2");
    });

    it("no usa color como único indicador de estado", () => {
      renderRacion();
      const tabActiva = screen.getByRole("tab", { name: /Ración diaria/i });
      expect(tabActiva).toHaveAttribute("aria-selected", "true");
      const tabInactiva = screen.getByRole("tab", { name: /Programación/i });
      expect(tabInactiva).toHaveAttribute("aria-selected", "false");
    });
  });
});