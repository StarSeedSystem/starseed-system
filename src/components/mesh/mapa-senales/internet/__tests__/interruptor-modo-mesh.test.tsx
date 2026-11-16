import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InterruptorModoMesh } from "../interruptor-modo-mesh";
import type { Audiencia, AjustesAudiencia } from "@/lib/malla/internet/tipos";

const textosBase = {
  meshTitulo: "Compartir por malla",
  meshAyuda: "Permite compartir internet por la red mesh P2P",
  meshSinLimite: "Sin límite",
  meshConLimite: (mb: number) => `${mb.toLocaleString()} MB disponibles`,
  audMiCuenta: "Neuronas de mi cuenta",
  audEntidad: "Miembros de una entidad",
  audPublico: "Público",
  mb: "MB",
  gb: "GB",
};

function crearValor(mesh: boolean, limiteMeshMb: number | null): AjustesAudiencia {
  return { mesh, limiteMeshMb };
}

function renderInterruptor(props: Partial<{
  audiencia: Audiencia;
  valor: AjustesAudiencia;
  onCambiar: (v: AjustesAudiencia) => void;
  textos: typeof textosBase;
}> = {}) {
  const onCambiar = vi.fn();
  const audiencia = props.audiencia ?? "mi-cuenta";
  const valor = props.valor ?? crearValor(false, null);
  return render(
    <InterruptorModoMesh
      audiencia={audiencia}
      valor={valor}
      onCambiar={props.onCambiar ?? onCambiar}
      textos={props.textos ?? textosBase}
    />
  );
}

afterEach(() => cleanup());

