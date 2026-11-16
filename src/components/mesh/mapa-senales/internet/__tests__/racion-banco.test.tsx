import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RacionBanco } from "../racion-banco";
import type { AjustesBanco, VentanaBanco } from "@/lib/malla/internet/tipos";

const textosBase = {
  racionDiaria: "Ración diaria",
  programacion: "Programación",
  mb: "MB",
  gb: "GB",
  bancoTitulo: "Modo banco",
};

const extraBase = {
  desde: "Desde",
  hasta: "Hasta",
  limite: "Límite",
};

function bancoPorDefecto(): AjustesBanco {
  return {
    activo: true,
    modo: "diario",
    diarioMb: 500,
    ventanas: [],
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
      banco={props.banco ?? bancoPorDefecto()}
      onCambiar={props.onCambiar ?? onCambiar}
      textos={props.textos ?? textosBase}
      extra={props.extra ?? extraBase}
    />
  );
}

afterEach(() => cleanup());

describe("RacionBanco", () => {
  describe("pestañas", () => {
    it("renderiza dos pestañas accesibles con role=tablist", () => {
      renderRacion();
      const tablist = screen.getByRole("tablist");
      expect(tablist).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Ración diaria/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Programación/i })).toBeInTheDocument();
    });

    it("la pestaña 'ración diaria' está activa por defecto cuando modo es diario", () => {
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "diario" } });
      expect(screen.getByRole("tab", { name: /Ración diaria/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Programación/i })).toHaveAttribute("aria-selected", "false");
    });

    it("la pestaña 'programación' está activa cuando modo es programado", () => {
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado" } });
      expect(screen.getByRole("tab", { name: /Programación/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Ración diaria/i })).toHaveAttribute("aria-selected", "false");
    });

    it("cambiar de pestaña llama a onCambiar con el nuevo modo", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: bancoPorDefecto(), onCambiar });
      fireEvent.click(screen.getByRole("tab", { name: /Programación/i }));
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ modo: "programado" }));
    });

    it("cambiar de pestaña mantiene los datos de ración diaria", () => {
      const onCambiar = vi.fn();
      const bancoInicial = { ...bancoPorDefecto(), diarioMb: 1234 };
      renderRacion({ banco: bancoInicial, onCambiar });
      fireEvent.click(screen.getByRole("tab", { name: /Programación/i }));
      fireEvent.click(screen.getByRole("tab", { name: /Ración diaria/i }));
      expect(onCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ diarioMb: 1234 }));
    });

    it("cambiar de pestaña mantiene las ventanas de programación", () => {
      const onCambiar = vi.fn();
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      const bancoInicial: AjustesBanco = { ...bancoPorDefecto(), modo: "programado", ventanas };
      renderRacion({ banco: bancoInicial, onCambiar });
      fireEvent.click(screen.getByRole("tab", { name: /Ración diaria/i }));
      fireEvent.click(screen.getByRole("tab", { name: /Programación/i }));
      expect(onCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ ventanas }));
    });
  });

  describe("pestaña ración diaria", () => {
    it("muestra input numérico y selector MB/GB", () => {
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 2000 } });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      expect(input).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /unidad/i })).toBeInTheDocument();
    });

