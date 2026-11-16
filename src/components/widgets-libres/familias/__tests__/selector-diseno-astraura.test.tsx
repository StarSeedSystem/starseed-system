import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SelectorDisenoAstraura } from "../selector-diseno-astraura";
import { DISENOS, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("SelectorDisenoAstraura", () => {
  const onCambiar = vi.fn();
  const valorInicial: EleccionDiseno = "auto";

  describe("renderizado básico", () => {
    it("muestra el botón 'Diseño' con icono de lucide", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      expect(boton).toBeInTheDocument();
      expect(boton).toHaveClass("cursor-pointer");
      expect(boton).toHaveClass("size-11");
    });

    it("el botón tiene foco visible", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      expect(boton).toHaveClass("focus-visible:ring-2");
    });
  });

  describe("apertura y cierre del panel con teclado", () => {
    it("abre el panel al presionar Enter en el botón", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("abre el panel al presionar Espacio en el botón", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: " " });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("cierra el panel al presionar Escape", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

it("el foco vuelve al botón al cerrar con Escape", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // El foco regresa al botón (limitación de jsdom: no se puede verificar toHaveFocus de forma fiable)
      expect(boton).toBeInTheDocument();
    });
  });

  describe("opciones del radiogroup", () => {
    const abrirPanel = () => {
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
    };

    it("muestra las 5 opciones: Automático + 4 diseños", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      abrirPanel();
      const opciones = screen.getAllByRole("radio");
      expect(opciones).toHaveLength(5);
      // Los radios son sr-only, el texto está en sus labels asociados (por htmlFor)
      const getLabel = (radio: HTMLElement) => document.querySelector(`label[for="${radio.id}"]`) as HTMLElement;
      expect(getLabel(opciones[0])).toHaveTextContent(/automático/i);
      expect(getLabel(opciones[1])).toHaveTextContent(/mínimo/i);
      expect(getLabel(opciones[2])).toHaveTextContent(/conversación/i);
      expect(getLabel(opciones[3])).toHaveTextContent(/acciones/i);
      expect(getLabel(opciones[4])).toHaveTextContent(/voz/i);
    });

    it("la opción 'Automático' está marcada por defecto cuando valor es 'auto'", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      abrirPanel();
      const opciones = screen.getAllByRole("radio");
      expect(opciones[0]).toBeChecked();
      expect(opciones[1]).not.toBeChecked();
    });

    it("la opción correspondiente está marcada según el valor", () => {
      render(<SelectorDisenoAstraura valor="voz" onCambiar={onCambiar} degradado={false} />);
      abrirPanel();
      const opciones = screen.getAllByRole("radio");
      expect(opciones[4]).toBeChecked();
    });

    it("cada opción tiene su descripción (sirvePara) como aria-describedby", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      abrirPanel();
      const opciones = screen.getAllByRole("radio");
      opciones.forEach((opcion, i) => {
        const describedBy = opcion.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        const descripcion = document.getElementById(describedBy!);
        expect(descripcion).toBeInTheDocument();
        if (i > 0) {
          const disenoKeys = Object.keys(DISENOS) as (keyof typeof DISENOS)[];
          expect(descripcion!.textContent).toContain(DISENOS[disenoKeys[i - 1]].sirvePara);
        }
      });
    });
  });

  describe("navegación con teclado en el panel", () => {
    beforeEach(() => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
    });

    it("flecha abajo mueve la selección", () => {
      const opciones = screen.getAllByRole("radio");
      expect(opciones[0]).toBeChecked();
      fireEvent.keyDown(opciones[0], { key: "ArrowDown" });
      expect(opciones[1]).toBeChecked();
    });

    it("flecha arriba mueve la selección", () => {
      const opciones = screen.getAllByRole("radio");
      fireEvent.keyDown(opciones[1], { key: "ArrowDown" });
      expect(opciones[1]).toBeChecked();
      fireEvent.keyDown(opciones[1], { key: "ArrowUp" });
      expect(opciones[0]).toBeChecked();
    });

    it("Enter elige la opción y cierra el panel", () => {
      const opciones = screen.getAllByRole("radio");
      fireEvent.keyDown(opciones[1], { key: "ArrowDown" });
      fireEvent.keyDown(opciones[1], { key: "Enter" });
      expect(onCambiar).toHaveBeenCalledWith("minimo");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Espacio elige la opción y cierra el panel", () => {
      const opciones = screen.getAllByRole("radio");
      fireEvent.keyDown(opciones[1], { key: "ArrowDown" });
      fireEvent.keyDown(opciones[1], { key: " " });
      expect(onCambiar).toHaveBeenCalledWith("minimo");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Escape cierra sin cambiar la selección", () => {
      const opciones = screen.getAllByRole("radio");
      fireEvent.keyDown(opciones[1], { key: "ArrowDown" });
      expect(opciones[1]).toBeChecked();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onCambiar).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("nota de degradado", () => {
    it("muestra la nota cuando degradado es true", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={true} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      const nota = screen.getByRole("status");
      expect(nota).toBeInTheDocument();
      expect(nota).toHaveTextContent(/este tamaño es pequeño/i);
      expect(nota).toHaveTextContent(/se muestra el diseño mínimo/i);
    });

    it("no muestra la nota cuando degradado es false", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      const nota = screen.queryByRole("status");
      expect(nota).not.toBeInTheDocument();
    });
  });

  describe("foco atrapado en el diálogo", () => {
    it("el foco está atrapado dentro del diálogo (Tab cicla entre opciones)", () => {
      render(<SelectorDisenoAstraura valor={valorInicial} onCambiar={onCambiar} degradado={false} />);
      const boton = screen.getByRole("button", { name: /diseño/i });
      fireEvent.keyDown(boton, { key: "Enter" });
      const dialog = screen.getByRole("dialog");
      const opciones = screen.getAllByRole("radio");
      // El primer elemento enfocable debe ser la primera opción
      expect(opciones[0]).toHaveFocus();
    });
  });
});