describe("InterruptorModoMesh", () => {
  describe("renderizado básico", () => {
    it("renderiza el switch con la etiqueta accesible del título de la audiencia", () => {
      renderInterruptor({ audiencia: "mi-cuenta" });
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      expect(switchEl).toBeInTheDocument();
    });

    it("renderiza el switch con etiqueta para audiencia 'entidad'", () => {
      renderInterruptor({ audiencia: "entidad" });
      const switchEl = screen.getByRole("switch", { name: /Miembros de una entidad/i });
      expect(switchEl).toBeInTheDocument();
    });

    it("renderiza el switch con etiqueta para audiencia 'publico'", () => {
      renderInterruptor({ audiencia: "publico" });
      const switchEl = screen.getByRole("switch", { name: /Público/i });
      expect(switchEl).toBeInTheDocument();
    });

    it("tiene aria-describedby enlazado al texto de ayuda", () => {
      renderInterruptor();
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      const describedBy = switchEl.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const ayudaEl = document.getElementById(describedBy!);
      expect(ayudaEl).toHaveTextContent(/Permite compartir internet/i);
    });

    it("muestra el título meshTitulo como texto principal", () => {
      renderInterruptor();
      expect(screen.getByText(/Compartir por malla/i)).toBeInTheDocument();
    });
  });

  describe("estado inicial apagado", () => {
    it("no muestra el radiogroup cuando está apagado", () => {
      renderInterruptor({ valor: crearValor(false, null) });
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });

    it("no muestra opciones de límite cuando está apagado", () => {
      renderInterruptor({ valor: crearValor(false, 500) });
      expect(screen.queryByRole("radio", { name: /Sin límite/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: /Con tope/i })).not.toBeInTheDocument();
    });
  });

  describe("estado encendido", () => {
    it("muestra el radiogroup cuando se enciende", () => {
      renderInterruptor({ valor: crearValor(true, null) });
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    });

    it("muestra la opción 'sin límite' seleccionada cuando limiteMeshMb es null", () => {
      renderInterruptor({ valor: crearValor(true, null) });
      const sinLimite = screen.getByRole("radio", { name: /^Sin límite$/i });
      expect(sinLimite).toBeChecked();
      const conLimite = screen.getByRole("radio", { name: /Con tope/i });
      expect(conLimite).not.toBeChecked();
    });

    it("muestra la opción 'con tope' seleccionada cuando hay límite", () => {
      renderInterruptor({ valor: crearValor(true, 1024) });
      const sinLimite = screen.getByRole("radio", { name: /^Sin límite$/i });
      expect(sinLimite).not.toBeChecked();
      const conLimite = screen.getByRole("radio", { name: /Con tope/i });
      expect(conLimite).toBeChecked();
    });

    it("resumen muestra meshSinLimite cuando es sin límite", () => {
      renderInterruptor({ valor: crearValor(true, null) });
      const resumen = screen.getByRole("radio", { name: /^Sin límite$/i }).closest("button")!.querySelector('[aria-hidden="true"].text-emerald-300');
      expect(resumen).toHaveTextContent(/^Sin límite$/);
    });

    it("resumen muestra meshConLimite(mb) cuando hay tope", () => {
      renderInterruptor({ valor: crearValor(true, 2048) });
      expect(screen.getByText(/2.048 MB disponibles/i)).toBeInTheDocument();
    });
  });

  describe("interacción: encender y apagar", () => {
    it("llama a onCambiar con mesh=true al hacer clic en el switch apagado", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(false, null), onCambiar });
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      fireEvent.click(switchEl);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ mesh: true }));
    });

    it("llama a onCambiar con mesh=false al hacer clic en el switch encendido", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, 500), onCambiar });
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      fireEvent.click(switchEl);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ mesh: false }));
    });

    it("conserva el límite al apagar el interruptor", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, 1024), onCambiar });
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      fireEvent.click(switchEl);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ mesh: false, limiteMeshMb: 1024 }));
    });
  });

  describe("interacción: cambiar entre sin límite y con tope", () => {
    it("cambia de sin límite a con tope al hacer clic en la opción", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, null), onCambiar });
      const conLimite = screen.getByRole("radio", { name: /Con tope/i });
      fireEvent.click(conLimite);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ mesh: true, limiteMeshMb: expect.any(Number) }));
    });

    it("cambia de con tope a sin límite al hacer clic en la opción", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, 1024), onCambiar });
      const sinLimite = screen.getByRole("radio", { name: /^Sin límite$/i });
      fireEvent.click(sinLimite);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ mesh: true, limiteMeshMb: null }));
    });

    it("al cambiar a con tope, usa un valor por defecto razonable (1024 MB)", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, null), onCambiar });
      const conLimite = screen.getByRole("radio", { name: /Con tope/i });
      fireEvent.click(conLimite);
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ limiteMeshMb: 1024 }));
    });
  });

  describe("navegación por teclado", () => {
    it("flecha derecha cambia de sin límite a con tope", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, null), onCambiar });
      const sinLimite = screen.getByRole("radio", { name: /^Sin límite$/i });
      fireEvent.keyDown(sinLimite, { key: "ArrowRight" });
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ limiteMeshMb: expect.any(Number) }));
    });

    it("flecha izquierda cambia de con tope a sin límite", () => {
      const onCambiar = vi.fn();
      renderInterruptor({ valor: crearValor(true, 1024), onCambiar });
      const conLimite = screen.getByRole("radio", { name: /Con tope/i });
      fireEvent.keyDown(conLimite, { key: "ArrowLeft" });
      expect(onCambiar).toHaveBeenCalledWith(expect.objectContaining({ limiteMeshMb: null }));
    });
  });

  describe("accesibilidad y estilo", () => {
    it("el label contenedor tiene clases para objetivo táctil de al menos 44px", () => {
      renderInterruptor();
      const labelEl = screen.getByText(/Neuronas de mi cuenta/i).closest("label")!;
      expect(labelEl).toHaveClass("py-2");
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      expect(switchEl).toHaveClass("h-6");
    });

    it("tiene foco visible (focus-visible:ring)", () => {
      renderInterruptor();
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      expect(switchEl).toHaveClass("focus-visible:ring-2");
    });

    it("no usa color como único indicador (tiene thumb visible)", () => {
      renderInterruptor();
      const switchEl = screen.getByRole("switch", { name: /Neuronas de mi cuenta/i });
      const thumb = switchEl.querySelector('[data-state]');
      expect(thumb).toBeInTheDocument();
    });

    it("usa los textos inyectados, no textos hardcodeados", () => {
      const textosCustom = {
        ...textosBase,
        meshTitulo: "Malla P2P",
        meshAyuda: "Compartir conexión via mesh",
        meshSinLimite: "Ilimitado",
        meshConLimite: (mb: number) => `Tope: ${mb} MB`,
        audMiCuenta: "Mis neuronas",
        audEntidad: "Mi organización",
        audPublico: "Todos",
      };
      renderInterruptor({ textos: textosCustom, audiencia: "entidad", valor: crearValor(true, 512) });
      const switchEl = screen.getByRole("switch", { name: /Mi organización/i });
      expect(switchEl).toBeInTheDocument();
      const ayudaId = switchEl.getAttribute("aria-describedby");
      const ayudaEl = document.getElementById(ayudaId!);
      expect(ayudaEl).toHaveTextContent(/Compartir conexión via mesh/i);
      expect(screen.getByText(/Ilimitado/i)).toBeInTheDocument();
      expect(screen.getByText(/Tope: 512 MB/i)).toBeInTheDocument();
    });
  });
});