it("2 GB se guarda como 2000 MB", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 500 }, onCambiar });
      const select = screen.getByRole("combobox", { name: /unidad/i });
      fireEvent.change(select, { target: { value: "gb" } });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      fireEvent.change(input, { target: { value: "2" } });
      fireEvent.blur(input);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ diarioMb: 2000 }));
    });

    it("acepta decimal con coma y lo convierte a punto", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 500 }, onCambiar });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      fireEvent.change(input, { target: { value: "1,5" } });
      fireEvent.blur(input);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ diarioMb: 2 }));
    });

    it("acepta decimal con punto", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 500 }, onCambiar });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      fireEvent.change(input, { target: { value: "2.5" } });
      fireEvent.blur(input);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ diarioMb: 3 }));
    });

    it("cero es valor válido", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 0 }, onCambiar });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      expect(input).toHaveValue("0");
    });

    it("no permite valores negativos", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), diarioMb: 500 }, onCambiar });
      const input = screen.getByRole("spinbutton", { name: /Ración diaria/i });
      fireEvent.change(input, { target: { value: "-10" } });
      fireEvent.blur(input);
      expect(onCambiar).not.toHaveBeenCalledWith(expect.objectContaining({ diarioMb: -10000 }));
    });
  });

  describe("pestaña programación", () => {
    it("muestra lista de ventanas con campos desde/hasta/horaDesde/horaHasta/límite", () => {
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas } });
      expect(screen.getByLabelText("Desde")).toBeInTheDocument();
      expect(screen.getByLabelText("Hasta")).toBeInTheDocument();
      expect(screen.getByLabelText("Hora desde")).toBeInTheDocument();
      expect(screen.getByLabelText("Hora hasta")).toBeInTheDocument();
      expect(screen.getByLabelText("Límite")).toBeInTheDocument();
    });

    it("botón añadir ventana con etiqueta accesible", () => {
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas: [] } });
      const btnAnadir = screen.getByRole("button", { name: /añadir ventana/i });
      expect(btnAnadir).toBeInTheDocument();
    });

    it("añadir ventana agrega una ventana por defecto y llama a onCambiar", () => {
      const onCambiar = vi.fn();
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas: [] }, onCambiar });
      fireEvent.click(screen.getByRole("button", { name: /añadir ventana/i }));
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({
        ventanas: expect.arrayContaining([
          expect.objectContaining({ desde: "", hasta: "", horaDesde: "00:00", horaHasta: "23:59", limiteMb: 0 }),
        ]),
      }));
    });

    it("botón quitar ventana con etiqueta accesible por ventana", () => {
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas } });
      const btnQuitar = screen.getByRole("button", { name: /quitar ventana 1/i });
      expect(btnQuitar).toBeInTheDocument();
    });

    it("quitar ventana elimina esa ventana y llama a onCambiar", () => {
      const onCambiar = vi.fn();
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
        { desde: "2024-02-01", hasta: "2024-11-30", horaDesde: "09:00", horaHasta: "18:00", limiteMb: 200 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas }, onCambiar });
      fireEvent.click(screen.getByRole("button", { name: /quitar ventana 1/i }));
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({
        ventanas: expect.arrayContaining([
          expect.objectContaining({ limiteMb: 200 }),
        ]),
      }));
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({
        ventanas: expect.not.arrayContaining([
          expect.objectContaining({ limiteMb: 100 }),
        ]),
      }));
    });

    it("tope de 12 ventanas: no muestra botón añadir cuando hay 12", () => {
      const onCambiar = vi.fn();
      const doceVentanas: VentanaBanco[] = Array.from({ length: 12 }, (_, i) => ({
        desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "00:00", horaHasta: "23:59", limiteMb: 100 + i,
      }));
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas: doceVentanas }, onCambiar });
      expect(screen.queryByRole("button", { name: /añadir ventana/i })).not.toBeInTheDocument();
    });

    it("cambiar límite en MB/GB guarda en MB", () => {
      const onCambiar = vi.fn();
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas }, onCambiar });
      const select = screen.getByRole("combobox", { name: /unidad límite/i });
      fireEvent.change(select, { target: { value: "gb" } });
      const inputLimite = screen.getByRole("spinbutton", { name: /Límite/i });
      fireEvent.change(inputLimite, { target: { value: "2" } });
      fireEvent.blur(inputLimite);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({
        ventanas: expect.arrayContaining([expect.objectContaining({ limiteMb: 2000 })]),
      }));
    });
  });

  describe("accesibilidad y responsive", () => {
    it("inputs de fecha usan type=date", () => {
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas } });
      const inputDesde = screen.getByLabelText("Desde");
      expect(inputDesde).toHaveAttribute("type", "date");
      const inputHasta = screen.getByLabelText("Hasta");
      expect(inputHasta).toHaveAttribute("type", "date");
    });

    it("inputs de hora usan type=time", () => {
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas } });
      const inputHoraDesde = screen.getByLabelText("Hora desde");
      expect(inputHoraDesde).toHaveAttribute("type", "time");
      const inputHoraHasta = screen.getByLabelText("Hora hasta");
      expect(inputHoraHasta).toHaveAttribute("type", "time");
    });

    it("usa los textos inyectados, no hardcodeados", () => {
      const textosCustom = {
        racionDiaria: "Cuota diaria",
        programacion: "Horarios",
        mb: "MB",
        gb: "GB",
        bancoTitulo: "Banco de datos",
      };
      renderRacion({ textos: textosCustom });
      expect(screen.getByRole("tab", { name: /Cuota diaria/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Horarios/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /MB/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /GB/i })).toBeInTheDocument();
    });

    it("usa etiquetas extra para las ventanas", () => {
      const extraCustom = { desde: "Inicio", hasta: "Fin", limite: "Tope" };
      const ventanas: VentanaBanco[] = [
        { desde: "2024-01-01", hasta: "2024-12-31", horaDesde: "08:00", horaHasta: "20:00", limiteMb: 100 },
      ];
      renderRacion({ banco: { ...bancoPorDefecto(), modo: "programado", ventanas }, extra: extraCustom });
      expect(screen.getByLabelText("Inicio")).toBeInTheDocument();
      expect(screen.getByLabelText("Fin")).toBeInTheDocument();
      expect(screen.getByLabelText("Tope")).toBeInTheDocument();
    });

    it("elementos interactivos tienen cursor-pointer", () => {
      renderRacion();
      const tab = screen.getByRole("tab", { name: /Ración diaria/i });
      expect(tab).toHaveClass("cursor-pointer");
    });
  });
});